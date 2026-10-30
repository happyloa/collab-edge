import { BoardLoader } from '../../../components/board/board';
import { requirePageUser } from '../../../src/auth/page-session';
import { env } from 'cloudflare:workers';
export default async function Page({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  await requirePageUser(`/boards/${boardId}`);
  return (
    <BoardLoader
      id={boardId}
      attachmentsEnabled={env.ATTACHMENTS_ENABLED === 'true'}
    />
  );
}
