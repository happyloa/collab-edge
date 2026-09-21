'use client';
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
} from 'lucide-react';
import { api } from '../ui/providers';
import { ThemeToggle } from '../ui/theme';
type Workspace = { id: string; name: string; role: string };
type Detail = {
  workspace: Workspace;
  boards: { id: string; name: string; revision: number }[];
  members: { userId: string; name: string; email: string; role: string }[];
  role: string;
};
export function Dashboard() {
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
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
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-5">
        <Link href="/" className="brand">
          <Layers3 />
          CollabEdge
        </Link>
        <div className="flex gap-3">
          <ThemeToggle />
          <button
            className="icon-button"
            aria-label="Sign out"
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
        <aside>
          <p className="eyebrow mb-5">YOUR WORKSPACES</p>
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
              New workspace
              <input
                name="name"
                required
                maxLength={80}
                placeholder="Your team’s name"
              />
            </label>
            <button className="button secondary w-full">
              <Plus size={16} />
              Create workspace
            </button>
          </form>
          <p className="mt-4 text-xs text-muted">
            Up to 3 workspaces per account.
          </p>
        </aside>
        <main className="lg:col-span-3">
          {(error || list.error || detail.error) && (
            <div role="alert" className="notice error mb-6">
              {error || list.error?.message || detail.error?.message}{' '}
              {list.error && <Link href="/login">Sign in →</Link>}
            </div>
          )}
          {list.isPending && (
            <div role="status" className="surface h-40 animate-pulse p-6">
              Loading your workspaces…
            </div>
          )}
          {!id && !list.isPending && (
            <div className="surface p-10">
              <h1 className="text-3xl font-semibold">
                A fresh space for your team.
              </h1>
              <p className="mt-4 text-muted">
                Create a workspace to start planning together.
              </p>
            </div>
          )}
          {detail.data && (
            <>
              <p className="eyebrow">WORKSPACE / {detail.data.role}</p>
              <h1 className="mt-3 text-3xl font-semibold">
                {detail.data.workspace.name}
              </h1>
              <p className="mt-3 text-muted">
                A shared view of what’s moving forward.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {detail.data.boards.map((board) => (
                  <Link
                    key={board.id}
                    href={`/boards/${board.id}`}
                    className="surface group p-6"
                  >
                    <div className="flex justify-between">
                      <LayoutDashboard className="text-primary" size={24} />
                      <ArrowUpRight size={18} />
                    </div>
                    <h2 className="mt-6 font-semibold">{board.name}</h2>
                    <p className="mt-2 text-xs text-muted">
                      Revision {board.revision} · Realtime board
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
                    New board
                    <input
                      name="name"
                      required
                      maxLength={80}
                      placeholder="What are we working toward?"
                    />
                  </label>
                  <button className="button">
                    <Plus size={16} />
                    Create board
                  </button>
                </form>
              )}
              <section className="surface mt-10 p-6">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Users size={18} />
                  People in this space
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
                              aria-label={`Role for ${member.name}`}
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
                              <option>EDITOR</option>
                              <option>VIEWER</option>
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
                              Remove
                            </button>
                          </>
                        ) : (
                          <span className="badge">{member.role}</span>
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
                        Invite a registered teammate
                        <input
                          type="email"
                          name="email"
                          required
                          placeholder="name@team.com"
                        />
                      </label>
                      <label className="field">
                        Role
                        <select name="role">
                          <option>EDITOR</option>
                          <option>VIEWER</option>
                        </select>
                      </label>
                      <button className="button secondary">Add member</button>
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
                        Workspace name
                        <input
                          name="name"
                          defaultValue={detail.data.workspace.name}
                          key={id}
                          required
                          maxLength={80}
                        />
                      </label>
                      <button className="button secondary">Rename</button>
                    </form>
                  </>
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
                    Leave workspace
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
