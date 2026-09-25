'use client';
import { useI18n, LanguageSelect } from '../ui/i18n';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Layers3,
  Plus,
  ArrowUpRight,
  Users,
  LayoutDashboard,
  LogOut,
  ArrowRightLeft,
} from 'lucide-react';
import { api } from '../ui/providers';
import { ThemeToggle } from '../ui/theme';
type Workspace = { id: string; name: string; role: string };
type SessionState = {
  user: { id: string; email: string } | null;
  emailVerified?: boolean;
  verifiedEmail?: string | null;
  canVerifyEmail?: boolean;
};
type Detail = {
  workspace: Workspace;
  boards: { id: string; name: string; revision: number; archived: boolean }[];
  members: {
    userId: string;
    name: string;
    email: string;
    role: string;
    canReceiveOwnership: boolean;
  }[];
  role: string;
  canTransferOwnership: boolean;
  transfer: {
    fromUserId: string;
    toUserId: string;
    expiresAt: number;
  } | null;
};
export function Dashboard() {
  const { t, errorText, locale } = useI18n();

  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => api<SessionState>('/api/auth/session'),
  });
  const list = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<Workspace[]>('/api/workspaces'),
  });
  const id = selected || list.data?.[0]?.id;
  const detail = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => api<Detail>(`/api/workspaces/${id}`),
    enabled: !!id,
  });
  async function run(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
      await client.invalidateQueries({ queryKey: ['workspace'] });
      await client.invalidateQueries({ queryKey: ['workspaces'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }
  async function action(data: object) {
    await api(`/api/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-5">
        <Link href="/" className="brand">
          <Layers3 />
          CollabEdge
        </Link>
        <div className="flex gap-3">
          <LanguageSelect />
          <ThemeToggle />
          <button
            className="icon-button"
            aria-label={t('Sign out')}
            onClick={() =>
              void run(async () => {
                await api('/api/auth/logout', { method: 'POST' });
                location.href = '/login';
              })
            }
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-4">
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
          {(error || list.error || detail.error) && (
            <div role="alert" className="notice error mb-6">
              {errorText(error || list.error?.message || detail.error?.message)}{' '}
              {list.error && <Link href="/login">{t('Sign in →')}</Link>}
            </div>
          )}
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
              <section className="surface mt-10 p-6">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Users size={18} />
                  {t('People in this space')}
                </h2>
                <ul className="mt-5 divide-y divide-border">
                  {detail.data.members.map((member) => (
                    <li
                      key={member.userId}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {detail.data?.role === 'OWNER' &&
                        member.role !== 'OWNER' ? (
                          <>
                            <select
                              className="w-auto text-xs"
                              aria-label={t('Role for {name}', {
                                name: member.name,
                              })}
                              value={member.role}
                              onChange={(e) =>
                                void run(() =>
                                  action({
                                    action: 'role',
                                    userId: member.userId,
                                    role: e.target.value,
                                  }),
                                )
                              }
                            >
                              <option value="EDITOR">{t('EDITOR')}</option>
                              <option value="VIEWER">{t('VIEWER')}</option>
                            </select>
                            <button
                              className="text-xs text-destructive"
                              onClick={() =>
                                void run(() =>
                                  action({
                                    action: 'remove',
                                    userId: member.userId,
                                  }),
                                )
                              }
                            >
                              {t('Remove')}
                            </button>
                          </>
                        ) : (
                          <span className="badge">{t(member.role)}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {detail.data.role === 'OWNER' && (
                  <>
                    <form
                      className="mt-5 flex flex-wrap items-end gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const data = new FormData(form);
                        void run(async () => {
                          await action({
                            action: 'invite',
                            email: data.get('email'),
                            role: data.get('role'),
                          });
                          form.reset();
                        });
                      }}
                    >
                      <label className="field flex-1">
                        {t('Invite a registered teammate')}
                        <input
                          type="email"
                          name="email"
                          required
                          placeholder={t('name@team.com')}
                        />
                      </label>
                      <label className="field">
                        {t('Role')}
                        <select name="role">
                          <option value="EDITOR">{t('EDITOR')}</option>
                          <option value="VIEWER">{t('VIEWER')}</option>
                        </select>
                      </label>
                      <button className="button secondary">
                        {t('Add member')}
                      </button>
                    </form>
                    <form
                      className="mt-5 flex items-end gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(() =>
                          action({
                            action: 'rename',
                            name: new FormData(e.currentTarget).get('name'),
                          }),
                        );
                      }}
                    >
                      <label className="field flex-1">
                        {t('Workspace name')}
                        <input
                          name="name"
                          defaultValue={detail.data.workspace.name}
                          key={id}
                          required
                          maxLength={80}
                        />
                      </label>
                      <button className="button secondary">
                        {t('Rename')}
                      </button>
                    </form>
                    {detail.data.canTransferOwnership && (
                      <div className="mt-8 border-t border-border pt-6">
                        <h3 className="flex items-center gap-2 font-semibold">
                          <ArrowRightLeft size={18} />
                          {t('Transfer ownership')}
                        </h3>
                        <p className="mt-2 text-sm text-muted">
                          {t(
                            'The recipient must sign in and accept. You remain the owner until then and become an editor afterward.',
                          )}
                        </p>
                        {detail.data.transfer ? (
                          <div className="notice mt-4">
                            <p>
                              {t('Transfer pending for {name} until {date}.', {
                                name:
                                  detail.data.members.find(
                                    (member) =>
                                      member.userId ===
                                      detail.data?.transfer?.toUserId,
                                  )?.name ?? t('Former member'),
                                date: new Date(
                                  detail.data.transfer.expiresAt,
                                ).toLocaleString(locale),
                              })}
                            </p>
                            <button
                              className="button secondary mt-4"
                              onClick={() =>
                                void run(() =>
                                  action({ action: 'transfer.cancel' }),
                                )
                              }
                            >
                              {t('Cancel transfer')}
                            </button>
                          </div>
                        ) : (
                          <form
                            className="mt-5 flex flex-wrap items-end gap-3"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = event.currentTarget;
                              const fields = new FormData(form);
                              void run(async () => {
                                await action({
                                  action: 'transfer.request',
                                  userId: fields.get('userId'),
                                  password: fields.get('password'),
                                });
                                form.reset();
                              });
                            }}
                          >
                            <label className="field flex-1">
                              {t('Transfer to')}
                              <select name="userId" required defaultValue="">
                                <option value="" disabled>
                                  {t('Choose a member')}
                                </option>
                                {detail.data.members
                                  .filter(
                                    (member) =>
                                      member.role !== 'OWNER' &&
                                      member.canReceiveOwnership,
                                  )
                                  .map((member) => (
                                    <option
                                      key={member.userId}
                                      value={member.userId}
                                    >
                                      {member.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label className="field flex-1">
                              {t('Confirm with your password')}
                              <input
                                type="password"
                                name="password"
                                required
                                maxLength={128}
                                autoComplete="current-password"
                              />
                            </label>
                            <button
                              className="button secondary"
                              disabled={
                                !detail.data.members.some(
                                  (member) =>
                                    member.role !== 'OWNER' &&
                                    member.canReceiveOwnership,
                                )
                              }
                            >
                              {t('Request transfer')}
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </>
                )}
                {detail.data.transfer &&
                  detail.data.transfer.toUserId === session.data?.user?.id && (
                    <div className="mt-8 border-t border-border pt-6">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <ArrowRightLeft size={18} />
                        {t('Ownership request')}
                      </h3>
                      <p className="mt-2 text-sm text-muted">
                        {t(
                          'Accept from your own account before {date}. You will become the owner.',
                          {
                            date: new Date(
                              detail.data.transfer.expiresAt,
                            ).toLocaleString(locale),
                          },
                        )}
                      </p>
                      <form
                        className="mt-5 flex flex-wrap items-end gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          const password = new FormData(form).get('password');
                          void run(async () => {
                            await action({
                              action: 'transfer.accept',
                              password,
                            });
                            form.reset();
                          });
                        }}
                      >
                        <label className="field flex-1">
                          {t('Confirm with your password')}
                          <input
                            type="password"
                            name="password"
                            required
                            maxLength={128}
                            autoComplete="current-password"
                          />
                        </label>
                        <button className="button">
                          {t('Accept ownership')}
                        </button>
                      </form>
                      <button
                        className="mt-4 text-sm text-destructive"
                        onClick={() =>
                          void run(() => action({ action: 'transfer.decline' }))
                        }
                      >
                        {t('Decline transfer')}
                      </button>
                    </div>
                  )}
                {detail.data.role !== 'OWNER' && (
                  <button
                    className="mt-5 text-sm text-destructive"
                    onClick={() =>
                      void run(async () => {
                        await action({ action: 'leave' });
                        setSelected('');
                      })
                    }
                  >
                    {t('Leave workspace')}
                  </button>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
