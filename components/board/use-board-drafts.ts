'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  activateDraftOwner,
  listDrafts,
  removeDraft,
  DRAFT_DATABASE,
  draftErrorMessage,
  type DraftLease,
  type CardDraft,
} from '../../src/drafts/store';

export function useBoardDrafts(ownerId: string, boardId: string) {
  const [lease, setLease] = useState<DraftLease | null>(null);
  const [drafts, setDrafts] = useState<CardDraft[]>([]);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!lease) return;
    try {
      setDrafts(await listDrafts(lease, boardId));
      setError('');
    } catch (error) {
      setDrafts([]);
      setError(draftErrorMessage(error));
    }
  }, [lease, boardId]);
  useEffect(() => {
    let active = true;
    void activateDraftOwner(ownerId, false)
      .then((next) => {
        if (active) setLease(next);
      })
      .catch((error) => {
        if (active) setError(draftErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [ownerId]);
  useEffect(() => {
    void refresh();
    const listener = () => {
      void refresh();
    };
    window.addEventListener('collabedge-drafts', listener);
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(DRAFT_DATABASE);
    channel?.addEventListener('message', listener);
    return () => {
      window.removeEventListener('collabedge-drafts', listener);
      channel?.close();
    };
  }, [refresh]);
  const discard = async (draftId: string) => {
    try {
      if (!lease) throw new Error('Storage unavailable');
      await removeDraft(lease, draftId);
      await refresh();
    } catch (error) {
      setError(draftErrorMessage(error));
    }
  };
  return { lease, drafts, error, refresh, discard };
}
