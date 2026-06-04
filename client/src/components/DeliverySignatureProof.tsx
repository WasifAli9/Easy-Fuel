import { PenLine } from "lucide-react";
import {
  formatDeliverySignedAt,
  getDeliverySignatureFromOrder,
  type DeliverySignatureOrderFields,
} from "@shared/delivery-signature";

type DeliverySignatureProofProps = {
  order: DeliverySignatureOrderFields;
  className?: string;
};

export function DeliverySignatureProof({ order, className = "" }: DeliverySignatureProofProps) {
  const proof = getDeliverySignatureFromOrder(order);
  if (!proof.hasProof) {
    return null;
  }

  const signedAtLabel = formatDeliverySignedAt(proof.signedAt);

  return (
    <div
      className={`rounded-lg border border-border bg-muted/30 p-4 space-y-3 ${className}`}
      data-testid="delivery-signature-proof"
    >
      <div className="flex items-center gap-2">
        <PenLine className="h-4 w-4 text-foreground" />
        <p className="text-sm font-semibold text-foreground">Proof of delivery</p>
      </div>

      {proof.signatureName ? (
        <div>
          <p className="text-xs font-medium text-foreground/80">Signed by</p>
          <p className="text-sm font-medium text-foreground" data-testid="text-delivery-signature-name">
            {proof.signatureName}
          </p>
        </div>
      ) : null}

      {signedAtLabel ? (
        <div>
          <p className="text-xs font-medium text-foreground/80">Date & time</p>
          <p className="text-sm text-foreground" data-testid="text-delivery-signed-at">
            {signedAtLabel}
          </p>
        </div>
      ) : null}

      {proof.imageUri ? (
        <div>
          <p className="text-xs font-medium text-foreground/80 mb-2">Signature</p>
          <div className="rounded-md border border-border bg-white p-2 inline-block max-w-full">
            <img
              src={proof.imageUri}
              alt="Customer delivery signature"
              className="max-h-32 w-auto max-w-full object-contain"
              data-testid="img-delivery-signature"
            />
          </div>
        </div>
      ) : proof.signatureData && !proof.imageUri ? (
        <p className="text-xs text-foreground/70">Signature captured (image not available in this record).</p>
      ) : null}
    </div>
  );
}
