import { Home } from '../components/home';
import { pageUser } from '../src/auth/page-session';

export default async function Page() {
  return <Home signedIn={!!(await pageUser())} />;
}
