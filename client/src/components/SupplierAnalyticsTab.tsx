import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart3, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SupplierAnalyticsTab({ hasSubscription }: { hasSubscription: boolean }) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/supplier/analytics"],
    enabled: hasSubscription,
  });
  const advanced = useQuery<any>({
    queryKey: ["/api/supplier/analytics", "advanced"],
    enabled: hasSubscription,
    queryFn: async () => {
      const res = await fetch("/api/supplier/analytics?detail=advanced", { credentials: "include" });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  if (!hasSubscription) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Subscribe to access analytics and reporting.</p>
      </div>
    );
  }
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orders today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.ordersToday ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orders this week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.ordersThisWeek ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total volume (L)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.totalLitres ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency((data.totalValueCents ?? 0) / 100)}</p>
          </CardContent>
        </Card>
      </div>
      {data.byStatus && Object.keys(data.byStatus).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By status</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {Object.entries(data.byStatus).map(([status, count]) => (
                <li key={status}>
                  <span className="capitalize">{status.replace(/_/g, " ")}</span>: {String(count)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {advanced.data?.byDepot?.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">By depot (Enterprise)</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/supplier/analytics/export?format=csv" download="analytics.csv">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {advanced.data.byDepot.map((d: any) => (
                <li key={d.depotId}>
                  {d.depotName}: {d.orderCount} orders, {d.totalLitres} L, {formatCurrency((d.totalValueCents || 0) / 100)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
