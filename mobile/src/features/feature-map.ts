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
    { id: "orders", status: "parity", description: "Create, track, filter tabs, offers, chat (aligned with web)." },
    { id: "chat", status: "parity", description: "Order-level chat via shared OrderChatPanel." },
    { id: "payments", status: "parity", description: "Payment methods selectable on create order." },
    { id: "profile", status: "parity", description: "Profile PUT /api/profile and billing fields." },
    { id: "addresses", status: "parity", description: "CRUD /api/delivery-addresses." },
    {
      id: "analytics",
      status: "mobile-redesign",
      description: "Optional customer analytics if added on web.",
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
    { id: "orders", status: "parity", description: "Driver depot orders accept/reject/payment confirm (core web flows)." },
    {
      id: "subscriptions",
      status: "parity",
      description: "Plans, Ozow redirect, cancel — /api/supplier/subscription/*.",
    },
    { id: "depots", status: "parity", description: "List/create/delete depots; tier pricing snapshot on dashboard." },
    { id: "analytics_invoices_settlements", status: "parity", description: "Read-only API parity with web tabs." },
    { id: "profile_compliance", status: "parity", description: "Profile PUT; documents & compliance status listed." },
    {
      id: "inventory",
      status: "mobile-redesign",
      description: "Advanced tier pricing editor remains web-first.",
    },
    { id: "location", status: "mobile-new", description: "Map pickers for depots optional enhancement." },
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
