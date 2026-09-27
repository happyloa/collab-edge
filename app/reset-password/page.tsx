import { PasswordResetForm } from '../../components/password-reset-form';
import { pageUser } from '../../src/auth/page-session';

export default async function Page() {
  return <PasswordResetForm signedIn={!!(await pageUser())} />;
}
