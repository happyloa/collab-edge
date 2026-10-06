'use client';
import { Users, ArrowRightLeft } from 'lucide-react';
import { useI18n } from '../ui/i18n';
import { PasswordInput } from '../ui/password-input';
import type { WorkspaceDetail } from './types';

export function Members({
  detail,
  currentUserId,
  run,
  action,
  onLeave,
}: {
  detail: WorkspaceDetail;
  currentUserId?: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  action: (data: object) => Promise<void>;
  onLeave: () => void;
}) {
  const { t, locale } = useI18n();
  const id = detail.workspace.id;
  return (
    <section className="surface mt-10 p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Users size={18} />
        {t('People in this space')}
      </h2>
      <ul className="mt-5 divide-y divide-border">
        {detail.members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div>
              <p className="text-sm font-medium">{member.name}</p>
              <p className="text-xs text-muted">{member.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {detail?.role === 'OWNER' && member.role !== 'OWNER' ? (
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
      {detail.role === 'OWNER' && (
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
            <button className="button secondary">{t('Add member')}</button>
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
                defaultValue={detail.workspace.name}
                key={id}
                required
                maxLength={80}
              />
            </label>
            <button className="button secondary">{t('Rename')}</button>
          </form>
          {detail.canTransferOwnership && (
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
              {detail.transfer ? (
                <div className="notice mt-4">
                  <p>
                    {t('Transfer pending for {name} until {date}.', {
                      name:
                        detail.members.find(
                          (member) =>
                            member.userId === detail?.transfer?.toUserId,
                        )?.name ?? t('Former member'),
                      date: new Date(detail.transfer.expiresAt).toLocaleString(
                        locale,
                      ),
                    })}
                  </p>
                  <button
                    className="button secondary mt-4"
                    onClick={() =>
                      void run(() => action({ action: 'transfer.cancel' }))
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
                      {detail.members
                        .filter(
                          (member) =>
                            member.role !== 'OWNER' &&
                            member.canReceiveOwnership,
                        )
                        .map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="field flex-1">
                    <label htmlFor="transfer-propose-password">
                      {t('Confirm with your password')}
                    </label>
                    <PasswordInput
                      id="transfer-propose-password"
                      name="password"
                      required
                      maxLength={128}
                      autoComplete="current-password"
                    />
                  </div>
                  <button
                    className="button secondary"
                    disabled={
                      !detail.members.some(
                        (member) =>
                          member.role !== 'OWNER' && member.canReceiveOwnership,
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
      {detail.transfer && detail.transfer.toUserId === currentUserId && (
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <ArrowRightLeft size={18} />
            {t('Ownership request')}
          </h3>
          <p className="mt-2 text-sm text-muted">
            {t(
              'Accept from your own account before {date}. You will become the owner.',
              {
                date: new Date(detail.transfer.expiresAt).toLocaleString(
                  locale,
                ),
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
            <div className="field flex-1">
              <label htmlFor="transfer-accept-password">
                {t('Confirm with your password')}
              </label>
              <PasswordInput
                id="transfer-accept-password"
                name="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </div>
            <button className="button">{t('Accept ownership')}</button>
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
      {detail.role !== 'OWNER' && (
        <button
          className="mt-5 text-sm text-destructive"
          onClick={() =>
            void run(async () => {
              await action({ action: 'leave' });
              onLeave();
            })
          }
        >
          {t('Leave workspace')}
        </button>
      )}
    </section>
  );
}
