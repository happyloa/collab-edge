'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  serverMessage,
  type Snapshot,
  type Mutation,
  type Command,
  type Presence,
  type BoardEvent,
} from './protocol';
import { applyEvent, optimistic } from './board-reducer';
import {
  listStoredDrafts,
  saveDraft,
  removeDraft,
  type DraftLease,
  draftErrorMessage,
} from '../drafts/store';
export type Pending = {
  mutation: Mutation;
  state: 'pending' | 'failed' | 'conflicted' | 'recovered';
  error?: string;
};
export function useBoard(
  initial: Snapshot,
  actorId: string,
  selectedCardId?: string,
  draftLease: DraftLease | null = null,
) {
  const [confirmed, setConfirmed] = useState(initial);
  const authoritative = useRef(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState('Connecting');
  const [presence, setPresence] = useState<Presence[]>([]);
  const [activity, setActivity] = useState<BoardEvent[]>([]);
  const [error, setError] = useState('');
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [role, setRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER' | null>(null);
  const [draftError, setDraftError] = useState('');
  const draftLeaseRef = useRef(draftLease);
  useEffect(() => {
    draftLeaseRef.current = draftLease;
  }, [draftLease]);
  const persistence = useRef(Promise.resolve());
  const persist = useCallback((action: () => Promise<void>) => {
    const next = persistence.current.then(action);
    persistence.current = next.catch((error) =>
      setDraftError(draftErrorMessage(error)),
    );
    return next;
  }, []);
  const ownPresence = useRef<Pick<Presence, 'status' | 'selectedCardId'>>({
    status: 'active',
  });
  const lastSentPresence = useRef<{ socket: WebSocket; value: string } | null>(
    null,
  );
  const sendPresence = useCallback(() => {
    const ws = socket.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    const value = JSON.stringify({ type: 'presence', ...ownPresence.current });
    if (
      lastSentPresence.current?.socket === ws &&
      lastSentPresence.current.value === value
    )
      return;
    ws.send(value);
    lastSentPresence.current = { socket: ws, value };
  }, []);
  useEffect(() => {
    if (ownPresence.current.selectedCardId === selectedCardId) return;
    ownPresence.current = { ...ownPresence.current, selectedCardId };
    sendPresence();
  }, [selectedCardId, sendPresence]);
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const setPresenceStatus = (status: Presence['status']) => {
      if (ownPresence.current.status === status) return;
      ownPresence.current = { ...ownPresence.current, status };
      sendPresence();
    };
    const active = () => {
      if (document.visibilityState === 'hidden') return;
      setPresenceStatus('active');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setPresenceStatus('idle'), 5 * 60_000);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(idleTimer);
        setPresenceStatus('idle');
      } else active();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointerdown', active);
    window.addEventListener('keydown', active);
    visibility();
    return () => {
      clearTimeout(idleTimer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pointerdown', active);
      window.removeEventListener('keydown', active);
    };
  }, [sendPresence]);
  const updatePending = useCallback(
    (fn: (items: Pending[]) => Pending[]) => {
      const before = pendingRef.current;
      pendingRef.current = fn(pendingRef.current);
      setPending(pendingRef.current);
      const lease = draftLeaseRef.current;
      if (!lease) return;
      const after = pendingRef.current;
      for (const item of before) {
        const next = after.find(
          (entry) =>
            entry.mutation.clientMutationId === item.mutation.clientMutationId,
        );
        if (!next)
          void persist(() =>
            removeDraft(lease, item.mutation.clientMutationId),
          ).catch(() => {});
        else if (next !== item && next.state !== 'recovered')
          void persist(() =>
            saveDraft(lease, {
              kind: 'mutation',
              version: 1,
              id: next.mutation.clientMutationId,
              ownerId: actorId,
              boardId: initial.board.id,
              mutation: next.mutation,
              state: next.state === 'recovered' ? 'pending' : next.state,
              error: next.error?.slice(0, 1000),
              updatedAt: Date.now(),
            }),
          ).catch(() => {});
      }
    },
    [actorId, initial.board.id, persist],
  );
  useEffect(() => {
    if (!draftLease) return;
    let active = true;
    void listStoredDrafts(draftLease, initial.board.id)
      .then((entries) => {
        if (!active) return;
        const restored: Pending[] = entries
          .filter((entry) => entry.kind === 'mutation')
          .map((entry) => ({
            mutation: entry.mutation,
            state: entry.state === 'pending' ? 'recovered' : entry.state,
            error: entry.error,
          }));
        updatePending((items) => [
          ...items,
          ...restored.filter(
            (entry) =>
              !items.some(
                (item) =>
                  item.mutation.clientMutationId ===
                  entry.mutation.clientMutationId,
              ),
          ),
        ]);
      })
      .catch((error) => {
        if (active) setDraftError(draftErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [draftLease, initial.board.id, updatePending]);
  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const connect = () => {
      if (stopped) return;
      if (!navigator.onLine) {
        setStatus('Offline');
        return;
      }
      setStatus('Connecting');
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/realtime/${initial.board.id}`,
      );
      socket.current = ws;
      lastSentPresence.current = {
        socket: ws,
        value: JSON.stringify({ type: 'presence', status: 'active' }),
      };
      let targetRevision = -1;
      let rejectedIdentity = false;
      let lastMessageAt = Date.now();
      const synchronize = () => {
        if (authoritative.current.board.revision < targetRevision) return;
        setStatus('Connected');
        for (const item of pendingRef.current)
          if (item.state === 'pending')
            ws.send(
              JSON.stringify({ type: 'mutate', mutation: item.mutation }),
            );
        targetRevision = Infinity;
      };
      ws.onmessage = (event) => {
        if (stopped || socket.current !== ws || rejectedIdentity) return;
        lastMessageAt = Date.now();
        let decoded: unknown;
        try {
          decoded = JSON.parse(String(event.data));
        } catch {
          setError('Invalid server response');
          return;
        }
        const parsed = serverMessage.safeParse(decoded);
        if (!parsed.success) {
          setError('Unexpected server response');
          return;
        }
        const message = parsed.data;
        if (message.type === 'ready') {
          if (message.userId !== actorId) {
            rejectedIdentity = true;
            setStatus('Access expired');
            setError('Sign in to the original account to recover this draft.');
            ws.close(4001, 'Account changed');
            return;
          }
          setRole(message.role);
          setError('');
          attempt = 0;
          targetRevision = message.revision;
          setStatus('Syncing');
          ws.send(
            JSON.stringify({
              type: 'resync',
              lastSeenRevision: authoritative.current.board.revision,
            }),
          );
          sendPresence();
          synchronize();
        }
        if (message.type === 'snapshot') {
          authoritative.current = message.snapshot;
          setConfirmed(message.snapshot);
          targetRevision = message.snapshot.board.revision;
          synchronize();
        }
        if (message.type === 'event') {
          try {
            authoritative.current = applyEvent(
              authoritative.current,
              message.event,
            );
            setConfirmed(authoritative.current);
            updatePending((items) =>
              items.filter(
                (item) =>
                  item.mutation.clientMutationId !==
                  message.event.clientMutationId,
              ),
            );
            setActivity((items) =>
              [
                message.event,
                ...items.filter(
                  (item) => item.eventId !== message.event.eventId,
                ),
              ].slice(0, 30),
            );
            synchronize();
          } catch {
            setStatus('Syncing');
            ws.send(JSON.stringify({ type: 'resync', lastSeenRevision: 0 }));
          }
        }
        if (message.type === 'ack')
          updatePending((items) =>
            items.filter(
              (item) =>
                item.mutation.clientMutationId !== message.clientMutationId,
            ),
          );
        if (message.type === 'presence') setPresence(message.users);
        if (message.type === 'conflict') {
          authoritative.current = message.snapshot;
          setConfirmed(message.snapshot);
          updatePending((items) =>
            items.map((item) =>
              item.mutation.clientMutationId === message.clientMutationId
                ? { ...item, state: 'conflicted', error: message.reason }
                : item,
            ),
          );
        }
        if (message.type === 'error') {
          setError(message.message);
          if (message.clientMutationId)
            updatePending((items) =>
              items.map((item) =>
                item.mutation.clientMutationId === message.clientMutationId
                  ? { ...item, state: 'failed', error: message.message }
                  : item,
              ),
            );
        }
      };
      ws.onclose = (event) => {
        clearInterval(heartbeat);
        if (stopped || socket.current !== ws) return;
        socket.current = null;
        setPresence([]);
        if (rejectedIdentity || event.code === 1008) {
          setStatus('Access expired');
          if (!rejectedIdentity)
            setError(
              'Your session or membership expired. Please sign in again.',
            );
          return;
        }
        setStatus(navigator.onLine ? 'Reconnecting' : 'Offline');
        retry = setTimeout(
          connect,
          Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500,
        );
      };
      ws.onopen = () => {
        heartbeat = setInterval(() => {
          if (Date.now() - lastMessageAt > 65_000) {
            ws.close(4000, 'Heartbeat timeout');
            return;
          }
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'ping' }));
        }, 30_000);
      };
    };
    connect();
    const online = () => {
      if (!socket.current || socket.current.readyState === WebSocket.CLOSED) {
        clearTimeout(retry);
        connect();
      }
    };
    const offline = () => {
      clearTimeout(retry);
      socket.current?.close();
      setPresence([]);
      setStatus('Offline');
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      socket.current?.close();
    };
  }, [
    initial.board.id,
    actorId,
    connectionVersion,
    sendPresence,
    updatePending,
  ]);
  const submitMutation = async (mutation: Mutation) => {
    const ws = socket.current;
    if (ws?.readyState !== WebSocket.OPEN || status !== 'Connected') {
      setError('Reconnect before submitting. Your draft is preserved.');
      return false;
    }
    if (!draftLease) {
      setDraftError(
        'Draft storage is unavailable. Keep this tab open or copy your edits.',
      );
      return false;
    }
    try {
      await persist(() =>
        saveDraft(draftLease, {
          kind: 'mutation',
          version: 1,
          id: mutation.clientMutationId,
          ownerId: actorId,
          boardId: initial.board.id,
          mutation,
          state: 'pending',
          updatedAt: Date.now(),
        }),
      );
    } catch {
      return false;
    }
    setDraftError('');
    // The session/socket may change while the device transaction commits.
    if (socket.current !== ws || ws.readyState !== WebSocket.OPEN) {
      updatePending((items) => [
        ...items.filter(
          (item) =>
            item.mutation.clientMutationId !== mutation.clientMutationId,
        ),
        { mutation, state: 'recovered' },
      ]);
      return true;
    }
    updatePending((items) => [
      ...items.filter(
        (item) => item.mutation.clientMutationId !== mutation.clientMutationId,
      ),
      { mutation, state: 'pending' },
    ]);
    ws.send(JSON.stringify({ type: 'mutate', mutation }));
    return true;
  };
  const mutate = async (
    command: Command,
    baseRevision = authoritative.current.board.revision,
  ) => {
    const mutation = {
      clientMutationId: crypto.randomUUID(),
      baseRevision,
      command,
    };
    return submitMutation(mutation);
  };
  let state = confirmed;
  for (const item of pending)
    if (item.state === 'pending') {
      try {
        state = optimistic(state, item.mutation, actorId);
      } catch {
        /* Removed parents can invalidate a pending preview. */
      }
    }
  return {
    state,
    status,
    presence,
    pending,
    activity,
    error,
    draftError,
    role,
    reconnect: () => setConnectionVersion((version) => version + 1),
    mutate,
    dismiss: async (id: string) => {
      if (!draftLease) return;
      try {
        await persist(() => removeDraft(draftLease, id));
        updatePending((items) =>
          items.filter((item) => item.mutation.clientMutationId !== id),
        );
      } catch {
        /* Retain the visible draft when its device copy cannot be deleted. */
      }
    },
    retry: async (item: Pending) => {
      // An uncertain recovered write retains its UUID and original revision.
      // First let the server deduplicate it or report a real field conflict.
      if (item.state === 'recovered') return submitMutation(item.mutation);
      if (await mutate(item.mutation.command))
        updatePending((items) => items.filter((v) => v !== item));
    },
  };
}
