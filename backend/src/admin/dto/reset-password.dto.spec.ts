import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto';

const errorsFor = async (body: object) => {
  const errors = await validate(plainToInstance(ResetPasswordDto, body));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
};

describe('ResetPasswordDto (ACC-07a)', () => {
  it('accepts a temporary password that meets the rules', async () => {
    expect(await errorsFor({ temporaryPassword: 'Reset1234' })).toEqual([]);
  });

  it('applies the password rules', async () => {
    expect(await errorsFor({ temporaryPassword: 'abc' })).toEqual(
      expect.arrayContaining([
        'Password must be at least 8 characters',
        'Password must contain at least one letter and one digit',
      ]),
    );
    expect(await errorsFor({ temporaryPassword: 'a'.repeat(73) + '1' })).toContain('Password must be at most 72 bytes');
  });

  it('requires the temporary password', async () => {
    expect((await errorsFor({})).length).toBeGreaterThan(0);
  });
});