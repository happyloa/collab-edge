import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUserForToken } from './session';

export function safeReturnTo(value: unknown): string {
  if (value === '/workspaces') return value;
  if (
    typeof value === 'string' &&
    /^\/boards\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  )
    return value;
  return '/workspaces';
}

export async function pageUser() {
  return currentUserForToken((await cookies()).get('ce_session')?.value);
}

export async function requirePageUser(returnTo: string) {
  const user = await pageUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return user;
}
