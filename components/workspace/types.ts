export type Workspace = { id: string; name: string; role: string };
export type SessionState = {
  user: { id: string; email: string } | null;
  canDeleteAccount?: boolean;
  emailVerified?: boolean;
  verifiedEmail?: string | null;
  canVerifyEmail?: boolean;
};
export type WorkspaceDetail = {
  workspace: Workspace;
  boards: { id: string; name: string; revision: number; archived: boolean }[];
  members: {
    userId: string;
    name: string;
    email: string;
    role: string;
    canReceiveOwnership: boolean;
  }[];
  role: string;
  canTransferOwnership: boolean;
  transfer: {
    fromUserId: string;
    toUserId: string;
    expiresAt: number;
  } | null;
};
