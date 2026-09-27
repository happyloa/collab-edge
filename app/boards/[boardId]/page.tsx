import { BoardLoader } from '../../../components/board/board';
import { requirePageUser } from '../../../src/auth/page-session';
export default async function Page({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  await requirePageUser(`/boards/${boardId}`);
  return <BoardLoader id={boardId} />;
}
