import { redirect } from 'next/navigation';
import { AuthForm } from '../../components/auth-form';
import { pageUser, safeReturnTo } from '../../src/auth/page-session';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  if (await pageUser()) redirect('/workspaces');
  const { next } = await searchParams;
  return <AuthForm registerMode returnTo={safeReturnTo(next)} />;
}
