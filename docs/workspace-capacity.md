# Workspace capacity

Workspace owners can open **Capacity and limits** on the workspace screen. The panel shows members and boards, including archived boards. Each board shows columns, retained cards, archived card count, total comments, the highest comment count on a single card and accepted changes.

The counters use the same application limits as the server. Archived cards and boards retain their data and continue to count. Accepted changes use the board's cumulative revision and its 5,000-change limit; this is separate from the shared daily mutation budget. A full card-comment quota can block that card even when other cards have fewer comments.

## Reading and authorization

`GET /api/workspaces/:workspaceId/usage` requires an application session and checks both canonical ownership and the OWNER membership. Editors, viewers, guests and owners of other workspaces cannot read it. The workspace summary and board counts authorize independently inside one D1 batch, including a permission change before execution. Responses use `Cache-Control: no-store` and do not include another workspace's names, content, users or storage totals.

The browser reads usage when the owner opens the panel. It does not poll or automatically retry failed requests. A fetched result is treated as fresh for one minute; refreshing or a successful workspace action can read it again. A failed read hides the previous counters and offers an explicit retry. English and Traditional Chinese labels include loading, error and exhausted-limit states.

These are read-only SQL aggregates over indexed workspace/board IDs. They do not load or serialize card descriptions and comments. The feature adds no database migration, storage binding, scheduled task or provider resource.

## Limits of the panel

These counters describe application capacity, not Cloudflare usage, billable operations or remaining free-plan allowances. Shared request, mutation, event and storage budgets can reject a change even when the displayed workspace counters have room. See [security and resource budgets](security.md).

The panel does not delete data, reset quotas or compact history. A board at its lifetime change cap remains read-only for new mutations under the existing server guard. Owners can [restore a JSON backup into a separate board](board-backups.md) while normal workspace and global budgets permit it; this does not erase the original board or reset global lifetime counters. Safe event maintenance remains separate work.

## Verification

Local workerd tests check archived counts, empty boards, exhausted card/comment quotas, canonical ownership changes, membership roles and isolation from another owner's workspace. The browser scenario checks on-demand reading, updates after board/member creation, editor denial, explicit retry, archived-board retention and Chinese labels. Production owner-browser verification remains a separate check.
