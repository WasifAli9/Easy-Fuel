import { ApiCollectionScreen } from "@/features/common/ApiCollectionScreen";
import { CustomerAddressesScreen } from "@/features/customer/CustomerAddressesScreen";
import { CustomerDashboardScreen } from "@/features/customer/CustomerDashboardScreen";
import { CustomerOrdersScreen } from "@/features/customer/CustomerOrdersScreen";
import { CustomerProfileScreen } from "@/features/customer/CustomerProfileScreen";
import { SupplierDashboardScreen } from "@/features/supplier/SupplierDashboardScreen";
import { SupplierDepotsScreen } from "@/features/supplier/SupplierDepotsScreen";
import { SupplierProfileScreen } from "@/features/supplier/SupplierProfileScreen";
import { SupplierSubscriptionScreen } from "@/features/supplier/SupplierSubscriptionScreen";
import { signOut } from "@/services/api/auth";

export { CustomerDashboardScreen, CustomerOrdersScreen, CustomerAddressesScreen, CustomerProfileScreen };
export { SupplierDashboardScreen, SupplierDepotsScreen, SupplierSubscriptionScreen, SupplierProfileScreen };

export function DriverDashboardScreen() {
  return (
    <ApiCollectionScreen
      title="Driver Dashboard"
      subtitle="Assigned jobs and stats overview."
      endpoint="/api/driver/assigned-orders"
      emptyMessage="No assigned driver orders."
      itemTitleKeys={["order_number", "id", "delivery_address"]}
      itemSubtitleKeys={["status", "scheduled_date", "priority"]}
    />
  );
}

export function DriverOrdersScreen() {
  return (
    <ApiCollectionScreen
      title="Driver Orders"
      subtitle="Current and completed delivery jobs."
      endpoint="/api/driver/completed-orders"
      emptyMessage="No completed orders yet."
      itemTitleKeys={["order_number", "id", "delivery_address"]}
      itemSubtitleKeys={["status", "completed_at", "scheduled_date"]}
    />
  );
}

export function DriverSubscriptionScreen() {
  return (
    <ApiCollectionScreen
      title="Driver Subscription"
      subtitle="Plan status and billing options."
      endpoint="/api/driver/subscription"
      emptyMessage="No subscription details found."
      itemTitleKeys={["plan_name", "planCode", "status", "id"]}
      itemSubtitleKeys={["status", "next_billing_date", "amount"]}
    />
  );
}

export function DriverProfileScreen() {
  return (
    <ApiCollectionScreen
      title="Driver Profile"
      subtitle="Profile, compliance and documents."
      endpoint="/api/driver/profile"
      emptyMessage="No driver profile found."
      itemTitleKeys={["full_name", "name", "email"]}
      itemSubtitleKeys={["phone", "license_number", "status"]}
      extraAction={{ label: "Sign Out", onPress: () => void signOut() }}
    />
  );
}

export function CompanyOverviewScreen() {
  return (
    <ApiCollectionScreen
      title="Company Overview"
      subtitle="KPI and operations summary."
      endpoint="/api/company/overview"
      emptyMessage="No company overview data."
      itemTitleKeys={["name", "company_name", "id"]}
      itemSubtitleKeys={["status", "active_drivers", "active_orders"]}
    />
  );
}

export function CompanyFleetScreen() {
  return (
    <ApiCollectionScreen
      title="Fleet"
      subtitle="Drivers and vehicles."
      endpoint="/api/company/drivers"
      emptyMessage="No company drivers found."
      itemTitleKeys={["full_name", "name", "email", "id"]}
      itemSubtitleKeys={["status", "phone", "assigned_vehicle"]}
    />
  );
}

export function CompanyOrdersScreen() {
  return (
    <ApiCollectionScreen
      title="Company Orders"
      subtitle="Track company order lifecycle."
      endpoint="/api/orders"
      emptyMessage="No company orders available."
      itemTitleKeys={["order_number", "id", "delivery_address"]}
      itemSubtitleKeys={["status", "scheduled_date", "created_at"]}
    />
  );
}

export function CompanyProfileScreen() {
  return (
    <ApiCollectionScreen
      title="Company Profile"
      subtitle="Organization account and settings."
      endpoint="/api/company/overview"
      emptyMessage="No profile information available."
      itemTitleKeys={["name", "company_name", "id"]}
      itemSubtitleKeys={["status", "email", "phone"]}
      extraAction={{ label: "Sign Out", onPress: () => void signOut() }}
    />
  );
}
