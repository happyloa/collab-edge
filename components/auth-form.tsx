'use client';
import { useI18n, LanguageSelect } from './ui/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from './ui/use-hydrated';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Layers3 } from 'lucide-react';
import { api } from './ui/providers';
const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(128, 'Use at most 128 characters'),
  name: z.string().max(80, 'Use at most 80 characters').optional(),
});
export function AuthForm({ registerMode = false }: { registerMode?: boolean }) {
  const { t, errorText } = useI18n();

  const hydrated = useHydrated();
  const router = useRouter();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="motion-reveal w-full max-w-md">
        <Link href="/" className="brand mb-12">
          <Layers3 /> CollabEdge
        </Link>
        <div className="mb-6 flex justify-end">
          <LanguageSelect />
        </div>
        <p className="eyebrow">{t('YOUR NEXT CHAPTER')}</p>
        <h1 className="mt-3 text-3xl font-semibold">
          {t(registerMode ? 'Make room for good work.' : 'Welcome back.')}
        </h1>
        <p className="mt-3 text-muted">
          {t(
            registerMode
              ? 'Create an account and bring your team together.'
              : 'Your team’s shared space is right here.',
          )}
        </p>
        <form
          method="post"
          className="mt-8 space-y-5"
          onSubmit={handleSubmit(async (values) => {
            try {
              setError('');
              await api(`/api/auth/${registerMode ? 'register' : 'login'}`, {
                method: 'POST',
                body: JSON.stringify(values),
              });
              router.push('/workspaces');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Sign in failed');
            }
          })}
        >
          {registerMode && (
            <label className="field">
              {t('Your name')}
              <input
                autoComplete="name"
                required
                maxLength={80}
                {...register('name')}
              />
              {errors.name && (
                <span className="text-destructive">
                  {t(errors.name.message ?? 'Use at most 80 characters')}
                </span>
              )}
            </label>
          )}
          <label className="field">
            {t('Email address')}
            <input type="email" autoComplete="email" {...register('email')} />
            {registerMode && (
              <span className="text-xs font-normal text-muted">
                {t(
                  'On the private site, use the email you verified with Cloudflare Access.',
                )}
              </span>
            )}
            {errors.email && (
              <span className="text-destructive">
                {t(errors.email.message ?? 'Enter a valid email address')}
              </span>
            )}
          </label>
          <label className="field">
            {t('Password')}
            <input
              type="password"
              autoComplete={registerMode ? 'new-password' : 'current-password'}
              {...register('password')}
            />
            {errors.password && (
              <span className="text-destructive">
                {t(errors.password.message ?? 'Use at least 12 characters')}
              </span>
            )}
          </label>
          {!registerMode && (
            <div className="text-right text-sm">
              <Link href="/reset-password" className="text-primary">
                {t('Forgot password?')}
              </Link>
            </div>
          )}
          {error && (
            <p role="alert" className="notice error">
              {errorText(error)}
            </p>
          )}
          <button
            className="button w-full"
            disabled={isSubmitting || !hydrated}
          >
            {t(
              isSubmitting
                ? 'Just a moment…'
                : registerMode
                  ? 'Create account'
                  : 'Sign in',
            )}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {t(registerMode ? 'Already have a space?' : 'New here?')}{' '}
          <Link
            className="text-primary"
            href={registerMode ? '/login' : '/register'}
          >
            {t(registerMode ? 'Sign in' : 'Create an account')}
          </Link>
        </p>
        <p className="mt-8 text-xs leading-relaxed text-muted">
          {t(
            'Portfolio environment · limited capacity. Keep sensitive information out of shared demo boards.',
          )}
        </p>
      </div>
    </main>
  );
}
