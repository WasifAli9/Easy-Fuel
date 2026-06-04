import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatSnakeCaseLabel } from "@/lib/utils";
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
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
      toast({
        title: "Active vehicle updated",
        description: "Customer offers now use this vehicle.",
      });
    },
    onError: (e: any) => {
      let description = e?.message || "Could not update";
      try {
        const jsonStart = description.indexOf("{");
        if (jsonStart >= 0) {
          const parsed = JSON.parse(description.slice(jsonStart));
          if (parsed.error) description = parsed.error;
        }
      } catch {
        /* keep message */
      }
      toast({
        title: "Vehicle pending verification",
        description:
          description ||
          "This vehicle is waiting for compliance review. Upload required documents and use it once approved.",
      });
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
          Choose which vehicle you use for customer offers. Personal vehicles need compliance documents approved (or
          admin vehicle approval) before they can be selected.
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
              const vehicleStatus = (v as Vehicle & { vehicleStatus?: string }).vehicleStatus;
              const statusPending = vehicleStatus && vehicleStatus !== "active";
              const canUseForJobs = !statusPending;
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
                      {statusPending && !isActive && (
                        <Badge variant="secondary">
                          {formatSnakeCaseLabel(vehicleStatus || "pending", "Pending")}
                        </Badge>
                      )}
                    </div>
                    {statusPending && !isActive && (
                      <p className="text-xs text-muted-foreground mt-2 max-w-md">
                        Open <strong>My Vehicles</strong> → <strong>Manage Compliance</strong> to upload documents.
                        Once approved, tap <strong>Use for jobs</strong> again.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? "secondary" : canUseForJobs ? "default" : "outline"}
                    disabled={setActiveMutation.isPending || (!isActive && !canUseForJobs)}
                    onClick={() => !isActive && canUseForJobs && setActiveMutation.mutate(v.id)}
                  >
                    {isActive ? "Active for jobs" : canUseForJobs ? "Use for jobs" : "Pending verification"}
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
