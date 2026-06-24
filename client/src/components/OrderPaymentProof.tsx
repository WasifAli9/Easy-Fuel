import { CreditCard } from "lucide-react";
import {
  formatOrderPaidAt,
  formatOrderPaymentAmount,
  getOrderPaymentFromOrder,
  type OrderPaymentOrderFields,
} from "@shared/order-payment-proof";

type OrderPaymentProofProps = {
  order: OrderPaymentOrderFields;
  className?: string;
};

export function OrderPaymentProof({ order, className = "" }: OrderPaymentProofProps) {
  const proof = getOrderPaymentFromOrder(order);
  if (!proof.hasProof) {
    return null;
  }

  const paidAtLabel = formatOrderPaidAt(proof.paidAt);
  const amountLabel = formatOrderPaymentAmount(proof.amountCents);

  return (
    <div
      className={`rounded-lg border border-border bg-muted/30 p-4 space-y-3 ${className}`}
      data-testid="order-payment-proof"
    >
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-foreground" />
        <p className="text-sm font-semibold text-foreground">Payment received</p>
      </div>

      {amountLabel ? (
        <div>
          <p className="text-xs font-medium text-foreground/80">Amount paid</p>
          <p className="text-sm font-medium text-foreground" data-testid="text-order-payment-amount">
            {amountLabel}
          </p>
        </div>
      ) : null}

      {paidAtLabel ? (
        <div>
          <p className="text-xs font-medium text-foreground/80">Paid at</p>
          <p className="text-sm text-foreground" data-testid="text-order-paid-at">
            {paidAtLabel}
          </p>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium text-foreground/80">Payment method</p>
        <p className="text-sm text-foreground">Ozow</p>
      </div>
    </div>
  );
}
