import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

/**
 * PAY-01: when a booking hold expires, its PaymentIntent is cancelled.
 * Runs every minute, like the FLT-22 / HTL-18 hold-expiry jobs that mark the
 * booking itself Expired and release the seats or rooms.
 * PAY-03: also re-checks refunds still Pending in Stripe, in case a webhook was missed.
 */
@Injectable()
export class PaymentExpiryService {
  private readonly logger = new Logger(PaymentExpiryService.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      const count = await this.paymentsService.cancelExpiredPayments();
      if (count) this.logger.log(`Cancelled ${count} expired payment(s)`);
      const synced = await this.refundsService.syncPendingRefunds();
      if (synced) this.logger.log(`Updated ${synced} pending refund(s) from Stripe`);
    } catch (error) {
      this.logger.error(`Payment expiry sweep failed: ${(error as Error).message}`);
    }
  }
}
