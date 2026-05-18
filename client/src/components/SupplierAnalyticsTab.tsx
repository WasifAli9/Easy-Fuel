import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Droplets, CircleDollarSign, PackageCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

export function SupplierAnalyticsTab() {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/supplier/analytics"],
  });
  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return <div className="text-center py-12 text-destructive">Failed to load analytics.</div>;
  }

  const statusData = Object.entries(data.byStatus || {}).map(([status, count]) => ({
    status: status.replace(/_/g, " "),
    count: Number(count || 0),
  }));

  const trendData = [
    { label: "Today", orders: Number(data.ordersToday || 0), litres: Number(data.totalLitresToday || 0) },
    { label: "This Week", orders: Number(data.ordersThisWeek || 0), litres: Number(data.totalLitresWeek || data.totalLitres || 0) },
    { label: "All Time", orders: Number(data.totalOrders || data.ordersThisWeek || 0), litres: Number(data.totalLitres || 0) },
  ];

  const pieColors = ["#14b8a6", "#06b6d4", "#3b82f6", "#a855f7", "#f59e0b", "#f43f5e"];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-teal-200/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-teal-500" />
              Orders today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.ordersToday ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-teal-200/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
              Orders this week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.ordersThisWeek ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-teal-200/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-500" />
              Total volume (L)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.totalLitres ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-teal-200/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-emerald-500" />
              Total value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency((data.totalValueCents ?? 0) / 100)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="orders" stroke="#14b8a6" fill="url(#ordersGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By status</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="count" nameKey="status" outerRadius={100} label>
                    {statusData.map((entry, index) => (
                      <Cell key={`${entry.status}-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No status data available yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
