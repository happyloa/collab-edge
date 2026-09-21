# Realtime protocol

Upgrade `GET /realtime/:boardId` using the same-origin session cookie. The server verifies Origin, live session, membership and connection quota before accepting. The WebSocket Hibernation API preserves socket attachments across eviction.

Client messages are Zod discriminated unions: `hello`, `resync`, `mutate`, `presence`, `ping`. Server messages are validated by the browser: `ready`, `snapshot`, `event`, `ack`, `presence`, `conflict`, `error`, `pong`.

```json
{
  "type": "mutate",
  "mutation": {
    "clientMutationId": "a client-generated UUID",
    "baseRevision": 40,
    "command": {
      "type": "card.update",
      "payload": { "id": "card UUID", "title": "A better launch" }
    }
  }
}
```

The nested `command` discriminated union keeps each payload typed. Commands cover column create/rename/move/remove, card create/update/move/archive, and comment create. Attachments enter through HTTP and the same serialized board coordinator.

Each event contains boardId, revision, eventId, clientMutationId, actorId, type, a patch payload and createdAt. Patches upsert changed entities and explicitly list removed IDs. Numeric positions are calculated from authoritative ordering and neighbor IDs. Successful events update local state without refetching the board.

The client keeps an authoritative snapshot plus pending optimistic commands. Confirmed events remove pending commands; errors remove their optimistic effect but preserve the attempted payload. Conflicts install an authoritative snapshot and preserve a recoverable draft.

Reconnect sends `lastSeenRevision`. Up to 200 contiguous retained events are replayed. Missing history, future revisions, or revision zero produce a full snapshot. Duplicate events are ignored; gaps trigger a snapshot request. Backoff grows to 30 seconds with jitter. Online/offline events and a 65-second heartbeat timeout recover broken connections. A policy close requires signing in again rather than retrying indefinitely.

Events are retained for the lifetime of the capped board. There is no compaction yet: 5,000 revisions per board and a global event byte/count budget bound retention and preserve idempotency history. Offline writes are not accepted; forms retain their draft until connected. Presence is ephemeral and deduplicated by user ID.
