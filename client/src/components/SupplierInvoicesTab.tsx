import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export function SupplierInvoicesTab({ hasSubscription }: { hasSubscription: boolean }) {
  const { data, isLoading, error } = useQuery<{ invoices: any[] }>({
    queryKey: ["/api/supplier/invoices"],
    enabled: hasSubscription,
  });

  if (!hasSubscription) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Subscribe to view and download invoices.</p>
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
    return <div className="text-center py-12 text-destructive">Failed to load invoices.</div>;
  }

  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
          <p className="text-sm text-muted-foreground">Completed driver depot orders (download as PDF).</p>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">No invoices yet.</p>
          ) : (
            <ul className="space-y-3">
              {invoices.map((inv: any) => (
                <li key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{inv.depotName} – {inv.fuelType}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.completedAt ? new Date(inv.completedAt).toLocaleDateString() : ""} • {inv.litres} L
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCurrency((inv.totalCents ?? 0) / 100)}</span>
                    <a
                      href={`/api/supplier/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center text-sm"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
