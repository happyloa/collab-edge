import { useRef } from 'react';
import { useI18n } from '../components/ui/i18n';

const recordings = [
  {
    id: 'alice',
    label: 'Alice browser',
    src: new URL('./media/alice.webm', import.meta.url).href,
    poster: new URL('./media/alice.png', import.meta.url).href,
    captionEn: new URL('./media/alice.en.vtt', import.meta.url).href,
    captionZh: new URL('./media/alice.zh-TW.vtt', import.meta.url).href,
  },
  {
    id: 'bob',
    label: 'Bob browser',
    src: new URL('./media/bob.webm', import.meta.url).href,
    poster: new URL('./media/bob.png', import.meta.url).href,
    captionEn: new URL('./media/bob.en.vtt', import.meta.url).href,
    captionZh: new URL('./media/bob.zh-TW.vtt', import.meta.url).href,
  },
] as const;

export function RecordedCollaboration() {
  const { t } = useI18n();
  const aliceRecording = useRef<HTMLVideoElement>(null);
  const bobRecording = useRef<HTMLVideoElement>(null);
  const refs = { alice: aliceRecording, bob: bobRecording };

  function playBoth() {
    for (const player of [aliceRecording.current, bobRecording.current]) {
      if (!player) continue;
      player.currentTime = 0;
      void player.play();
    }
  }

  return (
    <section
      id="recorded-collaboration"
      className="surface mt-8 scroll-mt-6 p-5 sm:p-6"
      aria-labelledby="recorded-collaboration-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="recorded-collaboration-title"
            className="text-xl font-semibold"
          >
            {t('Recorded local collaboration')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            {t(
              'Two independent browser sessions use the real local Worker and database. This recording is not a live connection to the public playground or production.',
            )}
          </p>
        </div>
        <button type="button" className="button secondary" onClick={playBoth}>
          {t('Play both recordings')}
        </button>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {recordings.map((recording) => (
          <figure key={recording.id} className="min-w-0">
            <figcaption className="mb-2 text-sm font-medium">
              {t(recording.label)}
            </figcaption>
            <video
              ref={refs[recording.id]}
              controls
              playsInline
              preload="none"
              poster={recording.poster}
              aria-label={t(recording.label)}
              className="aspect-video w-full rounded-panel border border-border bg-black"
            >
              <source src={recording.src} type="video/webm" />
              <track
                kind="captions"
                src={recording.captionEn}
                srcLang="en"
                label="English"
              />
              <track
                kind="captions"
                src={recording.captionZh}
                srcLang="zh-TW"
                label="繁體中文"
              />
            </video>
            <a
              href={recording.src}
              download
              className="mt-2 inline-block text-sm underline"
            >
              {t('Download video')}
            </a>
          </figure>
        ))}
      </div>
      <a
        className="mt-5 inline-block text-sm underline"
        href="https://github.com/happyloa/collab-edge/blob/main/docs/realtime-walkthrough.md"
      >
        {t('Two-browser test walkthrough')}
      </a>
    </section>
  );
}
