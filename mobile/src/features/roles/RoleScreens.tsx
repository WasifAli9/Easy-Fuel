import { signOut } from "@/services/api/auth";
import { ApiCollectionScreen } from "@/features/common/ApiCollectionScreen";

export function CustomerDashboardScreen() {
  return (
    <ApiCollectionScreen
      title="Customer Dashboard"
      subtitle="Recent orders and activity."
      endpoint="/api/orders"
      emptyMessage="No customer orders found."
      itemTitleKeys={["delivery_address", "fuel_type", "id"]}
      itemSubtitleKeys={["status", "scheduled_date", "created_at"]}
    />
  );
}

export function CustomerOrdersScreen() {
  return (
    <ApiCollectionScreen
      title="Orders"
      subtitle="Create and track your fuel requests."
      endpoint="/api/orders"
      emptyMessage="No orders yet."
      itemTitleKeys={["delivery_address", "fuel_type", "id"]}
      itemSubtitleKeys={["status", "scheduled_date", "quantity"]}
    />
  );
}

export function CustomerAddressesScreen() {
  return (
    <ApiCollectionScreen
      title="Saved Addresses"
      subtitle="Manage your delivery locations."
      endpoint="/api/addresses"
      emptyMessage="No saved addresses."
      itemTitleKeys={["label", "address_line_1", "city", "id"]}
      itemSubtitleKeys={["city", "province", "postal_code"]}
    />
  );
}

export function CustomerProfileScreen() {
  return (
    <ApiCollectionScreen
      title="Customer Profile"
      subtitle="Account settings and payment setup."
      endpoint="/api/profile"
      emptyMessage="No profile data available."
      itemTitleKeys={["full_name", "name", "email"]}
      itemSubtitleKeys={["phone", "role", "updated_at"]}
      extraAction={{ label: "Sign Out", onPress: () => void signOut() }}
    />
  );
}

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

export function SupplierDashboardScreen() {
  return (
    <ApiCollectionScreen
      title="Supplier Dashboard"
      subtitle="Orders, depots and operational overview."
      endpoint="/api/supplier/driver-depot-orders"
      emptyMessage="No supplier depot orders."
      itemTitleKeys={["order_number", "depot_name", "id"]}
      itemSubtitleKeys={["status", "created_at", "scheduled_date"]}
    />
  );
}

export function SupplierDepotsScreen() {
  return (
    <ApiCollectionScreen
      title="Depots"
      subtitle="Manage depot locations and inventory."
      endpoint="/api/supplier/depots"
      emptyMessage="No depots available."
      itemTitleKeys={["name", "depot_name", "id"]}
      itemSubtitleKeys={["city", "status", "updated_at"]}
    />
  );
}

export function SupplierSubscriptionScreen() {
  return (
    <ApiCollectionScreen
      title="Supplier Subscription"
      subtitle="Subscription plans and billing state."
      endpoint="/api/supplier/subscription"
      emptyMessage="No supplier subscription data."
      itemTitleKeys={["plan_name", "planCode", "status", "id"]}
      itemSubtitleKeys={["status", "next_billing_date", "amount"]}
    />
  );
}

export function SupplierProfileScreen() {
  return (
    <ApiCollectionScreen
      title="Supplier Profile"
      subtitle="Business details and compliance status."
      endpoint="/api/supplier/profile"
      emptyMessage="No supplier profile found."
      itemTitleKeys={["business_name", "full_name", "email"]}
      itemSubtitleKeys={["status", "phone", "updated_at"]}
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
