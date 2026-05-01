import {
  ShoppingCart,
  MapPin,
  DollarSign,
  BarChart3,
  Wallet,
  FileText,
  CreditCard,
} from "lucide-react";
import {
  DashboardSidebarInner,
  DashboardNavSection,
  DashboardNavRouteLink,
  DashboardNavButton,
} from "./DashboardSidebar";

export type SupplierDashboardTab =
  | "driver-orders"
  | "depots"
  | "pricing"
  | "analytics"
  | "settlements"
  | "invoices";

const navItems: { value: SupplierDashboardTab; label: string; icon: typeof MapPin }[] = [
  { value: "driver-orders", label: "Driver Orders", icon: ShoppingCart },
  { value: "depots", label: "Depots", icon: MapPin },
  { value: "pricing", label: "Pricing", icon: DollarSign },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "settlements", label: "Settlements", icon: Wallet },
  { value: "invoices", label: "Invoices", icon: FileText },
];

export type SupplierWorkspaceActive = "billing";

export function SupplierWorkspaceSidebar({
  active,
  dashboardActiveTab,
  onDashboardTabChange,
  onNavigate,
}: {
  active: SupplierWorkspaceActive | null;
  dashboardActiveTab?: SupplierDashboardTab | null;
  onDashboardTabChange?: (tab: SupplierDashboardTab) => void;
  onNavigate?: () => void;
}) {
  const dashboardMode = typeof onDashboardTabChange === "function";

  return (
    <DashboardSidebarInner label="Supplier hub">
      <DashboardNavSection>
        {navItems.map(({ value, label, icon: Icon }) =>
          dashboardMode ? (
            <DashboardNavButton
              key={value}
              active={dashboardActiveTab === value}
              icon={Icon}
              data-testid={`tab-${value}`}
              onClick={() => {
                onDashboardTabChange!(value);
                onNavigate?.();
              }}
            >
              {label}
            </DashboardNavButton>
          ) : (
            <DashboardNavRouteLink
              key={value}
              href={`/supplier?tab=${encodeURIComponent(value)}`}
              active={false}
              icon={Icon}
              onNavigate={onNavigate}
            >
              {label}
            </DashboardNavRouteLink>
          )
        )}
        <DashboardNavRouteLink
          href="/supplier/subscription"
          active={active === "billing"}
          icon={CreditCard}
          onNavigate={onNavigate}
        >
          Billing
        </DashboardNavRouteLink>
      </DashboardNavSection>
    </DashboardSidebarInner>
  );
}
