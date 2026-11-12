'use client';
import { useState } from 'react';
import { asError } from '../../src/lib/api-client';
import { createBoardBackup } from '../../src/backups/format';
import type { Snapshot } from '../../src/realtime/protocol';
import type { BoardData } from './types';

/**
 * Downloads the board as a versioned JSON backup. `ready` must be false while
 * disconnected or while edits are pending, so a file never captures unsynced
 * state.
 */
export function useBoardExport(
  state: Snapshot,
  people: BoardData['people'],
  ready: boolean,
) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);
  async function exportBoard() {
    if (exporting || !ready) return;
    setExporting(true);
    setExportError(null);
    const snapshot = structuredClone(state);
    const members = structuredClone(people);
    try {
      const backup = await createBoardBackup(snapshot, members);
      const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `collabedge-board-${snapshot.board.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setExportError(asError(caught, 'Board export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }
  return { exporting, exportError, exportBoard };
}
