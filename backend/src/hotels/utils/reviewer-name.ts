import { AccountStatus } from '../../users/schemas/user.schema';

/** ACC-12: reviews of deactivated or missing accounts are shown under this name. */
export const DELETED_USER = 'Deleted user';

/** HTL-02: first name and last initial, e.g. "Sara M.". */
export function reviewerName(user?: { firstName?: string; lastName?: string; status?: AccountStatus } | null): string {
  if (!user || user.status === AccountStatus.DEACTIVATED) {
    return DELETED_USER;
  }
  return `${user.firstName ?? ''} ${(user.lastName ?? '').charAt(0)}.`.trim();
}