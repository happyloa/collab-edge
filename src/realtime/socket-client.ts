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
export type Pending = {
  mutation: Mutation;
  state: 'pending' | 'failed' | 'conflicted';
  error?: string;
};
export function useBoard(initial: Snapshot, actorId: string) {
  const [confirmed, setConfirmed] = useState(initial);
  const authoritative = useRef(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState('Connecting');
  const [presence, setPresence] = useState<Presence[]>([]);
  const [activity, setActivity] = useState<BoardEvent[]>([]);
  const [error, setError] = useState('');
  const updatePending = useCallback((fn: (items: Pending[]) => Pending[]) => {
    pendingRef.current = fn(pendingRef.current);
    setPending(pendingRef.current);
  }, []);
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
      setStatus(navigator.onLine ? 'Connecting' : 'Offline');
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/realtime/${initial.board.id}`,
      );
      socket.current = ws;
      let targetRevision = -1;
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
          attempt = 0;
          targetRevision = message.revision;
          setStatus('Syncing');
          ws.send(
            JSON.stringify({
              type: 'resync',
              lastSeenRevision: authoritative.current.board.revision,
            }),
          );
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
        if (stopped) return;
        if (event.code === 1008) {
          setStatus('Access expired');
          setError('Your session or membership expired. Please sign in again.');
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
  }, [initial.board.id, updatePending]);
  const mutate = (
    command: Command,
    baseRevision = authoritative.current.board.revision,
  ) => {
    if (
      socket.current?.readyState !== WebSocket.OPEN ||
      status !== 'Connected'
    ) {
      setError('Reconnect before submitting. Your draft is preserved.');
      return false;
    }
    const mutation = {
      clientMutationId: crypto.randomUUID(),
      baseRevision,
      command,
    };
    updatePending((items) => [...items, { mutation, state: 'pending' }]);
    socket.current.send(JSON.stringify({ type: 'mutate', mutation }));
    return true;
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
    mutate,
    dismiss: (id: string) =>
      updatePending((items) =>
        items.filter((item) => item.mutation.clientMutationId !== id),
      ),
    retry: (item: Pending) => {
      if (mutate(item.mutation.command))
        updatePending((items) => items.filter((v) => v !== item));
    },
  };
}
