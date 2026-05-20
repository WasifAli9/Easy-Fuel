import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Truck, Loader2, CheckCircle2 } from "lucide-react";
import type { Vehicle } from "@shared/schema";

export function DriverActiveVehicleSelector() {
  const { toast } = useToast();

  const { data: activeData, isLoading: activeLoading } = useQuery<{
    vehicleId: string | null;
    vehicle: Vehicle | null;
  }>({
    queryKey: ["/api/driver/active-vehicle"],
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/driver/vehicles"],
  });

  const setActiveMutation = useMutation({
    mutationFn: async (vehicleId: string | null) => {
      const res = await apiRequest("PUT", "/api/driver/active-vehicle", { vehicleId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/active-vehicle"] });
      toast({ title: "Active vehicle updated", description: "Customer offers use this vehicle for capacity and job type." });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Could not update", variant: "destructive" });
    },
  });

  const activeId = activeData?.vehicleId ?? null;
  const eligible = vehicles.filter((v) => v.driverId);

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Truck className="h-5 w-5" />
          Vehicle for customer jobs
        </CardTitle>
        <CardDescription>
          Select which vehicle you are using before you appear in customer offers. Company vehicles count jobs toward
          your fleet; personal vehicles are independent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!activeId && !activeLoading && (
          <Alert>
            <AlertDescription>
              No active vehicle selected. You will not receive new customer offers until you choose one below.
            </AlertDescription>
          </Alert>
        )}

        {activeLoading || vehiclesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a personal vehicle or claim a company vehicle first, then select it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {eligible.map((v) => {
              const isActive = activeId === v.id;
              const isCompany = !!(v as any).companyId;
              return (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{v.registrationNumber || "Vehicle"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[v.make, v.model].filter(Boolean).join(" ")}
                      {v.capacityLitres ? ` · ${v.capacityLitres}L` : ""}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {isCompany ? (
                        <Badge variant="secondary">Company fleet</Badge>
                      ) : (
                        <Badge variant="outline">Personal</Badge>
                      )}
                      {isActive && (
                        <Badge className="bg-primary/20 text-primary gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Active for jobs
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? "secondary" : "default"}
                    disabled={setActiveMutation.isPending || isActive}
                    onClick={() => setActiveMutation.mutate(v.id)}
                  >
                    {isActive ? "In use" : "Use for jobs"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
