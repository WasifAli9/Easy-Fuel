import {
  ShoppingCart,
  MapPin,
  DollarSign,
  BarChart3,
  Wallet,
  FileText,
  CreditCard,
  UserCircle,
} from "lucide-react";
import {
  DashboardSidebarInner,
  DashboardNavSection,
  DashboardNavRouteLink,
} from "./DashboardSidebar";

const navItems: { label: string; icon: typeof MapPin }[] = [
  { label: "Driver Orders", icon: ShoppingCart },
  { label: "Depots", icon: MapPin },
  { label: "Pricing", icon: DollarSign },
  { label: "Analytics", icon: BarChart3 },
  { label: "Settlements", icon: Wallet },
  { label: "Invoices", icon: FileText },
];

export type SupplierWorkspaceActive = "billing" | "profile";

export function SupplierWorkspaceSidebar({
  active,
  onNavigate,
}: {
  active: SupplierWorkspaceActive | null;
  onNavigate?: () => void;
}) {
  return (
    <DashboardSidebarInner label="Supplier hub">
      <DashboardNavSection>
        {navItems.map(({ label, icon: Icon }) => (
          <DashboardNavRouteLink
            key={label}
            href="/supplier"
            active={false}
            icon={Icon}
            onNavigate={onNavigate}
          >
            {label}
          </DashboardNavRouteLink>
        ))}
        <DashboardNavRouteLink
          href="/supplier/subscription"
          active={active === "billing"}
          icon={CreditCard}
          onNavigate={onNavigate}
        >
          Billing
        </DashboardNavRouteLink>
        <DashboardNavRouteLink
          href="/supplier/profile"
          active={active === "profile"}
          icon={UserCircle}
          onNavigate={onNavigate}
        >
          Profile
        </DashboardNavRouteLink>
      </DashboardNavSection>
    </DashboardSidebarInner>
  );
}
