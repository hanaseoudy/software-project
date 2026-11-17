import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** GEN-01-B: email over SMTP, shared by notifications (GEN-01) and moderator invitations (ACC-13). */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
