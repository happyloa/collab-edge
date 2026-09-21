import { BoardLoader } from '../../../components/board/board';
export default async function Page({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  return <BoardLoader id={boardId} />;
}
