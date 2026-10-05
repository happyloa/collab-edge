export { startRestoreSchema } from './transfer';
export { startRestore, workspaceRestoreStatus } from './restore';
import { AppError } from '../lib/errors';
import type { RestoreResult } from './restore';
export function unwrapRestore<T>(result: RestoreResult<T>): T {
  if (!result.ok)
    throw new AppError(result.status, result.message, result.code);
  return result.value;
}
