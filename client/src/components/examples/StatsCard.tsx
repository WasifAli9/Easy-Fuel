import { StatsCard } from "../StatsCard";
import { Coins, Users, TrendingUp, Truck } from "lucide-react";

export default function StatsCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-8">
      <StatsCard
        title="Total Revenue"
        value="R 125,430"
        description="Last 30 days"
        icon={Coins}
        trend={{ value: 12.5, isPositive: true }}
      />
      <StatsCard
        title="Active Drivers"
        value="48"
        description="Currently online"
        icon={Truck}
        trend={{ value: 8.2, isPositive: true }}
      />
      <StatsCard
        title="Total Orders"
        value="342"
        description="This month"
        icon={TrendingUp}
        trend={{ value: 3.1, isPositive: false }}
      />
      <StatsCard
        title="New Customers"
        value="23"
        description="This week"
        icon={Users}
        trend={{ value: 15.3, isPositive: true }}
      />
    </div>
  );
}
