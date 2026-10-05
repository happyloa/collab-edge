# Large-board snapshot measurements

Measured on 2026-10-05 with Node 24.21.0, Vitest 4.1.11 and the Cloudflare workerd test plugin 1.3.6 on Windows. All fixtures use isolated local D1. No production requests, resources or customer data are involved.

## Reproduce

```powershell
corepack pnpm exec vitest run tests/snapshot-scale.test.ts --reporter=default --reporter=junit --outputFile.junit=.tools/snapshot-scale.xml
```

Each test records a `SNAPSHOT_SCALE` annotation in the JUnit file. The `.tools` directory is ignored by Git. The normal test suite also runs these three cases, checking snapshot completeness, query counts, mutation results and bounded comment comparisons.

## Snapshot baseline

Fixtures contain four columns, 240-character descriptions and 420-character comments. They contain no attachments. These are representative text sizes; they do not exercise the maximum allowed description or comment length.

| Cards | Comments | UTF-8 JSON bytes | D1 queries / batches | Rows returned | Local rows read | Local load time |
| ----- | -------- | ---------------- | -------------------- | ------------- | --------------- | --------------- |
| 25    | 125      | 97,761           | 5 / 1                | 155           | 155             | 7 ms            |
| 100   | 1,000    | 716,889          | 5 / 1                | 1,105         | 1,105           | 9 ms            |
| 200   | 4,000    | 2,747,089        | 5 / 1                | 4,205         | 4,208           | 26 ms           |

`loadSnapshot` already uses one consistent D1 batch. The query count does not increase with the number of cards or comments. Each load still reads every comment and attachment metadata record on the board. Index traversal can add a few local `rows_read`; these values vary between runs and are not production billing measurements.

Load time includes the local D1 call and schema validation. It excludes JSON transfer, browser parsing and rendering. It is wall time, not a measurement of Workers CPU or Core Web Vitals. The four-MiB assertion bounds these particular fixtures, not all boards permitted by the product quotas.

## Mutation comparison

The original comment diff called `some()` over the old comment list for every item in the new list. With 4,000 comments, that did roughly eight million comparisons even when a card title changed without modifying comments.

The diff now returns an empty comment patch when the comment array is unchanged. When comments change, it builds a set of existing IDs and checks each new item once. UUID uniqueness, field revision guards, atomic D1 commits and recipient authorization remain in their existing paths.

| Fixture                   | Card update before / after | New comment before / after |
| ------------------------- | -------------------------- | -------------------------- |
| 25 cards, 125 comments    | 0 / 0 ms                   | 2 / 1 ms                   |
| 100 cards, 1,000 comments | 3 / 0 ms                   | 4 / 1 ms                   |
| 200 cards, 4,000 comments | 94 / 0 ms                  | 100 / 1 ms                 |

These are individual local runs, not a statistical latency guarantee. A reported zero reflects the timer's resolution. The optimized run also counted comment ID reads: zero for the title update and 16,000 for creating a comment on the largest fixture. The test checks operation counts against linear bounds instead of asserting fragile timing thresholds. Existing comments remain intact and only the new comment enters the patch.

## Remaining work

The largest fixture still produces about 2.62 MiB of JSON. Maximum-length multilingual content can produce larger snapshots. This change reduces mutation preparation work; it does not reduce snapshot bytes or D1 rows read.

Large-board browser interaction and authenticated production latency remain unmeasured. Further work should assess bounded card-detail loading and comment pagination, preserving coherent revisions, reconnect/replay behavior, exports and authorization. Any such change needs its own protocol and concurrency tests. No persistent snapshot cache or truncated comment response was introduced in this release.
