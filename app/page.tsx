import { DemoEntry } from '../components/demo-entry';
import Link from 'next/link';
import {
  ArrowUpRight,
  Layers3,
  Radio,
  ShieldCheck,
  GitBranch,
} from 'lucide-react';
import { ThemeToggle } from '../components/ui/theme';
const features = [
  {
    Icon: Radio,
    title: 'Together, in real time',
    description:
      'Changes travel as ordered events. Your team stays on the same page.',
  },
  {
    Icon: ShieldCheck,
    title: 'A little more certainty',
    description:
      'Conflicting edits are surfaced clearly, with your draft kept safe.',
  },
  {
    Icon: GitBranch,
    title: 'Built for the in-between',
    description:
      'Step away, reconnect, and pick up exactly where your team is now.',
  },
];
export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <Link href="/" className="brand">
          <Layers3 size={24} /> CollabEdge<span className="badge">BETA</span>
        </Link>
        <nav className="flex items-center gap-5">
          <ThemeToggle />
          <Link href="/login">Sign in</Link>
          <Link className="button" href="/register">
            Get started <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="eyebrow">
          <span className="status-dot" /> A little closer. A lot more in sync.
        </p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">
          Good work happens
          <br />
          in a <span className="text-primary">shared space.</span>
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
          Bring your team’s next big idea into focus. Plan together, see changes
          as they happen, and keep every decision in the same conversation.
        </p>
        <div className="mt-9 flex gap-4">
          <Link href="/register" className="button">
            Create your workspace <ArrowUpRight size={18} />
          </Link>
          <Link href="/login" className="button secondary">
            Open workspace
          </Link>
        </div>
        <DemoEntry />
        <section
          aria-label="Product preview"
          className="surface mt-16 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <span className="text-sm text-muted">Acme Product Team /</span>
              <h2 className="mt-1 font-semibold">Website Launch</h2>
            </div>
            <span className="badge">
              <span className="status-dot" /> Preview
            </span>
          </div>
          <div className="grid gap-4 bg-background p-6 sm:grid-cols-3">
            {[
              [
                'Backlog',
                'Map the customer journey',
                'Explore a clearer first impression',
              ],
              [
                'In Progress',
                'Build a home for the next chapter',
                'Bring the visual identity to life',
              ],
              [
                'Review',
                'Make every interaction accessible',
                'Test the details that matter',
              ],
            ].map(([name, ...titles], i) => (
              <div key={name}>
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                  <span className={`column-dot tone-${i}`} />
                  {name}
                  <span className="ml-auto text-muted">02</span>
                </div>
                {titles.map((title, j) => (
                  <div key={title} className="surface mb-3 p-5">
                    <span className="tag">{j ? 'Design' : 'Product'}</span>
                    <h3 className="my-4 font-medium">{title}</h3>
                    <div className="flex justify-between text-xs text-muted">
                      <span>CE–{i * 2 + j + 1}</span>
                      <span className="avatar">{j ? 'BK' : 'AL'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="mt-14 grid gap-8 sm:grid-cols-3">
          {features.map(({ Icon, title, description }) => (
            <article key={title}>
              <Icon className="mb-4 text-primary" size={23} />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {description}
              </p>
            </article>
          ))}
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl justify-between border-t border-border px-6 py-8 text-sm text-muted">
        <span>Made for moving forward, together.</span>
        <a href="https://github.com/happyloa/collab-edge">View source ↗</a>
      </footer>
    </div>
  );
}
