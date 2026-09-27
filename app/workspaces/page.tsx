import { Dashboard } from '../../components/workspace/dashboard';
import { requirePageUser } from '../../src/auth/page-session';

export default async function Page() {
  await requirePageUser('/workspaces');
  return <Dashboard />;
}
