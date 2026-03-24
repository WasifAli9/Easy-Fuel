import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export function SupplierSettlementsTab({ hasSubscription }: { hasSubscription: boolean }) {
  const { data, isLoading, error } = useQuery<{ settlements: any[] }>({
    queryKey: ["/api/supplier/settlements"],
    enabled: hasSubscription,
  });

  if (!hasSubscription) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Subscribe to view settlements and payouts.</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return <div className="text-center py-12 text-destructive">Failed to load settlements.</div>;
  }

  const settlements = data?.settlements ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlements</CardTitle>
          <p className="text-sm text-muted-foreground">Next-day (Standard) or same-day (Enterprise) payouts.</p>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="text-muted-foreground text-sm">No settlements yet.</p>
          ) : (
            <ul className="space-y-3">
              {settlements.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">
                      {s.period_start ? new Date(s.period_start).toLocaleDateString() : ""} –{" "}
                      {s.period_end ? new Date(s.period_end).toLocaleDateString() : ""}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {s.settlement_type?.replace("_", "-")} • {s.status}
                    </p>
                  </div>
                  <p className="font-medium">{formatCurrency((s.total_cents ?? 0) / 100)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
