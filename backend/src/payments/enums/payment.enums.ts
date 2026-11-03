export enum BookingType {
  FLIGHT = 'flight',
  HOTEL = 'hotel',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum RefundStatus {
  PENDING = 'pending',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}