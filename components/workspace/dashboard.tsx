'use client';
import { useI18n, LanguageSelect } from '../ui/i18n';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Layers3,
  Plus,
  ArrowUpRight,
  LayoutDashboard,
  LogOut,
} from 'lucide-react';
import { api } from '../ui/providers';
import { ThemeToggle } from '../ui/theme';
import { asError } from '../../src/lib/api-client';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { useHydrated } from '../ui/use-hydrated';
import { Usage } from './usage';
import { Restore } from './restore';
import { DeleteAccount } from './delete-account';
import { Members } from './members';
import type { Workspace, SessionState, WorkspaceDetail } from './types';
export function Dashboard() {
  const { t } = useI18n();
  const ready = useHydrated();

  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const logoutPending = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: ({ signal }) => api<SessionState>('/api/auth/session', { signal }),
  });
  const list = useQuery({
    queryKey: ['workspaces'],
    queryFn: ({ signal }) => api<Workspace[]>('/api/workspaces', { signal }),
  });
  const id =
    list.data?.find((workspace) => workspace.id === selected)?.id ??
    list.data?.[0]?.id;
  const detail = useQuery({
    queryKey: ['workspace', id],
    queryFn: ({ signal }) =>
      api<WorkspaceDetail>(`/api/workspaces/${id}`, { signal }),
    enabled: !!id,
  });
  async function run(fn: () => Promise<unknown>) {
    if (!ready || pending.current || logoutPending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      setError(null);
      await fn();
      await client.invalidateQueries({ queryKey: ['workspace'] });
      await client.invalidateQueries({ queryKey: ['workspaces'] });
    } catch (e) {
      setError(asError(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function action(data: object) {
    await api(`/api/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  async function signOut() {
    if (!ready || logoutPending.current || pending.current) return;
    logoutPending.current = true;
    setSigningOut(true);
    setError(null);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      location.replace('/login');
    } catch (caught) {
      setError(asError(caught));
      logoutPending.current = false;
      setSigningOut(false);
    }
  }
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-5">
        <Link href="/" className="brand">
          <Layers3 />
          CollabEdge
        </Link>
        <div className="flex gap-3">
          {session.data?.user && (
            <span className="hidden self-center text-sm text-muted sm:inline">
              {session.data.user.email}
            </span>
          )}
          <LanguageSelect />
          <ThemeToggle />
          <button
            className="icon-button"
            aria-label={t('Sign out')}
            disabled={!ready || signingOut || busy}
            aria-busy={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-4">
        <fieldset
          disabled={!ready || busy || signingOut}
          aria-busy={busy}
          className="contents"
        >
          <aside className="motion-reveal">
            <p className="eyebrow mb-5">{t('YOUR WORKSPACES')}</p>
            <div className="space-y-2">
              {list.data?.map((w) => (
                <button
                  key={w.id}
                  className={`flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm ${w.id === id ? 'bg-border font-medium' : ''}`}
                  onClick={() => setSelected(w.id)}
                >
                  <LayoutDashboard size={17} />
                  {w.name}
                </button>
              ))}
            </div>
            <form
              className="mt-8 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = String(new FormData(form).get('name'));
                void run(async () => {
                  const result = await api<{ id: string }>('/api/workspaces', {
                    method: 'POST',
                    body: JSON.stringify({ name }),
                  });
                  setSelected(result.id);
                  form.reset();
                });
              }}
            >
              <label className="field">
                {t('New workspace')}
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder={t('Your team’s name')}
                />
              </label>
              <button className="button secondary w-full">
                <Plus size={16} />
                {t('Create workspace')}
              </button>
            </form>
            <p className="mt-4 text-xs text-muted">
              {t('Up to 3 workspaces per account.')}
            </p>
            {session.data?.canDeleteAccount && list.data && (
              <DeleteAccount
                key={session.data.user?.id}
                ownsWorkspace={list.data.some(
                  (workspace) => workspace.role === 'OWNER',
                )}
              />
            )}
          </aside>
          <main className="motion-reveal motion-delay-1 lg:col-span-3">
            {session.data?.user &&
              session.data.verifiedEmail &&
              session.data.canVerifyEmail &&
              session.data.emailVerified === false && (
                <div className="notice mb-6">
                  <p>
                    {t(
                      'Your account uses {current}. Cloudflare Access verified {verified}. Use the verified email to enable password recovery.',
                      {
                        current: session.data.user.email,
                        verified: session.data.verifiedEmail,
                      },
                    )}
                  </p>
                  <button
                    className="button secondary mt-4"
                    onClick={() =>
                      void run(async () => {
                        await api('/api/auth/verify-email', { method: 'POST' });
                        await client.invalidateQueries({
                          queryKey: ['auth', 'session'],
                        });
                      })
                    }
                  >
                    {t('Use verified email')}
                  </button>
                </div>
              )}
            <ApiErrorNotice
              error={error || list.error || detail.error || session.error}
              className="mb-6"
              onRetry={() => {
                setError(null);
                void client.invalidateQueries({
                  queryKey: ['auth', 'session'],
                });
                void client.invalidateQueries({ queryKey: ['workspaces'] });
                void client.invalidateQueries({ queryKey: ['workspace'] });
              }}
            />
            {list.isPending && (
              <div role="status" className="surface h-40 animate-pulse p-6">
                {t('Loading your workspaces…')}
              </div>
            )}
            {!id && !list.isPending && (
              <div className="surface p-10">
                <h1 className="text-3xl font-semibold">
                  {t('A fresh space for your team.')}
                </h1>
                <p className="mt-4 text-muted">
                  {t('Create a workspace to start planning together.')}
                </p>
              </div>
            )}
            {detail.data && (
              <>
                <p className="eyebrow">
                  {t('WORKSPACE /')} {t(detail.data.role)}
                </p>
                <h1 className="mt-3 text-3xl font-semibold">
                  {detail.data.workspace.name}
                </h1>
                <p className="mt-3 text-muted">
                  {t('A shared view of what’s moving forward.')}
                </p>
                {detail.data.role === 'OWNER' && (
                  <Usage
                    key={`usage:${detail.data.workspace.id}`}
                    workspaceId={detail.data.workspace.id}
                  />
                )}
                {detail.data.role === 'OWNER' && session.data?.user && (
                  <Restore
                    key={`${detail.data.workspace.id}:${session.data.user.id}`}
                    workspaceId={detail.data.workspace.id}
                    members={detail.data.members}
                  />
                )}
                <label className="mt-6 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="w-auto"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  {t('Show archived boards')}
                </label>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {detail.data.boards
                    .filter((board) => board.archived === showArchived)
                    .map((board, index) => (
                      <Link
                        key={board.id}
                        href={`/boards/${board.id}`}
                        className="surface interactive-surface motion-card group p-6"
                        style={{ animationDelay: `${index * 70}ms` }}
                      >
                        <div className="flex justify-between">
                          <LayoutDashboard className="text-primary" size={24} />
                          <ArrowUpRight size={18} />
                        </div>
                        <h2 className="mt-6 font-semibold">{board.name}</h2>
                        <p className="mt-2 text-xs text-muted">
                          {t('Revision {revision} · Realtime board', {
                            revision: board.revision,
                          })}
                        </p>
                      </Link>
                    ))}
                </div>
                {detail.data.role !== 'VIEWER' && (
                  <form
                    key={`new-board:${detail.data.workspace.id}`}
                    className="mt-6 flex items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      void run(async () => {
                        await api('/api/boards', {
                          method: 'POST',
                          body: JSON.stringify({
                            workspaceId: id,
                            name: new FormData(form).get('name'),
                          }),
                        });
                        setShowArchived(false);
                        form.reset();
                      });
                    }}
                  >
                    <label className="field flex-1">
                      {t('New board')}
                      <input
                        name="name"
                        required
                        maxLength={80}
                        placeholder={t('What are we working toward?')}
                      />
                    </label>
                    <button className="button">
                      <Plus size={16} />
                      {t('Create board')}
                    </button>
                  </form>
                )}
                <Members
                  key={`members:${detail.data.workspace.id}`}
                  detail={detail.data}
                  currentUserId={session.data?.user?.id}
                  run={run}
                  action={action}
                  onLeave={() => setSelected('')}
                />
              </>
            )}
          </main>
        </fieldset>
      </div>
    </div>
  );
}
