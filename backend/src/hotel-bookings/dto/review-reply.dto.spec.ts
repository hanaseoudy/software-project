import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReplyToReviewDto } from './review-reply.dto';

const messages = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(ReplyToReviewDto, body))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('ReplyToReviewDto (HTL-26)', () => {
  it('accepts a reply of 1 to 1000 characters and trims the spaces around it', async () => {
    expect(await messages({ text: 'Thank you' })).toEqual([]);
    expect(await messages({ text: 'x'.repeat(1000) })).toEqual([]);
    expect(plainToInstance(ReplyToReviewDto, { text: '  Thank you  ' }).text).toBe('Thank you');
  });

  it.each([undefined, '', '   '])('rejects %p as empty', async (text) => {
    expect(await messages({ text })).toEqual(['Reply is required']);
  });

  it('rejects a reply longer than 1000 characters', async () => {
    expect(await messages({ text: 'x'.repeat(1001) })).toEqual(['Reply must be at most 1000 characters']);
  });

  it('rejects a reply that is not text', async () => {
    expect((await messages({ text: 42 })).sort()).toContain('Reply must be text');
  });
});
