export type PaymentRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'failed';

export const PAYMENT_REQUEST_TRANSITIONS: Record<PaymentRequestStatus, PaymentRequestStatus[]> = {
  pending_approval: ['approved'],
  approved: ['processing'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export function assertValidTransition(
  from: PaymentRequestStatus,
  to: PaymentRequestStatus
) {
  const allowed = PAYMENT_REQUEST_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid payment request transition: ${from} → ${to}`);
  }
}
