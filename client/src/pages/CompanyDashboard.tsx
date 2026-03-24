import { useState } from "react";
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
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
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
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
  const { profile } = useAuth();
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
  const [newVehicle, setNewVehicle] = useState({
    registration_number: "",
    make: "",
    model: "",
    year: "" as string,
    capacity_litres: "" as string,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<{
    totalDrivers: number;
    activeFleetCount: number;
    disabledDrivers: number;
    completedDeliveries: number;
    revenueCents: number;
  }>({
    queryKey: ["/api/company/overview"],
    enabled: profile?.role === "company",
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery<CompanyDriverRow[]>({
    queryKey: ["/api/company/drivers"],
    enabled: profile?.role === "company",
  });

  const { data: daily = [], isLoading: dailyLoading } = useQuery<{ date: string; count: number }[]>({
    queryKey: ["/api/company/analytics/daily-deliveries"],
    enabled: profile?.role === "company" && tab === "analytics",
  });

  const { data: fleetVehicles = [], isLoading: vehiclesLoading } = useQuery<CompanyVehicleRow[]>({
    queryKey: ["/api/company/vehicles"],
    enabled: profile?.role === "company",
  });

  const createVehicleMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/company/vehicles", {
        registration_number: newVehicle.registration_number.trim(),
        make: newVehicle.make.trim() || undefined,
        model: newVehicle.model.trim() || undefined,
        year: newVehicle.year ? parseInt(newVehicle.year, 10) : undefined,
        capacity_litres: newVehicle.capacity_litres ? parseInt(newVehicle.capacity_litres, 10) : undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Vehicle added" });
      setAddVehicleOpen(false);
      setNewVehicle({ registration_number: "", make: "", model: "", year: "", capacity_litres: "" });
      qc.invalidateQueries({ queryKey: ["/api/company/vehicles"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

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
    enabled: !!selectedDriverId && profile?.role === "company",
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

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px]">
          <nav className="flex flex-col gap-2 mt-8">
            <Button variant={tab === "overview" ? "secondary" : "ghost"} className="justify-start" onClick={() => { setTab("overview"); setSidebarOpen(false); }}>
              <LayoutDashboard className="h-4 w-4 mr-2" /> Overview
            </Button>
            <Button variant={tab === "drivers" ? "secondary" : "ghost"} className="justify-start" onClick={() => { setTab("drivers"); setSidebarOpen(false); }}>
              <Users className="h-4 w-4 mr-2" /> Drivers
            </Button>
            <Button variant={tab === "vehicles" ? "secondary" : "ghost"} className="justify-start" onClick={() => { setTab("vehicles"); setSidebarOpen(false); }}>
              <Truck className="h-4 w-4 mr-2" /> Vehicles
            </Button>
            <Button variant={tab === "analytics" ? "secondary" : "ghost"} className="justify-start" onClick={() => { setTab("analytics"); setSidebarOpen(false); }}>
              <BarChart3 className="h-4 w-4 mr-2" /> Analytics
            </Button>
          </nav>
        </SheetContent>
      </Sheet>

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fleet company</h1>
            <p className="text-muted-foreground">Manage drivers linked to your company and view performance</p>
          </div>
          <Button variant="outline" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as CompanyTab)} className="space-y-6">
          <TabsList className="hidden md:flex flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
            <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
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
            <Card>
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
                <CardDescription>Review driver roster and delivery trends</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setTab("drivers")}>Manage drivers</Button>
                <Button variant="outline" onClick={() => setTab("vehicles")}>Manage vehicles</Button>
                <Button variant="outline" onClick={() => setTab("analytics")}>View analytics</Button>
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
            <Card>
              <CardHeader>
                <CardTitle>Deliveries per day</CardTitle>
                <CardDescription>Last 30 days — completed deliveries by drivers linked to your company</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                {dailyLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                ) : daily.length === 0 ? (
                  <p className="text-muted-foreground text-center py-12">No delivery data in this period.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Deliveries" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={addVehicleOpen} onOpenChange={setAddVehicleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add fleet vehicle</DialogTitle>
            <DialogDescription>Registration is required. Other fields help with dispatch capacity and compliance.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="fv-reg">Registration</Label>
              <Input
                id="fv-reg"
                value={newVehicle.registration_number}
                onChange={(e) => setNewVehicle((s) => ({ ...s, registration_number: e.target.value }))}
                placeholder="e.g. CA 123-456"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="fv-make">Make</Label>
                <Input id="fv-make" value={newVehicle.make} onChange={(e) => setNewVehicle((s) => ({ ...s, make: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fv-model">Model</Label>
                <Input id="fv-model" value={newVehicle.model} onChange={(e) => setNewVehicle((s) => ({ ...s, model: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="fv-year">Year</Label>
                <Input id="fv-year" value={newVehicle.year} onChange={(e) => setNewVehicle((s) => ({ ...s, year: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fv-cap">Capacity (L)</Label>
                <Input id="fv-cap" value={newVehicle.capacity_litres} onChange={(e) => setNewVehicle((s) => ({ ...s, capacity_litres: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddVehicleOpen(false)}>Cancel</Button>
            <Button
              disabled={!newVehicle.registration_number.trim() || createVehicleMutation.isPending}
              onClick={() => createVehicleMutation.mutate()}
            >
              {createVehicleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
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
