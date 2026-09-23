# Production smoke check

The Worker hostname is restricted to the owner's Cloudflare Access email. The owner must complete the email code in a browser to check private application pages. Never disable Access or share a session cookie to automate this.

1. Open `https://collab-edge.piafyoyo06.workers.dev/` in a normal browser and complete Access with `piafyoyo06@gmail.com`.
2. Sign in to the CollabEdge app or use its seeded Alice demo account. Confirm the workspace and board load and the connection status becomes Connected.
3. On a disposable board under a normal application account, create a card, assign a current workspace member and a due date. Reload and check both values persist. Search/filter the card, archive and restore it, then archive and restore the board.
4. Open a second independent browser context and authenticate its Access prompt with the **same allowed owner email**. Use two different CollabEdge app accounts, or the seeded Alice and Bob sessions, to verify realtime sync, conflict recovery and reconnect. Both contexts can use the owner Access identity; the app sessions supply distinct collaboration identities. Do not expand the Access allowlist for this check.

Read-only checks that do not require an owner session: the anonymous Worker URL should redirect to Access (302); the Access policy should still allow only the owner email; Worker configuration should retain `ACCESS_REQUIRED=true`, `ATTACHMENTS_ENABLED=false` and disabled preview URLs; Cloudflare Builds and GitHub Actions should succeed for the release commit; Pages must load from `https://happyloa.github.io/collab-edge/`.

Do not run the local upload end-to-end scenario against production: production attachment operations are disabled to control costs. Record checks as completed only after observing them, with the commit and build identifiers in [delivery status](delivery-status.md).
