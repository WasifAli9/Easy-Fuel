import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { StatsCard } from "@/components/StatsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  DashboardSidebarAside,
  DashboardSidebarInner,
  DashboardNavSection,
  DashboardNavButton,
} from "@/components/dashboard/DashboardSidebar";
import {
  Users,
  UserCheck,
  UserX,
  PackageCheck,
  DollarSign,
  BarChart3,
  Loader2,
  LayoutDashboard,
  Menu,
  Truck,
  TrendingUp,
  CalendarDays,
  PieChart,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CompanyTab = "overview" | "drivers" | "vehicles" | "analytics";

interface CompanyVehicleRow {
  id: string;
  driverId: string | null;
  companyId: string | null;
  registrationNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  capacityLitres: number | null;
  vehicleStatus: string | null;
  assignedDriverName: string | null;
}

interface CompanyDriverRow {
  driverId: string;
  fullName: string | null;
  phone: string | null;
  status: string;
  complianceStatus: string;
  availabilityStatus: string;
  completedTrips: number;
  rating: number | null;
  isDisabledByCompany: boolean;
  disabledReason: string | null;
}

export default function CompanyDashboard() {
  const { profile, session, loading } = useAuth();
  const companyQueryEnabled =
    !loading && !!session?.access_token && profile?.role === "company";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<CompanyTab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<string | null>(null);
  const [disableReason, setDisableReason] = useState("");
  const [assignVehicleId, setAssignVehicleId] = useState<string | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<string>("");
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);

  const { data: overview, isLoading: overviewLoading } = useQuery<{
    totalDrivers: number;
    activeFleetCount: number;
    disabledDrivers: number;
    completedDeliveries: number;
    revenueCents: number;
  }>({
    queryKey: ["/api/company/overview"],
    enabled: companyQueryEnabled,
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery<CompanyDriverRow[]>({
    queryKey: ["/api/company/drivers"],
    enabled: companyQueryEnabled,
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery<{ date: string; count: number }[]>({
    queryKey: ["/api/company/analytics/daily-deliveries"],
    enabled: companyQueryEnabled && tab === "analytics",
  });
  const daily = dailyData ?? [];

  const deliveryChartSeries = useMemo(() => {
    const map = new Map(daily.map((d) => [d.date, d.count]));
    const out: { date: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${day}`;
      out.push({
        date: key,
        label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        count: map.get(key) ?? 0,
      });
    }
    return out;
  }, [daily]);

  const deliveriesLast30 = useMemo(
    () => deliveryChartSeries.reduce((s, row) => s + row.count, 0),
    [deliveryChartSeries],
  );
  const avgDeliveriesPerDay = deliveriesLast30 / 30;
  const busiestDay = useMemo(() => {
    let best = deliveryChartSeries[0];
    for (const row of deliveryChartSeries) {
      if (row.count > (best?.count ?? 0)) best = row;
    }
    return best;
  }, [deliveryChartSeries]);

  const { data: fleetVehicles = [], isLoading: vehiclesLoading } = useQuery<CompanyVehicleRow[]>({
    queryKey: ["/api/company/vehicles"],
    enabled: companyQueryEnabled,
  });
  const fleetAssignedCount = useMemo(
    () => fleetVehicles.filter((v) => v.driverId).length,
    [fleetVehicles],
  );
  const { data: fuelTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
  });

  const createVehicleMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await apiRequest("POST", "/api/company/vehicles", payload);
    },
    onSuccess: () => {
      toast({ title: "Vehicle added" });
      setAddVehicleOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/company/vehicles"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const handleCreateVehicleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const registration = String(formData.get("registration_number") ?? "").trim();
    if (!registration) {
      toast({ title: "Registration is required", variant: "destructive" });
      return;
    }

    const fuelTypesSelected = formData.getAll("fuel_types").filter(Boolean);
    const payload = {
      registration_number: registration,
      make: String(formData.get("make") ?? "").trim() || null,
      model: String(formData.get("model") ?? "").trim() || null,
      year: formData.get("year") ? Number(formData.get("year")) : null,
      capacity_litres: formData.get("capacity_litres") ? Number(formData.get("capacity_litres")) : null,
      fuel_types: fuelTypesSelected.length > 0 ? fuelTypesSelected : null,
      license_disk_expiry: formData.get("license_disk_expiry") || null,
      roadworthy_expiry: formData.get("roadworthy_expiry") || null,
      insurance_expiry: formData.get("insurance_expiry") || null,
      tracker_installed: formData.get("tracker_installed") === "yes",
      tracker_provider: String(formData.get("tracker_provider") ?? "").trim() || null,
      vehicle_reg_certificate_number: String(formData.get("vehicle_reg_certificate_number") ?? "").trim() || null,
      roadworthy_certificate_number: String(formData.get("roadworthy_certificate_number") ?? "").trim() || null,
      roadworthy_issue_date: formData.get("roadworthy_issue_date") || null,
      dg_vehicle_permit_required: formData.get("dg_vehicle_permit_required") === "yes",
      dg_vehicle_permit_number: String(formData.get("dg_vehicle_permit_number") ?? "").trim() || null,
      dg_vehicle_permit_issue_date: formData.get("dg_vehicle_permit_issue_date") || null,
      dg_vehicle_permit_expiry_date: formData.get("dg_vehicle_permit_expiry_date") || null,
      vehicle_insured: formData.get("vehicle_insured") === "yes",
      insurance_provider: String(formData.get("insurance_provider") ?? "").trim() || null,
      policy_number: String(formData.get("policy_number") ?? "").trim() || null,
      policy_expiry_date: formData.get("policy_expiry_date") || null,
      loa_required: formData.get("loa_required") === "yes",
      loa_issue_date: formData.get("loa_issue_date") || null,
      loa_expiry_date: formData.get("loa_expiry_date") || null,
    };

    createVehicleMutation.mutate(payload);
  };

  const assignVehicleMutation = useMutation({
    mutationFn: async ({ vehicleId, driverId }: { vehicleId: string; driverId: string }) => {
      await apiRequest("POST", `/api/company/vehicles/${vehicleId}/assign`, { driverId });
    },
    onSuccess: () => {
      toast({ title: "Driver assigned" });
      setAssignVehicleId(null);
      setAssignDriverId("");
      qc.invalidateQueries({ queryKey: ["/api/company/vehicles"] });
      qc.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const unassignVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      await apiRequest("POST", `/api/company/vehicles/${vehicleId}/unassign`, {});
    },
    onSuccess: () => {
      toast({ title: "Vehicle unassigned" });
      qc.invalidateQueries({ queryKey: ["/api/company/vehicles"] });
      qc.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteFleetVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      await apiRequest("DELETE", `/api/company/vehicles/${vehicleId}`);
    },
    onSuccess: () => {
      toast({ title: "Vehicle removed" });
      qc.invalidateQueries({ queryKey: ["/api/company/vehicles"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const { data: driverOrders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/company/driver-orders", selectedDriverId],
    enabled: companyQueryEnabled && !!selectedDriverId,
    queryFn: async () => {
      const res = await fetch(`/api/company/drivers/${selectedDriverId}/orders`, {
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const disableMutation = useMutation({
    mutationFn: async ({ driverId, reason }: { driverId: string; reason?: string }) => {
      await apiRequest("POST", `/api/company/drivers/${driverId}/disable`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Driver disabled", description: "They will not receive platform dispatch while linked and disabled." });
      qc.invalidateQueries({ queryKey: ["/api/company/drivers"] });
      qc.invalidateQueries({ queryKey: ["/api/company/overview"] });
      setDisableTarget(null);
      setDisableReason("");
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
  });

  const enableMutation = useMutation({
    mutationFn: async (driverId: string) => {
      await apiRequest("POST", `/api/company/drivers/${driverId}/enable`, {});
    },
    onSuccess: () => {
      toast({ title: "Driver enabled" });
      qc.invalidateQueries({ queryKey: ["/api/company/drivers"] });
      qc.invalidateQueries({ queryKey: ["/api/company/overview"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader showMenu onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex flex-1 min-h-0">
        <DashboardSidebarAside aria-label="Fleet company navigation">
          <DashboardSidebarInner label="Fleet company" tagline="Operations">
            <DashboardNavSection>
              <DashboardNavButton
                active={tab === "overview"}
                icon={LayoutDashboard}
                onClick={() => setTab("overview")}
              >
                Overview
              </DashboardNavButton>
              <DashboardNavButton active={tab === "drivers"} icon={Users} onClick={() => setTab("drivers")}>
                Drivers
              </DashboardNavButton>
              <DashboardNavButton active={tab === "vehicles"} icon={Truck} onClick={() => setTab("vehicles")}>
                Vehicles
              </DashboardNavButton>
              <DashboardNavButton
                active={tab === "analytics"}
                icon={BarChart3}
                onClick={() => setTab("analytics")}
              >
                Analytics
              </DashboardNavButton>
            </DashboardNavSection>
          </DashboardSidebarInner>
        </DashboardSidebarAside>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="w-[min(100vw-2rem,288px)] p-0 overflow-hidden flex flex-col bg-sidebar border-r border-sidebar-border"
          >
            <div className="flex flex-col h-full min-h-0">
              <DashboardSidebarInner label="Fleet company">
                <DashboardNavSection>
                  <DashboardNavButton
                    active={tab === "overview"}
                    icon={LayoutDashboard}
                    onClick={() => {
                      setTab("overview");
                      setSidebarOpen(false);
                    }}
                  >
                    Overview
                  </DashboardNavButton>
                  <DashboardNavButton
                    active={tab === "drivers"}
                    icon={Users}
                    onClick={() => {
                      setTab("drivers");
                      setSidebarOpen(false);
                    }}
                  >
                    Drivers
                  </DashboardNavButton>
                  <DashboardNavButton
                    active={tab === "vehicles"}
                    icon={Truck}
                    onClick={() => {
                      setTab("vehicles");
                      setSidebarOpen(false);
                    }}
                  >
                    Vehicles
                  </DashboardNavButton>
                  <DashboardNavButton
                    active={tab === "analytics"}
                    icon={BarChart3}
                    onClick={() => {
                      setTab("analytics");
                      setSidebarOpen(false);
                    }}
                  >
                    Analytics
                  </DashboardNavButton>
                </DashboardNavSection>
              </DashboardSidebarInner>
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 overflow-auto dashboard-main-area">
          <div className="container max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8 rounded-2xl border border-border/60 bg-gradient-to-br from-card/95 via-card/80 to-primary/[0.05] p-6 sm:p-7 shadow-lg shadow-primary/[0.06] backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary/90">Fleet</p>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Fleet company</h1>
                  <p className="text-sm text-muted-foreground">
                    Manage drivers linked to your company and view performance
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden rounded-full shrink-0 shadow-sm"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as CompanyTab)} className="space-y-6">
              <TabsList className="flex md:hidden w-full flex-wrap h-auto gap-1 p-1.5 rounded-xl bg-muted/60 border border-border/50 shadow-inner">
                <TabsTrigger
                  value="overview"
                  className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 min-w-[5.5rem]"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="drivers"
                  className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 min-w-[5.5rem]"
                >
                  Drivers
                </TabsTrigger>
                <TabsTrigger
                  value="vehicles"
                  className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 min-w-[5.5rem]"
                >
                  Vehicles
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 min-w-[5.5rem]"
                >
                  Analytics
                </TabsTrigger>
              </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {overviewLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard title="Total drivers" value={overview?.totalDrivers ?? 0} icon={Users} />
                <StatsCard title="Active in fleet" value={overview?.activeFleetCount ?? 0} icon={UserCheck} />
                <StatsCard title="Disabled by you" value={overview?.disabledDrivers ?? 0} icon={UserX} />
                <StatsCard title="Completed deliveries" value={overview?.completedDeliveries ?? 0} icon={PackageCheck} />
                <StatsCard
                  title="Delivered order value"
                  value={formatCurrency((overview?.revenueCents ?? 0) / 100)}
                  icon={DollarSign}
                  description="Sum of delivered orders (assigned drivers)"
                />
              </div>
            )}
            <Card className="border-border/60 shadow-md">
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
                <CardDescription>Review driver roster and delivery trends</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-full" onClick={() => setTab("drivers")}>
                  Manage drivers
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => setTab("vehicles")}>
                  Manage vehicles
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => setTab("analytics")}>
                  View analytics
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drivers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Drivers</CardTitle>
                <CardDescription>Enable or disable drivers for your fleet context. Disabling stops platform dispatch while they remain linked to you.</CardDescription>
              </CardHeader>
              <CardContent>
                {driversLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                ) : drivers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No drivers have joined your company yet. Drivers can link from their profile.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Fleet</TableHead>
                        <TableHead>Trips</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drivers.map((d) => (
                        <TableRow key={d.driverId}>
                          <TableCell>
                            <div className="font-medium">{d.fullName || "—"}</div>
                            <div className="text-xs text-muted-foreground">{d.phone || d.driverId.slice(0, 8)}…</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{d.status}</Badge>
                            <span className="text-xs text-muted-foreground ml-2">{d.complianceStatus}</span>
                          </TableCell>
                          <TableCell>
                            {d.isDisabledByCompany ? (
                              <Badge variant="destructive">Disabled</Badge>
                            ) : (
                              <Badge variant="secondary">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell>{d.completedTrips ?? 0}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedDriverId(selectedDriverId === d.driverId ? null : d.driverId)}>
                              {selectedDriverId === d.driverId ? "Hide orders" : "Orders"}
                            </Button>
                            {d.isDisabledByCompany ? (
                              <Button size="sm" variant="default" disabled={enableMutation.isPending} onClick={() => enableMutation.mutate(d.driverId)}>
                                Enable
                              </Button>
                            ) : (
                              <Button size="sm" variant="destructive" onClick={() => setDisableTarget(d.driverId)}>
                                Disable
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {selectedDriverId && (
                  <div className="mt-6 border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Recent orders</h4>
                    {ordersLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : driverOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No assigned orders yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>State</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {driverOrders.map((o: any) => (
                            <TableRow key={o.id}>
                              <TableCell>{o.state}</TableCell>
                              <TableCell>{formatCurrency((o.total_cents || 0) / 100)}</TableCell>
                              <TableCell>{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Fleet vehicles</CardTitle>
                  <CardDescription>Add vehicles to your pool, assign them to linked drivers, or unassign when they return to the yard.</CardDescription>
                </div>
                <Button onClick={() => setAddVehicleOpen(true)}>
                  <Truck className="h-4 w-4 mr-2" />
                  Add vehicle
                </Button>
              </CardHeader>
              <CardContent>
                {vehiclesLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                ) : fleetVehicles.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No fleet vehicles yet. Add one to assign to drivers.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Registration</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Capacity (L)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned driver</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fleetVehicles.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.registrationNumber}</TableCell>
                          <TableCell>
                            {[v.make, v.model, v.year].filter(Boolean).join(" ") || "—"}
                          </TableCell>
                          <TableCell>{v.capacityLitres ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{v.vehicleStatus || "pending"}</Badge>
                          </TableCell>
                          <TableCell>
                            {v.driverId ? (
                              <span>{v.assignedDriverName || v.driverId.slice(0, 8) + "…"}</span>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {!v.driverId ? (
                              <Button size="sm" variant="default" onClick={() => { setAssignVehicleId(v.id); setAssignDriverId(""); }}>
                                Assign
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={unassignVehicleMutation.isPending}
                                onClick={() => unassignVehicleMutation.mutate(v.id)}
                              >
                                Unassign
                              </Button>
                            )}
                            {!v.driverId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                disabled={deleteFleetVehicleMutation.isPending}
                                onClick={() => {
                                  if (confirm("Delete this vehicle from your fleet?")) deleteFleetVehicleMutation.mutate(v.id);
                                }}
                              >
                                Delete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {overviewLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : overview && overview.totalDrivers === 0 ? (
              <Card className="border-dashed border-primary/25 bg-muted/20">
              <CardHeader>
                  <CardTitle>No fleet drivers yet</CardTitle>
                  <CardDescription>
                    When drivers are linked to your company, this page shows delivery volume, trends, and fleet usage in
                    one place.
                  </CardDescription>
              </CardHeader>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatsCard
                    title="Deliveries (30 days)"
                    value={dailyLoading ? "…" : deliveriesLast30}
                    description="Completed orders by linked drivers"
                    icon={PackageCheck}
                  />
                  <StatsCard
                    title="Daily average"
                    value={dailyLoading ? "…" : avgDeliveriesPerDay.toFixed(1)}
                    description="Mean completed deliveries per day"
                    icon={TrendingUp}
                  />
                  <StatsCard
                    title="Busiest day"
                    value={dailyLoading ? "…" : busiestDay?.count ?? 0}
                    description={
                      dailyLoading
                        ? "Loading…"
                        : busiestDay && busiestDay.count > 0
                          ? busiestDay.label
                          : "No deliveries in this window"
                    }
                    icon={CalendarDays}
                  />
                  <StatsCard
                    title="Active in fleet"
                    value={overview?.activeFleetCount ?? 0}
                    description={`${overview?.disabledDrivers ?? 0} disabled by company`}
                    icon={UserCheck}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <StatsCard
                    title="Fleet vehicles in use"
                    value={
                      vehiclesLoading ? "…" : fleetVehicles.length ? `${fleetAssignedCount} / ${fleetVehicles.length}` : "—"
                    }
                    description={
                      fleetVehicles.length
                        ? `${Math.round((fleetAssignedCount / fleetVehicles.length) * 100)}% of pool assigned to drivers`
                        : "Add vehicles under the Vehicles tab"
                    }
                    icon={Truck}
                  />
                  <StatsCard
                    title="All-time deliveries"
                    value={overview?.completedDeliveries ?? 0}
                    description="Completed orders (entire history)"
                    icon={BarChart3}
                  />
                  <StatsCard
                    title="All-time revenue"
                    value={formatCurrency((overview?.revenueCents ?? 0) / 100)}
                    description="From completed orders"
                    icon={DollarSign}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  <Card className="lg:col-span-2 overflow-hidden border-border/80 shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Delivery trend</CardTitle>
                      <CardDescription>
                        Last 30 days — each point is completed deliveries for that calendar day (local time).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[340px] pt-0">
                {dailyLoading ? (
                        <div className="flex h-full items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={deliveryChartSeries} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="companyDeliveryGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/50" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              tickLine={false}
                              axisLine={false}
                              interval={4}
                              height={40}
                            />
                            <YAxis
                              allowDecimals={false}
                              width={36}
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: 10,
                                border: "1px solid hsl(var(--border))",
                                background: "hsl(var(--card))",
                                boxShadow: "0 8px 24px hsl(var(--foreground) / 0.08)",
                              }}
                              labelFormatter={(_, payload) =>
                                (payload?.[0]?.payload as { date?: string } | undefined)?.date ?? ""
                              }
                              formatter={(value: number) => [`${value}`, "Deliveries"]}
                            />
                            {avgDeliveriesPerDay > 0 && deliveriesLast30 > 0 && (
                              <ReferenceLine
                                y={Number(avgDeliveriesPerDay.toFixed(2))}
                                stroke="hsl(var(--muted-foreground))"
                                strokeDasharray="5 5"
                                strokeOpacity={0.7}
                              />
                            )}
                            <Area
                              type="monotone"
                              dataKey="count"
                              name="Deliveries"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              fill="url(#companyDeliveryGradient)"
                              activeDot={{ r: 5, strokeWidth: 0 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/80 shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Volume by day</CardTitle>
                      <CardDescription>Bar view for quick comparison</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[340px] pt-0">
                      {dailyLoading ? (
                        <div className="flex h-full items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={deliveryChartSeries} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/50" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                              tickLine={false}
                              axisLine={false}
                              interval={6}
                              height={40}
                            />
                            <YAxis
                              allowDecimals={false}
                              width={32}
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: 10,
                                border: "1px solid hsl(var(--border))",
                                background: "hsl(var(--card))",
                              }}
                              labelFormatter={(_, payload) =>
                                (payload?.[0]?.payload as { date?: string } | undefined)?.date ?? ""
                              }
                            />
                            <Bar
                              dataKey="count"
                              name="Deliveries"
                              fill="hsl(var(--primary))"
                              fillOpacity={0.85}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={14}
                            />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
                </div>

                <Card className="border-border/80 shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-primary" />
                      Recent daily breakdown
                    </CardTitle>
                    <CardDescription>Last seven calendar days — use this for quick spot checks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {dailyLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Deliveries</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deliveryChartSeries.slice(-7).map((row) => (
                            <TableRow key={row.date}>
                              <TableCell className="font-medium">{row.label}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
          </div>
        </main>
      </div>

      <Dialog open={addVehicleOpen} onOpenChange={setAddVehicleOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add fleet vehicle</DialogTitle>
            <DialogDescription>
              Same vehicle details as driver portal. Registration is required.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateVehicleSubmit} className="space-y-4">
            <div className="grid gap-4 py-2">
            <div className="space-y-2">
                <Label htmlFor="fv-reg">Registration Number *</Label>
                <Input id="fv-reg" name="registration_number" placeholder="e.g. CA 123-456" required />
            </div>

              <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fv-make">Make</Label>
                  <Input id="fv-make" name="make" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fv-model">Model</Label>
                  <Input id="fv-model" name="model" />
              </div>
            </div>

              <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fv-year">Year</Label>
                  <Input id="fv-year" name="year" type="number" min={1900} max={new Date().getFullYear() + 1} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fv-cap">Capacity (L)</Label>
                  <Input id="fv-cap" name="capacity_litres" type="number" min={0} />
              </div>
            </div>

              <div className="space-y-2">
                <Label>Fuel Types</Label>
                <p className="text-sm text-muted-foreground">
                  {fuelTypes.length > 0
                    ? `All fuel types on the platform: ${fuelTypes.map((ft: { label: string }) => ft.label).join(", ")}.`
                    : "Loading fuel types..."}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {fuelTypes.map((fuelType: any) => (
                    <label key={fuelType.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="fuel_types" value={fuelType.code} className="rounded" />
                      <span>{fuelType.label}</span>
                    </label>
                  ))}
          </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="license_disk_expiry">License Disk Expiry</Label>
                  <Input id="license_disk_expiry" name="license_disk_expiry" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roadworthy_expiry">Roadworthy Expiry</Label>
                  <Input id="roadworthy_expiry" name="roadworthy_expiry" type="date" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="insurance_expiry">Insurance Expiry</Label>
                  <Input id="insurance_expiry" name="insurance_expiry" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tracker_installed">Tracker Installed</Label>
                  <select
                    id="tracker_installed"
                    name="tracker_installed"
                    defaultValue="no"
                    className={cn(
                      "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tracker_provider">Tracker Provider</Label>
                <Input id="tracker_provider" name="tracker_provider" placeholder="e.g. Tracker, Cartrack" />
              </div>

              <div className="border-t pt-4 space-y-3">
                <h4 className="font-medium">Vehicle Compliance</h4>
                <div className="space-y-2">
                  <Label htmlFor="vehicle_reg_certificate_number">Vehicle Registration Certificate Number</Label>
                  <Input id="vehicle_reg_certificate_number" name="vehicle_reg_certificate_number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roadworthy_certificate_number">Roadworthy Certificate Number</Label>
                  <Input id="roadworthy_certificate_number" name="roadworthy_certificate_number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roadworthy_issue_date">Roadworthy Issue Date</Label>
                  <Input id="roadworthy_issue_date" name="roadworthy_issue_date" type="date" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="dg_vehicle_permit_required">DG Vehicle Permit Required</Label>
                    <select
                      id="dg_vehicle_permit_required"
                      name="dg_vehicle_permit_required"
                      defaultValue="no"
                      className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      )}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dg_vehicle_permit_number">DG Vehicle Permit Number</Label>
                    <Input id="dg_vehicle_permit_number" name="dg_vehicle_permit_number" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="dg_vehicle_permit_issue_date">DG Permit Issue Date</Label>
                    <Input id="dg_vehicle_permit_issue_date" name="dg_vehicle_permit_issue_date" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dg_vehicle_permit_expiry_date">DG Permit Expiry Date</Label>
                    <Input id="dg_vehicle_permit_expiry_date" name="dg_vehicle_permit_expiry_date" type="date" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_insured">Vehicle Insured</Label>
                    <select
                      id="vehicle_insured"
                      name="vehicle_insured"
                      defaultValue="no"
                      className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      )}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insurance_provider">Insurance Provider</Label>
                    <Input id="insurance_provider" name="insurance_provider" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="policy_number">Policy Number</Label>
                    <Input id="policy_number" name="policy_number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="policy_expiry_date">Policy Expiry Date</Label>
                    <Input id="policy_expiry_date" name="policy_expiry_date" type="date" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="loa_required">LOA Required</Label>
                    <select
                      id="loa_required"
                      name="loa_required"
                      defaultValue="no"
                      className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      )}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loa_issue_date">LOA Issue Date</Label>
                    <Input id="loa_issue_date" name="loa_issue_date" type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loa_expiry_date">LOA Expiry Date</Label>
                  <Input id="loa_expiry_date" name="loa_expiry_date" type="date" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddVehicleOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createVehicleMutation.isPending}>
              {createVehicleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignVehicleId} onOpenChange={(o) => { if (!o) { setAssignVehicleId(null); setAssignDriverId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign vehicle</DialogTitle>
            <DialogDescription>Choose a driver linked to your company. They will see this vehicle in their app.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Driver</Label>
            <Select value={assignDriverId} onValueChange={setAssignDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Select driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers
                  .filter((d) => !d.isDisabledByCompany)
                  .map((d) => (
                    <SelectItem key={d.driverId} value={d.driverId}>
                      {d.fullName || d.driverId.slice(0, 8) + "…"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignVehicleId(null); setAssignDriverId(""); }}>Cancel</Button>
            <Button
              disabled={!assignDriverId || !assignVehicleId || assignVehicleMutation.isPending}
              onClick={() =>
                assignVehicleId &&
                assignDriverId &&
                assignVehicleMutation.mutate({ vehicleId: assignVehicleId, driverId: assignDriverId })
              }
            >
              {assignVehicleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable driver for fleet?</DialogTitle>
            <DialogDescription>
              They will stop receiving dispatch offers until re-enabled or they leave your company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" value={disableReason} onChange={(e) => setDisableReason(e.target.value)} placeholder="e.g. Vehicle inspection" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={disableMutation.isPending || !disableTarget}
              onClick={() => disableTarget && disableMutation.mutate({ driverId: disableTarget, reason: disableReason || undefined })}
            >
              {disableMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
