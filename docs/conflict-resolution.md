# Conflict resolution

Alice opens a card at revision 40. Bob changes its title at revision 41. Alice submits a different title with baseRevision 40. The server sees titleRevision 41, rejects the stale edit, and sends a conflict with the current snapshot. Alice's attempted title remains in the conflict panel. She can retry explicitly against the new revision or discard it.

Description and title maintain separate revision markers. An older description edit can succeed after a title-only change. This is field-level optimistic concurrency, not global last-write-wins. The client submits only fields changed in its form.

Creates can rebase if parents exist. Moves use authoritative neighbor ordering and can rebase when entity and destination still exist. Deleted parents reject dependent commands. Already-archived cards and already-removed columns produce an idempotent no-op event for a new mutation ID; redelivering an existing mutation ID returns the original result without a new revision.

Deleting a modified entity conflicts. Columns must be empty before removal; this deliberately avoids silently deleting cards, conversations or private files. Archived cards remain stored and count toward the quota.

All accepted new mutation IDs increment the board revision once, even semantically harmless no-ops. Idempotency is scoped to board and mutation UUID. A UUID already used by another actor is rejected. Pending commands reuse their UUID across reconnect, so an uncertain acknowledgment cannot duplicate data.
