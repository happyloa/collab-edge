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

The table records the pre-restore baseline. Board restore adds a sixth query for unavailable attachment references within the same consistent batch. The current scale test expects six queries and includes the empty reference array in its byte measurement; rerun the command above for current annotations. Reference-heavy boards need their own measurement.

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

## Browser baseline

Measured on 2026-10-06 with Playwright 1.63.0 and Chromium 153.0.8010.12 on Windows. The three scenarios passed on disposable local Vite/workerd state. Browser cache was disabled; CPU and network were unthrottled. Registration and fixture setup precede measurement. This is a development-server baseline, with warm Vite dependency compilation and local service state, rather than a cold production benchmark.

```powershell
corepack pnpm test:perf
```

The runner refuses an external `E2E_BASE_URL`. Fixture seeding also verifies that the resolved state directory is a disposable `.wrangler/e2e-*` child and invokes D1 with `--local`. It never seeds a normal developer database or remote D1. The ordinary E2E suite includes these scenarios.

| Cards / comments | API JSON bytes | Connected + cards ready | API resource duration | Observed LCP | DOM nodes | Open details | Search | Keyboard move + acknowledgment |
| ---------------- | -------------- | ----------------------- | --------------------- | ------------ | --------- | ------------ | ------ | ------------------------------ |
| 25 / 125         | 98,007         | 581 ms                  | 48 ms                 | 584 ms       | 591       | 103 ms       | 36 ms  | 188 ms                         |
| 100 / 1,000      | 717,136        | 516 ms                  | 63 ms                 | 828 ms       | 1,866     | 175 ms       | 32 ms  | 276 ms                         |
| 200 / 4,000      | 2,747,336      | 636 ms                  | 102 ms                | 952 ms       | 3,566     | 272 ms       | 47 ms  | 585 ms                         |

These are individual runs, not percentiles or timing guarantees. Ready time means the WebSocket reports Connected and all expected move controls exist. LCP and CLS are read after finite entrance animations finish; the infinite presence pulse is excluded from that wait. Observed CLS was approximately 0.00036–0.00044. The largest case recorded one 67 ms long task during loading and four long tasks totaling 313 ms across loading and interactions; the longest was 91 ms.

Interaction times include Playwright actionability checks, browser scheduling and assertions. The keyboard result also includes two animation frames after activation and movement, plus the mutation acknowledgment. An initial test sent the drop before the target update and failed at the two smaller sizes; waiting for those frames fixed the test. The scenario still verifies the destination in canonical D1 and that every comment remains intact. The browser reported no uncaught page errors.

Each scenario writes `browser-scale.json` into its Playwright result directory and logs a `BROWSER_SCALE` record. The 200-card case also writes `chromium-performance-trace.json`, bounded to 32 MiB of event payload with an explicit truncation flag. Open the trace in the [Chrome Performance panel](https://developer.chrome.com/docs/devtools/performance) for further inspection. Reports and traces remain ignored local test artifacts.

The untruncated largest trace recorded 867 ms of renderer-main-thread `FunctionCall` events, 161 ms of style-tree updates, 54 ms of layout and 121 ms of paint. Trace events can nest, so these durations cannot be added into a CPU total. JavaScript work warrants closer inspection before changing animation styles; this trace does not identify a specific unused dependency or prove a production bottleneck.

The measurements do not establish field Core Web Vitals or production Workers CPU consumption. Event Timing samples are recorded, but the short scripted session is not an INP assessment. No timing threshold was added to CI; correctness assertions cover complete data, filtering, persisted keyboard movement and browser errors.

## Remaining work

The largest fixture still produces about 2.62 MiB of JSON. Maximum-length multilingual content can produce larger snapshots. This change reduces mutation preparation work; it does not reduce snapshot bytes or D1 rows read.

Authenticated production latency, slower-device performance and maximum-length multilingual browser fixtures remain unmeasured. The local browser baseline shows increasing detail-opening and keyboard-move time, while snapshot transfer remains proportional to all comments. Further work should assess bounded card-detail loading and comment pagination, preserving coherent revisions, reconnect/replay behavior, exports and authorization. Any such change needs its own protocol and concurrency tests. No persistent snapshot cache or truncated comment response was introduced in this release.
