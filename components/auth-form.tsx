'use client';
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
  email: z.email(),
  password: z.string().min(12, 'Use at least 12 characters').max(128),
  name: z.string().max(80).optional(),
});
export function AuthForm({ registerMode = false }: { registerMode?: boolean }) {
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
      <div className="w-full max-w-md">
        <Link href="/" className="brand mb-12">
          <Layers3 /> CollabEdge
        </Link>
        <p className="eyebrow">YOUR NEXT CHAPTER</p>
        <h1 className="mt-3 text-3xl font-semibold">
          {registerMode ? 'Make room for good work.' : 'Welcome back.'}
        </h1>
        <p className="mt-3 text-muted">
          {registerMode
            ? 'Create an account and bring your team together.'
            : 'Your team’s shared space is right here.'}
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
              Your name
              <input autoComplete="name" required {...register('name')} />
            </label>
          )}
          <label className="field">
            Email address
            <input type="email" autoComplete="email" {...register('email')} />
            {errors.email && (
              <span className="text-destructive">{errors.email.message}</span>
            )}
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete={registerMode ? 'new-password' : 'current-password'}
              {...register('password')}
            />
            {errors.password && (
              <span className="text-destructive">
                {errors.password.message}
              </span>
            )}
          </label>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button
            className="button w-full"
            disabled={isSubmitting || !hydrated}
          >
            {isSubmitting
              ? 'Just a moment…'
              : registerMode
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {registerMode ? 'Already have a space?' : 'New here?'}{' '}
          <Link
            className="text-primary"
            href={registerMode ? '/login' : '/register'}
          >
            {registerMode ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
        <p className="mt-8 text-xs leading-relaxed text-muted">
          Portfolio environment · limited capacity. Keep sensitive information
          out of shared demo boards.
        </p>
      </div>
    </main>
  );
}
