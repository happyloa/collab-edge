'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../ui/i18n';
import type { useBoard } from '../../src/realtime/socket-client';
import type { Command, Snapshot } from '../../src/realtime/protocol';

type Move = Extract<Command, { type: 'card.move' }>;
type Notice = { key: string; cardId: string; columnId: string };

export function useCardMovement(
  live: Pick<ReturnType<typeof useBoard>, 'mutate' | 'pending' | 'activity'>,
  actorId: string,
  state: Snapshot,
) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<Notice | null>(null);
  const lastEvent = useRef('');
  const lastFailure = useRef('');
  const request = useRef<{ command: Move; clientMutationId?: string } | null>(
    null,
  );
  useEffect(() => {
    const requested = request.current;
    if (!requested) return;
    const event = live.activity.find(
      (item) =>
        item.actorId === actorId &&
        item.type === 'card.move' &&
        item.clientMutationId === requested.clientMutationId,
    );
    if (!event || event.eventId === lastEvent.current) return;
    lastEvent.current = event.eventId;
    setNotice({
      key: 'Moved {title} to {column}.',
      cardId: requested.command.payload.id,
      columnId: requested.command.payload.columnId,
    });
  }, [live.activity, actorId]);
  useEffect(() => {
    const item = [...live.pending]
      .reverse()
      .find(
        (entry) =>
          entry.mutation.command === request.current?.command &&
          entry.state !== 'pending',
      );
    if (!item || item.mutation.command.type !== 'card.move') return;
    const identity = `${item.mutation.clientMutationId}:${item.state}`;
    if (identity === lastFailure.current) return;
    lastFailure.current = identity;
    setNotice({
      key: 'Move of {title} to {column} needs review. Your attempted move is preserved.',
      cardId: item.mutation.command.payload.id,
      columnId: item.mutation.command.payload.columnId,
    });
  }, [live.pending]);
  async function move(command: Move) {
    const requested: { command: Move; clientMutationId?: string } = { command };
    request.current = requested;
    const values = {
      cardId: command.payload.id,
      columnId: command.payload.columnId,
    };
    setNotice({
      key: 'Moving {title} to {column}. Waiting for server confirmation.',
      ...values,
    });
    let accepted = false;
    try {
      accepted = await live.mutate(command, undefined, (id) => {
        requested.clientMutationId = id;
      });
    } catch {
      // Keep destination feedback when the socket closes during submission.
    }
    if (!accepted)
      setNotice({
        key: 'Could not submit the move of {title} to {column}. Your input is preserved.',
        ...values,
      });
    return accepted;
  }
  function destination(id: string | number | undefined) {
    const card = state.cards.find((item) => item.id === id);
    const column = state.columns.find(
      (item) => item.id === (card?.columnId ?? id),
    );
    if (!column) return t('Move cancelled. No destination selected.');
    return card
      ? t('Destination: {column}, before {title}.', {
          column: column.title,
          title: card.title,
        })
      : t('Destination: end of {column}.', { column: column.title });
  }
  return {
    move,
    destination,
    message: notice
      ? t(notice.key, {
          title:
            state.cards.find((card) => card.id === notice.cardId)?.title ??
            t('Card unavailable'),
          column:
            state.columns.find((column) => column.id === notice.columnId)
              ?.title ?? t('Column unavailable'),
        })
      : '',
  };
}
