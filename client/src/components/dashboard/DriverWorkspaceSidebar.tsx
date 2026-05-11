import {
  Home,
  Package,
  Car,
  DollarSign,
  Settings,
  History,
  Warehouse,
  Store,
} from "lucide-react";
import {
  DashboardSidebarInner,
  DashboardNavSection,
  DashboardNavRouteLink,
  DashboardSidebarDivider,
} from "./DashboardSidebar";

export type DriverWorkspaceActive = null;

export function DriverWorkspaceSidebar({
  active: _active,
  onNavigate,
}: {
  active: DriverWorkspaceActive | null;
  onNavigate?: () => void;
}) {
  return (
    <DashboardSidebarInner label="Driver workspace">
      <DashboardNavSection>
        <DashboardNavRouteLink href="/driver" active={false} icon={Home} onNavigate={onNavigate}>
          Dashboard
        </DashboardNavRouteLink>
        <DashboardNavRouteLink href="/driver" active={false} icon={Package} onNavigate={onNavigate}>
          My Jobs
        </DashboardNavRouteLink>
        <DashboardNavRouteLink href="/driver" active={false} icon={Car} onNavigate={onNavigate}>
          Vehicles
        </DashboardNavRouteLink>
        <DashboardNavRouteLink href="/driver" active={false} icon={DollarSign} onNavigate={onNavigate}>
          Pricing
        </DashboardNavRouteLink>
        <DashboardNavRouteLink href="/driver" active={false} icon={Settings} onNavigate={onNavigate}>
          Settings
        </DashboardNavRouteLink>
        <DashboardNavRouteLink href="/driver" active={false} icon={History} onNavigate={onNavigate}>
          History
        </DashboardNavRouteLink>
      </DashboardNavSection>
      <DashboardSidebarDivider />
      <DashboardNavSection title="Depot supply">
        <DashboardNavRouteLink href="/driver" active={false} icon={Warehouse} onNavigate={onNavigate}>
          My depot orders
        </DashboardNavRouteLink>
        <DashboardNavRouteLink href="/driver" active={false} icon={Store} onNavigate={onNavigate}>
          Available depots
        </DashboardNavRouteLink>
      </DashboardNavSection>
    </DashboardSidebarInner>
  );
}
