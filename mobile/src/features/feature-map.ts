import { UserRole } from "@/navigation/types";

type FeatureStatus = "parity" | "mobile-redesign" | "mobile-new";

type MobileFeature = {
  id: string;
  status: FeatureStatus;
  description: string;
};

export const roleFeatureMap: Record<UserRole, MobileFeature[]> = {
  customer: [
    { id: "auth", status: "parity", description: "Sign-in, sign-up, session restore." },
    { id: "orders", status: "parity", description: "Create, track, and manage orders." },
    { id: "chat", status: "parity", description: "Order-level chat and updates." },
    { id: "payments", status: "parity", description: "Payment methods, invoices, receipts." },
    { id: "profile", status: "parity", description: "Profile and account settings." },
    {
      id: "analytics",
      status: "mobile-redesign",
      description: "Replace wide charts with metric cards and drill-downs.",
    },
    {
      id: "push_notifications",
      status: "mobile-new",
      description: "Order status and payment notifications.",
    },
  ],
  driver: [
    { id: "auth", status: "parity", description: "Sign-in, role gate, session restore." },
    { id: "jobs", status: "parity", description: "Assigned/completed order workflows." },
    { id: "chat", status: "parity", description: "Dispatch/customer messaging." },
    { id: "earnings", status: "mobile-redesign", description: "Summary cards + date filters." },
    { id: "profile", status: "parity", description: "Driver docs and account settings." },
    { id: "location_tracking", status: "mobile-new", description: "Live location updates." },
    { id: "biometric_unlock", status: "mobile-new", description: "Quick unlock on app open." },
  ],
  supplier: [
    { id: "auth", status: "parity", description: "Sign-in and role onboarding." },
    { id: "orders", status: "parity", description: "Order and request handling." },
    {
      id: "subscriptions",
      status: "parity",
      description: "Plan status, upgrades, and payment actions.",
    },
    { id: "chat", status: "parity", description: "Order communication." },
    {
      id: "inventory",
      status: "mobile-redesign",
      description: "Task-first inventory management flows.",
    },
    { id: "location", status: "mobile-new", description: "Depot and route location support." },
  ],
  company: [
    { id: "auth", status: "parity", description: "Sign-in and session management." },
    {
      id: "overview",
      status: "mobile-redesign",
      description: "Condense dense dashboards into card sections.",
    },
    { id: "fleet", status: "parity", description: "Fleet and driver operations." },
    { id: "orders", status: "parity", description: "Order lifecycle management." },
    { id: "chat", status: "parity", description: "Internal and order chat flows." },
    { id: "analytics", status: "mobile-redesign", description: "Swipeable KPI cards." },
    { id: "push_notifications", status: "mobile-new", description: "Ops alerting channel." },
  ],
};
