import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Refund, RefundSchema } from './schemas/refund.schema';
import {
  PolicyAcceptance,
  PolicyAcceptanceSchema,
} from './schemas/policy-acceptance.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: PolicyAcceptance.name, schema: PolicyAcceptanceSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class PaymentsModule {}