import { AccountStatus } from '../../users/schemas/user.schema';
import { DELETED_USER, reviewerName } from './reviewer-name';

describe('reviewerName (HTL-02, ACC-12)', () => {
  it('shows the first name and last initial', () => {
    expect(reviewerName({ firstName: 'Sara', lastName: 'Mohamed', status: AccountStatus.ACTIVE })).toBe('Sara M.');
  });

  it('shows "Deleted user" for a deactivated account', () => {
    expect(reviewerName({ firstName: 'Sara', lastName: 'Mohamed', status: AccountStatus.DEACTIVATED })).toBe(DELETED_USER);
  });

  it('shows "Deleted user" for a missing account', () => {
    expect(reviewerName(null)).toBe('Deleted user');
  });

  it('keeps the name of a suspended account', () => {
    expect(reviewerName({ firstName: 'Sara', lastName: 'Mohamed', status: AccountStatus.SUSPENDED })).toBe('Sara M.');
  });
});