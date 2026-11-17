import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
  createTestAccount: jest.fn(),
  getTestMessageUrl: jest.fn(),
}));

const mocked = nodemailer as jest.Mocked<typeof nodemailer>;

function setup(env: Record<string, string | undefined> = {}) {
  const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
  mocked.createTransport.mockReturnValue({ sendMail } as any);
  const config = { get: jest.fn((key: string) => env[key]) };
  return { service: new MailService(config as any), sendMail };
}

describe('MailService (GEN-01-B)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mocked.getTestMessageUrl.mockReturnValue(false);
  });

  describe('SMTP connection', () => {
    it('uses the SMTP server from the settings when SMTP_HOST is set', async () => {
      const { service, sendMail } = setup({
        SMTP_HOST: 'sandbox.smtp.mailtrap.io',
        SMTP_PORT: '2525',
        SMTP_USER: 'user1',
        SMTP_PASS: 'pass1',
      });

      expect(await service.send({ to: 'a@test.com', subject: 'Hi', text: 'Hello' })).toBe(true);

      expect(mocked.createTransport).toHaveBeenCalledWith({
        host: 'sandbox.smtp.mailtrap.io',
        port: 2525,
        secure: false,
        auth: { user: 'user1', pass: 'pass1' },
      });
      expect(mocked.createTestAccount).not.toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@test.com', subject: 'Hi' }));
    });

    it('uses a secure connection on port 465', async () => {
      const { service } = setup({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' });
      await service.send({ to: 'a@test.com', subject: 'Hi', text: 'Hello' });
      expect(mocked.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
    });

    it('creates an Ethereal test inbox in development when no SMTP server is set', async () => {
      mocked.createTestAccount.mockResolvedValue({
        user: 'test@ethereal.email',
        pass: 'secret',
        smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
      } as any);
      const { service, sendMail } = setup({});
      mocked.getTestMessageUrl.mockReturnValue('https://ethereal.email/message/abc');

      expect(await service.send({ to: 'a@test.com', subject: 'Hi', text: 'Hello' })).toBe(true);

      expect(mocked.createTestAccount).toHaveBeenCalledTimes(1);
      expect(mocked.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'smtp.ethereal.email', auth: { user: 'test@ethereal.email', pass: 'secret' } }),
      );
      expect(sendMail).toHaveBeenCalled();
    });

    it('creates the connection only once for many emails', async () => {
      const { service } = setup({ SMTP_HOST: 'smtp.example.com' });
      await service.send({ to: 'a@test.com', subject: '1', text: 'x' });
      await service.send({ to: 'b@test.com', subject: '2', text: 'y' });
      expect(mocked.createTransport).toHaveBeenCalledTimes(1);
    });

    it('turns email off in production when no SMTP server is set', async () => {
      const { service, sendMail } = setup({ NODE_ENV: 'production' });
      expect(await service.send({ to: 'a@test.com', subject: 'Hi', text: 'Hello' })).toBe(false);
      expect(mocked.createTestAccount).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('returns false instead of throwing when sending fails', async () => {
      const { service, sendMail } = setup({ SMTP_HOST: 'smtp.example.com' });
      sendMail.mockRejectedValue(new Error('Connection refused'));
      await expect(service.send({ to: 'a@test.com', subject: 'Hi', text: 'Hello' })).resolves.toBe(false);
    });

    it('returns false when the test inbox cannot be created (e.g. offline)', async () => {
      mocked.createTestAccount.mockRejectedValue(new Error('offline'));
      const { service } = setup({});
      await expect(service.send({ to: 'a@test.com', subject: 'Hi', text: 'Hello' })).resolves.toBe(false);
    });
  });

  describe('email content', () => {
    it('sends a GEN-01 notification with its title, message and a link to the notifications page', async () => {
      const { service, sendMail } = setup({ SMTP_HOST: 'smtp.example.com', FRONTEND_URL: 'http://localhost:3001/' });

      await service.sendNotification('sara@test.com', 'Sara', 'Booking confirmed', 'Your booking FB-1 is confirmed.');

      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe('sara@test.com');
      expect(mail.subject).toBe('Booking confirmed');
      expect(mail.text).toContain('Hi Sara,');
      expect(mail.text).toContain('Your booking FB-1 is confirmed.');
      expect(mail.text).toContain('http://localhost:3001/notifications');
      expect(mail.html).toContain('href="http://localhost:3001/notifications"');
    });

    it('sends a moderator invitation with role, provider and login link, and no password', async () => {
      const { service, sendMail } = setup({ SMTP_HOST: 'smtp.example.com' });

      await service.sendModeratorInvitation({
        to: 'sara@nilepalace.com',
        firstName: 'Sara',
        providerType: 'hotel',
        providerName: 'Nile Palace',
      });

      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe('You have been invited as hotel moderator for Nile Palace');
      expect(mail.text).toContain('sara@nilepalace.com');
      expect(mail.text).toContain('choose a new password the first time you log in');
      expect(mail.text).toContain('http://localhost:3001/login');
      expect(mail.text.toLowerCase()).not.toMatch(/password:\s*\S/);
    });

    it('escapes HTML so a message cannot inject markup', async () => {
      const { service, sendMail } = setup({ SMTP_HOST: 'smtp.example.com' });
      await service.send({ to: 'a@test.com', subject: 'x', text: '<script>alert(1)</script>' });
      const html: string = sendMail.mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
