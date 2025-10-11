import { StatusBadge } from "../StatusBadge";

export default function StatusBadgeExample() {
  return (
    <div className="space-y-6 p-8">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">KYC Status</h3>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="pending" />
          <StatusBadge status="approved" />
          <StatusBadge status="rejected" />
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Order Status</h3>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="awaiting_payment" />
          <StatusBadge status="paid" />
          <StatusBadge status="assigned" />
          <StatusBadge status="picked_up" />
          <StatusBadge status="en_route" />
          <StatusBadge status="delivered" />
          <StatusBadge status="cancelled" />
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Without Icons</h3>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="pending" showIcon={false} />
          <StatusBadge status="active" showIcon={false} />
        </div>
      </div>
    </div>
  );
}
