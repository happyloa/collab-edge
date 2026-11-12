import type { Snapshot } from '../../src/realtime/protocol';

export type BoardData = {
  snapshot: Snapshot;
  role: string;
  user: { id: string; name: string };
  people: { id: string; name: string }[];
};
export type Card = Snapshot['cards'][number];
