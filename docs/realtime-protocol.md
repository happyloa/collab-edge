# Realtime protocol

Upgrade `GET /realtime/:boardId` using the same-origin session cookie. The server verifies Origin, live session, membership and connection quota before accepting. The WebSocket Hibernation API preserves socket attachments across eviction.

Client messages are Zod discriminated unions: `resync`, `mutate`, `presence`, `ping`. Server messages are validated by the browser: `ready`, `snapshot`, `event`, `ack`, `presence`, `conflict`, `error`, `pong`.

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

The nested `command` discriminated union keeps each payload typed. Commands cover board rename/archive/restore, column create/rename/move/remove, card create/update/move/archive/restore, and comment create. Attachments enter through HTTP and the same serialized board coordinator.

`card.update` accepts optional `assigneeId` (member UUID or null) and `dueDate` (valid YYYY-MM-DD calendar date or null). Both have independent conflict revisions. The coordinator validates current workspace membership before assignment and repeats that check inside the entity/revision/event transaction. Older stored events default absent metadata to null and field revisions to zero. Dates have no timezone; UI date filters use the browser's local calendar day. Archived cards and boards retain their quota footprint. Restoration checks the relevant entity revision and uses the same UUID idempotency and authorization as other writes.

Each event contains boardId, revision, eventId, clientMutationId, actorId, type, a patch payload and createdAt. Patches upsert changed entities and explicitly list removed IDs. Column and card IDs are client-generated UUIDs whose primary keys span all boards, so each upsert only touches rows of its own board and a guard inside the same transaction rejects the mutation when an ID already belongs to another board. Numeric positions are calculated from authoritative ordering and neighbor IDs. Successful events update local state without refetching the board.

The client keeps an authoritative snapshot plus pending optimistic commands. Confirmed events remove pending commands; errors remove their optimistic effect but preserve the attempted payload. Conflicts install an authoritative snapshot and preserve a recoverable draft.

Reconnect sends `lastSeenRevision`. Up to 200 contiguous retained events are replayed. Missing history, future revisions, or revision zero produce a full snapshot. Duplicate events are ignored; gaps trigger a snapshot request. Backoff grows to 30 seconds with jitter. Online/offline events and a 65-second heartbeat timeout recover broken connections. The browser sends the exact `{"type":"ping"}` frame every 30 seconds; the room registers it as a WebSocket auto-response, so the runtime replies `{"type":"pong"}` without waking a hibernated room, reading D1 or counting against the per-socket message limit. A heartbeat therefore no longer rechecks the session: a revoked or expired connection is closed by its next ordinary message or by the next broadcast, which reauthorizes every recipient before sending. A policy close (1008) requires signing in again. If D1 fails while the room reauthorizes recipients, sockets still close but with retryable 1011, so clients reconnect and are reauthorized by the upgrade. A rejected upgrade reaches the browser as a bare 1006, so the client stops after eight failed reconnects (about two minutes) and offers a manual reconnect instead of spending the request budget indefinitely. A mutation refused by a business rule (for example archiving the shared demo board) returns an error without closing the socket.

Mutation receipts are retained for the lifetime of the capped board. Owners may explicitly clear payloads older than 30 days and outside the latest 200 revisions, at most 100 per reviewed batch. UUIDs, actors, revision metadata and the cumulative event byte/count budgets remain intact. A retry of a pruned UUID returns the current snapshot and original acknowledgment to the same actor, without a new write or peer broadcast. See [event retention](event-retention.md).

Offline writes are not accepted; forms retain their draft until connected. Presence is ephemeral and deduplicated by user ID. The browser sends an update only when the selected card or active/idle state changes; hidden tabs become idle, and five minutes without interaction also marks a visible tab idle. Reconnect republishes a nondefault state after the socket is ready. Presence and selected-card hints are authorized on each message but never written to D1; the per-socket message cap still applies.

The board's activity panel requests `GET /api/boards/:boardId/activity?limit=30` only when opened. The authorized HTTP API returns `{ events, nextBefore, prunedThroughRevision }` in descending revision order; `before=<revision>` loads older events with an exclusive cursor. Compacted payloads are omitted, and the panel explains the missing older activity. Each request is capped at 50 events. This browsing endpoint is separate from the WebSocket's 200-event reconnect replay.

## Conflicts

Alice opens a card at revision 40. Bob changes its title at revision 41. Alice submits a different title with baseRevision 40. The server sees titleRevision 41, rejects the stale edit and sends a conflict with the current snapshot. Alice's attempted title stays in the conflict panel; she can retry it explicitly against the new revision or discard it.

Title, description, assignee and due date keep separate revision markers, so an older description edit can still succeed after a title-only change. This is field-level optimistic concurrency, not global last-write-wins. The client submits only the fields changed in its form.

Creates rebase while their parent exists. Moves use authoritative neighbor ordering and rebase while the entity and destination exist; new cards and columns are placed after the highest existing position. Deleted parents reject dependent commands. Deleting a modified entity conflicts, and columns must be empty before removal so cards, comments and files are never deleted silently. Already-archived cards and already-removed columns produce an idempotent no-op event for a new mutation ID.

Every accepted new mutation ID increments the board revision once. Idempotency is scoped to board and mutation UUID, and a UUID already used by another actor is rejected. Pending commands keep their UUID across reconnects, so an uncertain acknowledgement cannot duplicate data.

## Local drafts

Card details, unsent comments and unconfirmed mutations are saved in the browser's IndexedDB, so they survive a reload. The board lists saved drafts; **Review draft** reopens one. Closing an edited dialog (or pressing Escape) offers keep, discard or continue editing.

The device keeps at most 24 records and 256 KiB, with 96 KiB per record, and each record expires seven days after its last edit. When storage is full or blocked, the UI keeps the current inputs and stops submitting board changes. Each dialog has its own record, so two tabs editing one card do not overwrite each other. Signing in as another account, signing out, resetting the password or deleting the account clears the device drafts; a plain session expiry keeps them for the same account.

A restored form keeps its original revision for the fields its author changed, so it cannot overwrite a newer value from a teammate without going through the conflict flow. After a reload, uncertain writes are shown for review and never sent automatically; **Retry my draft** first reuses the original UUID so the server can deduplicate a write that already committed. Drafts never contain passwords, tokens, cookies or attachment bytes, and a full reload while offline is not supported.

Implementation: [draft store](../src/drafts/store.ts), [field restoration](../src/drafts/restore.ts), [socket queue](../src/realtime/socket-client.ts). Browser coverage: [drafts scenarios](../e2e/drafts.spec.ts).
