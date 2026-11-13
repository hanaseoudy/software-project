import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

const errorsFor = async (body: object) => {
  const errors = await validate(plainToInstance(ChangePasswordDto, body));
  return Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]));
};

describe('ChangePasswordDto (ACC-08)', () => {
  it('accepts a valid body', async () => {
    expect(await errorsFor({ currentPassword: 'Temp1234', newPassword: 'NewPass123' })).toEqual({});
  });

  it('requires the current password', async () => {
    const errors = await errorsFor({ newPassword: 'NewPass123' });
    expect(errors.currentPassword).toContain('Current password is required');
  });

  it('applies the password rules to the new password', async () => {
    expect((await errorsFor({ currentPassword: 'Temp1234', newPassword: 'abc' })).newPassword).toEqual(
      expect.arrayContaining([
        'Password must be at least 8 characters',
        'Password must contain at least one letter and one digit',
      ]),
    );
    expect((await errorsFor({ currentPassword: 'Temp1234', newPassword: 'a'.repeat(73) + '1' })).newPassword).toContain(
      'Password must be at most 72 bytes',
    );
  });
});