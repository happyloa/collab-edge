import { z } from 'zod';
import { id, mutationSchema } from '../realtime/protocol';

export const DRAFT_DATABASE = 'collabedge-drafts';
export const DRAFT_LIMITS = {
  count: 24,
  bytes: 256 * 1024,
  entryBytes: 96 * 1024,
  ttlMs: 7 * 24 * 60 * 60 * 1000,
} as const;
const fields = z
  .object({
    title: z.string().max(160),
    description: z.string().max(10000),
    assigneeId: id.nullable(),
    dueDate: z.union([z.iso.date(), z.literal('')]).nullable(),
  })
  .strict();
export const draftSchema = z
  .object({
    kind: z.literal('card'),
    version: z.literal(1),
    id,
    ownerId: id,
    boardId: id,
    cardId: id,
    baseRevision: z.number().int().nonnegative(),
    original: fields,
    fields,
    comment: z.string().max(2000),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type CardDraft = z.infer<typeof draftSchema>;
export type DraftFields = CardDraft['fields'];
export type DraftLease = { ownerId: string; epoch: string };
export const pendingDraftSchema = z
  .object({
    kind: z.literal('mutation'),
    version: z.literal(1),
    id,
    ownerId: id,
    boardId: id,
    mutation: mutationSchema,
    state: z.enum(['pending', 'conflicted', 'failed']),
    error: z.string().max(1000).optional(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict()
  .refine((entry) => entry.id === entry.mutation.clientMutationId);
export const storedDraftSchema = z.union([draftSchema, pendingDraftSchema]);
export type PendingDraft = z.infer<typeof pendingDraftSchema>;
export type StoredDraft = CardDraft | PendingDraft;
const leaseSchema = z.object({ ownerId: id, epoch: id }).strict();

export class DraftError extends Error {
  constructor(readonly reason: 'unavailable' | 'full' | 'account-changed') {
    super(reason);
    this.name = 'DraftError';
  }
}
export function draftErrorMessage(error: unknown) {
  if (error instanceof DraftError && error.reason === 'account-changed')
    return 'The account changed. This tab cannot save drafts on this device.';
  if (error instanceof DraftError && error.reason === 'full')
    return 'Draft storage is full. Remove an older draft or keep this tab open.';
  return 'Draft storage is unavailable. Keep this tab open or copy your edits.';
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let finished = false;
    const fail = () => {
      finished = true;
      clearTimeout(timeout);
      reject(new DraftError('unavailable'));
    };
    const timeout = setTimeout(fail, 3000);
    try {
      request = indexedDB.open(DRAFT_DATABASE, 1);
    } catch {
      fail();
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts', { keyPath: 'id' });
      request.result.createObjectStore('identity');
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (finished) request.result.close();
      else {
        finished = true;
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
  });
}

// IndexedDB read/write transactions serialize across tabs. Check the owner
// generation in the same transaction as each edit, including deletes.
async function transaction<T>(
  action: (tx: IDBTransaction, complete: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['drafts', 'identity'], 'readwrite');
    let result: T;
    let error: unknown;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(
        error instanceof DraftError ? error : new DraftError('unavailable'),
      );
    };
    tx.onerror = () => {
      /* onabort owns rejection and cleanup. */
    };
    const guarded = (value: T) => {
      result = value;
    };
    try {
      action(tx, guarded);
    } catch (caught) {
      error = caught;
      tx.abort();
    }
    // Event handlers cannot throw into the outer promise.
    tx.addEventListener('draft-failure', (event) => {
      error = (event as CustomEvent<DraftError>).detail;
      tx.abort();
    });
  });
}
function fail(tx: IDBTransaction, reason: DraftError['reason']) {
  tx.dispatchEvent(
    new CustomEvent('draft-failure', { detail: new DraftError(reason) }),
  );
}
function requireLease(tx: IDBTransaction, lease: DraftLease, next: () => void) {
  const request = tx.objectStore('identity').get('active');
  request.onsuccess = () => {
    const parsed = leaseSchema.safeParse(request.result);
    if (
      !parsed.success ||
      parsed.data.ownerId !== lease.ownerId ||
      parsed.data.epoch !== lease.epoch
    )
      fail(tx, 'account-changed');
    else next();
  };
}
function notify() {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event('collabedge-drafts'));
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(DRAFT_DATABASE);
      channel.postMessage('changed');
      channel.close();
    } catch {
      /* IndexedDB is authoritative when notifications are restricted. */
    }
  }
}
export async function activateDraftOwner(
  ownerId: string,
  replace = true,
): Promise<DraftLease> {
  if (!id.safeParse(ownerId).success) throw new DraftError('account-changed');
  const lease = await transaction<DraftLease>((tx, complete) => {
    const identity = tx.objectStore('identity');
    const request = identity.get('active');
    request.onsuccess = () => {
      const current = leaseSchema.safeParse(request.result);
      if (current.success && current.data.ownerId === ownerId) {
        complete(current.data);
        return;
      }
      if (request.result !== undefined && !replace) {
        fail(tx, 'account-changed');
        return;
      }
      const next = { ownerId, epoch: crypto.randomUUID() };
      tx.objectStore('drafts').clear();
      identity.put(next, 'active');
      complete(next);
    };
  });
  notify();
  return lease;
}
export async function clearDrafts(): Promise<void> {
  await transaction<void>((tx, complete) => {
    tx.objectStore('drafts').clear();
    // Keep a tombstone so old tabs cannot re-initialize their former owner.
    tx.objectStore('identity').put(
      { ownerId: null, epoch: crypto.randomUUID() },
      'active',
    );
    complete();
  });
  notify();
}
function validEntries(
  store: IDBObjectStore,
  raw: unknown[],
  now: number,
): StoredDraft[] {
  const entries: StoredDraft[] = [];
  for (const item of raw) {
    const parsed = storedDraftSchema.safeParse(item);
    if (
      parsed.success &&
      parsed.data.updatedAt <= now &&
      now - parsed.data.updatedAt < DRAFT_LIMITS.ttlMs
    )
      entries.push(parsed.data);
    else if (
      item &&
      typeof item === 'object' &&
      'id' in item &&
      typeof item.id === 'string'
    )
      store.delete(item.id);
  }
  return entries;
}
export async function listStoredDrafts(
  lease: DraftLease,
  boardId: string,
): Promise<StoredDraft[]> {
  return transaction<StoredDraft[]>((tx, complete) =>
    requireLease(tx, lease, () => {
      const store = tx.objectStore('drafts');
      const request = store.getAll();
      request.onsuccess = () =>
        complete(
          validEntries(store, request.result, Date.now())
            .filter(
              (entry) =>
                entry.ownerId === lease.ownerId && entry.boardId === boardId,
            )
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
    }),
  );
}
export async function listDrafts(
  lease: DraftLease,
  boardId: string,
): Promise<CardDraft[]> {
  return (await listStoredDrafts(lease, boardId)).filter(
    (entry): entry is CardDraft => entry.kind === 'card',
  );
}
export async function saveDraft(
  lease: DraftLease,
  draft: StoredDraft,
): Promise<void> {
  const parsed = storedDraftSchema.safeParse(draft);
  if (!parsed.success || draft.ownerId !== lease.ownerId)
    throw new DraftError('unavailable');
  const size = (entry: StoredDraft) =>
    new TextEncoder().encode(JSON.stringify(entry)).byteLength;
  if (size(parsed.data) > DRAFT_LIMITS.entryBytes) throw new DraftError('full');
  await transaction<void>((tx, complete) =>
    requireLease(tx, lease, () => {
      const store = tx.objectStore('drafts');
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = validEntries(store, request.result, Date.now()).filter(
          (entry) => entry.id !== draft.id,
        );
        if (
          entries.length >= DRAFT_LIMITS.count ||
          entries.reduce(
            (total, entry) => total + size(entry),
            size(parsed.data),
          ) > DRAFT_LIMITS.bytes
        ) {
          fail(tx, 'full');
          return;
        }
        store.put(parsed.data);
        complete();
      };
    }),
  );
  notify();
}
export async function removeDraft(
  lease: DraftLease,
  draftId: string,
): Promise<void> {
  await transaction<void>((tx, complete) =>
    requireLease(tx, lease, () => {
      tx.objectStore('drafts').delete(draftId);
      complete();
    }),
  );
  notify();
}
