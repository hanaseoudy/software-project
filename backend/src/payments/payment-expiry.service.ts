import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

const SWEEP_INTERVAL_MS = 60_000;

/**
 * PAY-01: periodically cancels the PaymentIntents of expired booking holds.
 * PAY-03: also re-checks refunds that are still Pending in case a webhook was missed.
 */
@Injectable()
export class PaymentExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref(); // never keeps the process (or tests) alive
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

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
