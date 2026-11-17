import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body; the HTML version is built from it. */
  text: string;
  /** Optional button shown under the message. */
  action?: { label: string; url: string };
}

export interface ModeratorInvitation {
  to: string;
  firstName: string;
  providerType: 'hotel' | 'airline';
  providerName: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * GEN-01-B: sends emails over SMTP.
 *
 * - SMTP_HOST set: uses that server (e.g. a Mailtrap test inbox, or a real server in production).
 * - SMTP_HOST not set, outside production: creates a free Ethereal test inbox; every email is caught
 *   there (nothing is delivered to real people) and its preview link is printed in the server log.
 * - SMTP_HOST not set in production: email is turned off and a warning is logged.
 *
 * Sending never throws: a failed email is logged and the caller carries on, so an in-app
 * notification or a new account is never lost because of email.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Promise<Transporter | null>;

  constructor(private readonly config: ConfigService) {}

  private get from(): string {
    return this.config.get<string>('MAIL_FROM') ?? 'Travel Planner <no-reply@travel-planner.test>';
  }

  /** Base address of the website, used for links in emails. */
  get appUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001').replace(/\/+$/, '');
  }

  private getTransporter(): Promise<Transporter | null> {
    this.transporter ??= this.createTransporter();
    return this.transporter;
  }

  private async createTransporter(): Promise<Transporter | null> {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
      const user = this.config.get<string>('SMTP_USER');
      const pass = this.config.get<string>('SMTP_PASS');
      return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
      });
    }

    if (this.config.get<string>('NODE_ENV') === 'production') {
      this.logger.warn('SMTP_HOST is not set: emails are turned off.');
      return null;
    }

    try {
      const account = await nodemailer.createTestAccount();
      this.logger.log(`Email test inbox (Ethereal) ready: log in at https://ethereal.email with ${account.user}`);
      return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    } catch (error) {
      this.logger.warn(`Could not create the Ethereal test inbox, emails are turned off: ${(error as Error).message}`);
      return null;
    }
  }

  /** Sends one email. Returns true if the SMTP server accepted it. */
  async send(message: MailMessage): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) return false;
      const info = await transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.action ? `${message.text}\n\n${message.action.label}: ${message.action.url}` : message.text,
        html: this.toHtml(message),
      });
      const preview = nodemailer.getTestMessageUrl(info);
      this.logger.log(`Email "${message.subject}" sent${preview ? `, view it in the test inbox: ${preview}` : ''}`);
      return true;
    } catch (error) {
      this.logger.error(`Email "${message.subject}" could not be sent: ${(error as Error).message}`);
      return false;
    }
  }

  /** GEN-01-B: the same notification the user sees in the app, sent by email. */
  sendNotification(to: string, firstName: string | undefined, title: string, message: string): Promise<boolean> {
    return this.send({
      to,
      subject: title,
      text: `${firstName ? `Hi ${firstName},` : 'Hi,'}\n\n${message}`,
      action: { label: 'View your notifications', url: `${this.appUrl}/notifications` },
    });
  }

  /**
   * GEN-01-B: invitation for a moderator account created by an admin (ACC-13).
   * The temporary password is never put in an email; the admin gives it to the moderator.
   */
  sendModeratorInvitation(invite: ModeratorInvitation): Promise<boolean> {
    const role = invite.providerType === 'hotel' ? 'hotel moderator' : 'airline moderator';
    return this.send({
      to: invite.to,
      subject: `You have been invited as ${role} for ${invite.providerName}`,
      text:
        `Hi ${invite.firstName},\n\n` +
        `An administrator created a Travel Planner account for you as ${role} for ${invite.providerName}.\n\n` +
        `Log in with this email address (${invite.to}) and the temporary password your administrator gives you. ` +
        `You will be asked to choose a new password the first time you log in.`,
      action: { label: 'Log in', url: `${this.appUrl}/login` },
    });
  }

  private toHtml(message: MailMessage): string {
    const paragraphs = message.text
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
    const button = message.action
      ? `<p><a href="${escapeHtml(message.action.url)}">${escapeHtml(message.action.label)}</a></p>`
      : '';
    return `<div style="font-family: Arial, sans-serif; line-height: 1.5">${paragraphs}${button}</div>`;
  }
}
