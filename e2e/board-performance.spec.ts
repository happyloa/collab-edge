import { test, expect } from './fixture';
import { writeFile } from 'node:fs/promises';
import { seedScale } from './seed-scale';
import type { Snapshot } from '../src/realtime/protocol';

type BrowserMetrics = {
  readyMs: number | null;
  lcpMs: number | null;
  cls: number;
  longTaskCount: number;
  longTaskMs: number;
  maxLongTaskMs: number;
  events: { name: string; duration: number; interactionId: number }[];
};
type MeasuredWindow = Window &
  typeof globalThis & { collabScale: BrowserMetrics };

for (const size of [
  { cards: 25, commentsPerCard: 5 },
  { cards: 100, commentsPerCard: 10 },
  { cards: 200, commentsPerCard: 20 },
]) {
  test(`measures browser loading and interactions with ${size.cards} cards`, async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(
      !!process.env.E2E_BASE_URL || !process.env.COLLABEDGE_E2E_STATE_PATH,
      'Requires fresh local E2E state; never seed a remote or existing developer database',
    );
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Scale tester');
    await page
      .getByLabel('Email address')
      .fill(`scale-${crypto.randomUUID()}@example.com`);
    await page
      .getByLabel('Password', { exact: true })
      .fill('A-scale-test-password-2026');
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(page).toHaveURL(/\/workspaces$/);
    await page
      .getByLabel('New workspace', { exact: true })
      .fill('Scale workspace');
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(
      page.getByRole('heading', { name: 'Scale workspace' }),
    ).toBeVisible();
    const workspaceId = (
      (await (await page.request.get('/api/workspaces')).json()) as {
        id: string;
        name: string;
      }[]
    ).find((workspace) => workspace.name === 'Scale workspace')!.id;
    const created = await page.request.post('/api/boards', {
      headers: { Origin: new URL(page.url()).origin },
      data: { workspaceId, name: `Scale ${size.cards}` },
    });
    expect(created.status()).toBe(201);
    const boardId = ((await created.json()) as { id: string }).id;
    const initial = (await (
      await page.request.get(`/api/boards/${boardId}`)
    ).json()) as { snapshot: Snapshot; user: { id: string } };
    await seedScale({
      ...size,
      boardId,
      actorId: initial.user.id,
      columnIds: [...initial.snapshot.columns]
        .sort((a, b) => a.position - b.position)
        .map((column) => column.id),
    });
    const session = await page.context().newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    const traceEvents: unknown[] = [];
    let traceBytes = 0,
      traceTruncated = false;
    if (size.cards === 200) {
      session.on('Tracing.dataCollected', ({ value }: { value: unknown[] }) => {
        traceBytes += Buffer.byteLength(JSON.stringify(value));
        if (traceBytes > 32 * 1024 * 1024) traceTruncated = true;
        else traceEvents.push(...value);
      });
      await session.send('Tracing.start', {
        categories: 'devtools.timeline,blink.user_timing,loading',
        transferMode: 'ReportEvents',
      });
    }
    await page.addInitScript(
      ({ cards }) => {
        const target = window as MeasuredWindow;
        target.collabScale = {
          readyMs: null,
          lcpMs: null,
          cls: 0,
          longTaskCount: 0,
          longTaskMs: 0,
          maxLongTaskMs: 0,
          events: [],
        };
        const data = target.collabScale;
        const observe = (
          type: string,
          callback: (entries: PerformanceEntry[]) => void,
          extra = {},
        ) => {
          if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
          new PerformanceObserver((list) =>
            callback(list.getEntries()),
          ).observe({ type, buffered: true, ...extra });
        };
        observe('largest-contentful-paint', (entries) => {
          data.lcpMs = entries.at(-1)?.startTime ?? data.lcpMs;
        });
        observe('layout-shift', (entries) => {
          for (const entry of entries as (PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          })[])
            if (!entry.hadRecentInput) data.cls += entry.value;
        });
        observe('longtask', (entries) => {
          for (const entry of entries) {
            data.longTaskCount++;
            data.longTaskMs += entry.duration;
            data.maxLongTaskMs = Math.max(data.maxLongTaskMs, entry.duration);
          }
        });
        observe(
          'event',
          (entries) => {
            for (const entry of entries as (PerformanceEntry & {
              interactionId: number;
            })[])
              if (entry.interactionId && data.events.length < 200)
                data.events.push({
                  name: entry.name,
                  duration: entry.duration,
                  interactionId: entry.interactionId,
                });
          },
          { durationThreshold: 16 },
        );
        const ready = new MutationObserver(() => {
          if (
            document
              .querySelector('[aria-label="Connection status"]')
              ?.textContent?.trim() === 'Connected' &&
            document.querySelectorAll('button[aria-label^="Move Card "]')
              .length === cards
          ) {
            data.readyMs = performance.now();
            ready.disconnect();
          }
        });
        ready.observe(document, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      },
      { cards: size.cards },
    );
    const boardResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/boards/${boardId}` &&
        response.ok(),
    );
    await page.goto(`/boards/${boardId}`);
    await expect(
      page.getByRole('status', { name: 'Connection status' }),
    ).toHaveText('Connected');
    await expect(page.getByRole('button', { name: /^Move Card / })).toHaveCount(
      size.cards,
    );
    const payload = await (await boardResponse).body();
    const snapshot = (JSON.parse(payload.toString()) as { snapshot: Snapshot })
      .snapshot;
    expect(snapshot.comments).toHaveLength(size.cards * size.commentsPerCard);
    // Finite entrance animations can reveal a later LCP candidate. Let them
    // finish before reading load metrics; the presence pulse is infinite.
    await page.evaluate(async () => {
      await Promise.allSettled(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const load = await page.evaluate(() => {
      const target = window as MeasuredWindow;
      const resource = (
        performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      ).find((entry) =>
        /\/api\/boards\/[0-9a-f-]+$/.test(new URL(entry.name).pathname),
      );
      return {
        ...target.collabScale,
        events: [...target.collabScale.events],
        sampledMs: performance.now(),
        fcpMs:
          performance.getEntriesByName('first-contentful-paint')[0]
            ?.startTime ?? null,
        documentTtfbMs:
          (
            performance.getEntriesByType('navigation')[0] as
              PerformanceNavigationTiming | undefined
          )?.responseStart ?? null,
        apiMs: resource?.duration ?? null,
        apiDecodedBytes: resource?.decodedBodySize ?? null,
        apiEncodedBytes: resource?.encodedBodySize ?? null,
        domNodes: document.querySelectorAll('*').length,
      };
    });
    expect(load.readyMs).not.toBeNull();
    const begin = () => page.evaluate(() => performance.now());
    const elapsed = (start: number) =>
      page.evaluate((start) => performance.now() - start, start);
    const opened = await begin();
    await page.getByRole('button', { name: 'Card 1', exact: true }).click();
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
      'Description '.repeat(20),
    );
    const openDialogMs = await elapsed(opened);
    await page.getByRole('button', { name: 'Close card' }).click();
    const filtered = await begin();
    await page.getByLabel('Search cards').fill(`Card ${size.cards}`);
    await expect(
      page.getByRole('button', { name: `Card ${size.cards}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Move Card / })).toHaveCount(
      0,
    );
    const filterMs = await elapsed(filtered);
    await page.getByLabel('Search cards').fill('');
    await expect(page.getByRole('button', { name: /^Move Card / })).toHaveCount(
      size.cards,
    );
    const moving = page.getByRole('button', {
      name: 'Move Card 1',
      exact: true,
    });
    await moving.focus();
    const moveStart = await begin();
    await page.keyboard.press('Space');
    await expect(moving).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.keyboard.press('ArrowRight');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.keyboard.press('Space');
    await expect(
      page
        .getByRole('region', { name: 'In Progress', exact: true })
        .getByRole('button', { name: 'Card 1', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export board JSON' }),
    ).toBeEnabled();
    const keyboardMoveAndAckMs = await elapsed(moveStart);
    const persisted = (await (
      await page.request.get(`/api/boards/${boardId}`)
    ).json()) as { snapshot: Snapshot };
    expect(persisted.snapshot.comments).toHaveLength(snapshot.comments.length);
    expect(
      persisted.snapshot.cards.find((card) => card.title === 'Card 1')
        ?.columnId,
    ).toBe(
      initial.snapshot.columns.find((column) => column.title === 'In Progress')!
        .id,
    );
    if (size.cards === 200) {
      const ended = new Promise<void>((resolve) =>
        session.once('Tracing.tracingComplete', () => resolve()),
      );
      await session.send('Tracing.end');
      await ended;
      await writeFile(
        testInfo.outputPath('chromium-performance-trace.json'),
        JSON.stringify({ traceEvents, truncated: traceTruncated }),
      );
    }
    const interactions = await page.evaluate(
      () => (window as MeasuredWindow).collabScale,
    );
    const report = {
      environment:
        'isolated local Vite dev/workerd; browser cache disabled; unthrottled; synthetic data',
      browser: browser.version(),
      cards: size.cards,
      comments: size.cards * size.commentsPerCard,
      apiJsonBytes: payload.byteLength,
      snapshotJsonBytes: Buffer.byteLength(JSON.stringify(snapshot)),
      load,
      interactions: {
        openDialogMs,
        filterMs,
        keyboardMoveAndAckMs,
        ...interactions,
      },
      traceTruncated,
    };
    await writeFile(
      testInfo.outputPath('browser-scale.json'),
      JSON.stringify(report, null, 2),
    );
    expect(failures).toEqual([]);
    console.log('BROWSER_SCALE ' + JSON.stringify(report));
    await session.detach();
  });
}
