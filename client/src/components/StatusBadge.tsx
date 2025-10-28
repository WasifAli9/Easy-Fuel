import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle, AlertCircle, Truck, MapPin } from "lucide-react";

type StatusType = 
  | "pending" 
  | "approved" 
  | "rejected" 
  | "created"
  | "awaiting_payment" 
  | "paid" 
  | "assigned" 
  | "picked_up" 
  | "en_route" 
  | "delivered" 
  | "cancelled"
  | "refunded"
  | "active"
  | "offered"
  | "accepted"
  | "timeout";

interface StatusBadgeProps {
  status: StatusType;
  showIcon?: boolean;
}

const statusConfig = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-900",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-200 dark:border-green-900",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border-red-200 dark:border-red-900",
    icon: XCircle,
  },
  created: {
    label: "Created",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-200 dark:border-blue-900",
    icon: Clock,
  },
  awaiting_payment: {
    label: "Awaiting Payment",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-900",
    icon: Clock,
  },
  paid: {
    label: "Paid",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-200 dark:border-green-900",
    icon: CheckCircle2,
  },
  assigned: {
    label: "Assigned",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-200 dark:border-blue-900",
    icon: AlertCircle,
  },
  picked_up: {
    label: "Picked Up",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-200 dark:border-teal-900",
    icon: Truck,
  },
  en_route: {
    label: "En Route",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-200 dark:border-teal-900",
    icon: MapPin,
  },
  delivered: {
    label: "Delivered",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-200 dark:border-green-900",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200 border-gray-200 dark:border-gray-900",
    icon: XCircle,
  },
  refunded: {
    label: "Refunded",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 border-purple-200 dark:border-purple-900",
    icon: CheckCircle2,
  },
  active: {
    label: "Active",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-200 dark:border-teal-900",
    icon: CheckCircle2,
  },
  offered: {
    label: "Offered",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-200 dark:border-blue-900",
    icon: Clock,
  },
  accepted: {
    label: "Accepted",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-200 dark:border-green-900",
    icon: CheckCircle2,
  },
  timeout: {
    label: "Timeout",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200 border-gray-200 dark:border-gray-900",
    icon: Clock,
  },
};

export function StatusBadge({ status, showIcon = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  // Fallback for unknown status
  if (!config) {
    return (
      <Badge variant="outline" className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200 border-gray-200 dark:border-gray-900" data-testid={`badge-status-${status}`}>
        <AlertCircle className="h-3 w-3" />
        <span>{status}</span>
      </Badge>
    );
  }
  
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`inline-flex items-center gap-1.5 ${config.className}`} data-testid={`badge-status-${status}`}>
      {showIcon && <Icon className="h-3 w-3" />}
      <span>{config.label}</span>
    </Badge>
  );
}
