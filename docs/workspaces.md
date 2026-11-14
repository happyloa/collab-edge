# Workspaces

## Management

`Dashboard` owns workspace selection, queries and mutation coordination. `Members` handles invitations, roles, removal, ownership transfer and leaving a workspace. `DeleteAccount` handles password confirmation and deletion progress. Shared response types live in `components/workspace/types.ts`.

Each workspace action sets a synchronous pending guard before sending, and controls stay disabled until the request and the query refresh finish; sign-out also waits for it. Failed requests keep their inputs and require an explicit retry. Forms reset when the selected workspace changes, creating an active board clears the archive filter, and a workspace that is no longer accessible falls back to one from the refreshed list. Server authorization, password checks, transaction guards and quotas remain authoritative.

## Capacity

Owners can open **Capacity and limits** on the workspace screen. It shows members and boards (including archived ones) and, per board, columns, retained and archived cards, comments, the busiest card's comment count and accepted changes. The counters use the same limits as the server: archived data keeps counting, and each board has a lifetime cap of 5,000 accepted changes, separate from the shared daily mutation budget.

`GET /api/workspaces/:workspaceId/usage` requires a session plus both canonical ownership and an OWNER membership, authorized inside one D1 batch. It returns indexed SQL aggregates only (no descriptions or comments), is read when the panel opens, and is not polled or retried automatically.

The panel shows application capacity, not Cloudflare usage or remaining free-plan allowances; shared site budgets can reject a change even when the workspace has room (see [security](security.md)). It does not delete data or reset quotas. Owners can clear old activity details with [event retention](event-retention.md) or [restore a JSON backup into a new board](board-backups.md); neither resets lifetime counters.

## Verification

Workers tests cover archived counts, exhausted card and comment quotas, ownership and role changes, and isolation from other workspaces. React and Chromium scenarios cover the submission guard, retained inputs after failure, workspace switching, new-board visibility, on-demand capacity reads and duplicate React keys.
