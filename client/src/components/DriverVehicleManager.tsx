import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Truck, Plus, Edit, Trash2, Calendar, Gauge } from "lucide-react";
import type { Vehicle } from "@shared/schema";

export function DriverVehicleManager() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);

  // Fetch vehicles
  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/driver/vehicles"],
  });

  // Fetch fuel types for selection
  const { data: fuelTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
  });

  // Add/Update vehicle mutation
  const saveVehicleMutation = useMutation({
    mutationFn: async (data: any) => {
      const method = editingVehicle ? "PATCH" : "POST";
      const url = editingVehicle 
        ? `/api/driver/vehicles/${editingVehicle.id}` 
        : "/api/driver/vehicles";
      
      const response = await apiRequest(method, url, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
      setDialogOpen(false);
      setEditingVehicle(null);
      toast({
        title: "Success",
        description: `Vehicle ${editingVehicle ? "updated" : "added"} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save vehicle",
        variant: "destructive",
      });
    },
  });

  // Delete vehicle mutation
  const deleteVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      const response = await apiRequest("DELETE", `/api/driver/vehicles/${vehicleId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
      setDeleteDialogOpen(false);
      setVehicleToDelete(null);
      toast({
        title: "Success",
        description: "Vehicle deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vehicle",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setDialogOpen(true);
  };

  const handleDelete = (vehicleId: string) => {
    setVehicleToDelete(vehicleId);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const fuelTypesSelected = formData.getAll("fuel_types").filter(Boolean);
    
    const data = {
      registration_number: formData.get("registration_number"),
      make: formData.get("make"),
      model: formData.get("model"),
      year: formData.get("year") ? parseInt(formData.get("year") as string) : null,
      capacity_litres: formData.get("capacity_litres") ? parseInt(formData.get("capacity_litres") as string) : null,
      fuel_types: fuelTypesSelected.length > 0 ? fuelTypesSelected : null,
      license_disk_expiry: formData.get("license_disk_expiry") || null,
      roadworthy_expiry: formData.get("roadworthy_expiry") || null,
      insurance_expiry: formData.get("insurance_expiry") || null,
      tracker_installed: formData.get("tracker_installed") === "yes",
      tracker_provider: formData.get("tracker_provider") || null,
    };

    saveVehicleMutation.mutate(data);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Not set";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString("en-ZA");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            My Vehicles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">Loading vehicles...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              My Vehicles
            </CardTitle>
            <CardDescription>
              Manage your delivery vehicles and their compliance documents
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditingVehicle(null);
              setDialogOpen(true);
            }}
            size="sm"
            data-testid="button-add-vehicle"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Vehicle
          </Button>
        </CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No vehicles added yet</p>
              <p className="text-sm mt-2">Add your first vehicle to start accepting deliveries</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vehicles.map((vehicle) => (
                <Card key={vehicle.id} className="relative" data-testid={`vehicle-card-${vehicle.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{vehicle.registrationNumber}</CardTitle>
                        <CardDescription>
                          {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(vehicle)}
                          data-testid={`button-edit-${vehicle.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(vehicle.id)}
                          data-testid={`button-delete-${vehicle.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {vehicle.capacityLitres && (
                      <div className="flex items-center gap-2 text-sm">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Capacity:</span>
                        <span className="font-medium">{vehicle.capacityLitres.toLocaleString()} L</span>
                      </div>
                    )}
                    
                    {vehicle.fuelTypes && vehicle.fuelTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {vehicle.fuelTypes.map((fuelCode: string) => (
                          <Badge key={fuelCode} variant="secondary" className="text-xs">
                            {fuelCode}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 text-sm pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">License:</span>
                        <span className="text-xs">{formatDate(vehicle.licenseDiskExpiry)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Roadworthy:</span>
                        <span className="text-xs">{formatDate(vehicle.roadworthyExpiry)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Insurance:</span>
                        <span className="text-xs">{formatDate(vehicle.insuranceExpiry)}</span>
                      </div>
                    </div>

                    {vehicle.trackerInstalled && (
                      <Badge variant="outline" className="text-xs">
                        Tracker: {vehicle.trackerProvider || "Installed"}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Vehicle Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
            <DialogDescription>
              Enter your vehicle details and compliance information
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="registration_number">Registration Number *</Label>
                <Input
                  id="registration_number"
                  name="registration_number"
                  defaultValue={editingVehicle?.registrationNumber || ""}
                  placeholder="e.g., ABC123GP"
                  required
                  data-testid="input-registration-number"
                />
              </div>

              <div>
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  name="make"
                  defaultValue={editingVehicle?.make || ""}
                  placeholder="e.g., Toyota"
                  data-testid="input-make"
                />
              </div>

              <div>
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  name="model"
                  defaultValue={editingVehicle?.model || ""}
                  placeholder="e.g., Hilux"
                  data-testid="input-model"
                />
              </div>

              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  name="year"
                  type="number"
                  defaultValue={editingVehicle?.year || ""}
                  placeholder="e.g., 2020"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  data-testid="input-year"
                />
              </div>

              <div>
                <Label htmlFor="capacity_litres">Capacity (Litres)</Label>
                <Input
                  id="capacity_litres"
                  name="capacity_litres"
                  type="number"
                  defaultValue={editingVehicle?.capacityLitres || ""}
                  placeholder="e.g., 5000"
                  min="0"
                  data-testid="input-capacity"
                />
              </div>

              <div className="col-span-2">
                <Label>Fuel Types</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {fuelTypes.map((fuelType: any) => (
                    <label key={fuelType.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="fuel_types"
                        value={fuelType.code}
                        defaultChecked={editingVehicle?.fuelTypes?.includes(fuelType.code)}
                        className="rounded"
                      />
                      <span className="text-sm">{fuelType.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="license_disk_expiry">License Disk Expiry</Label>
                <Input
                  id="license_disk_expiry"
                  name="license_disk_expiry"
                  type="date"
                  defaultValue={(() => {
                    const date = editingVehicle?.licenseDiskExpiry;
                    if (!date) return "";
                    const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                    return dateStr.split("T")[0];
                  })()}
                  data-testid="input-license-expiry"
                />
              </div>

              <div>
                <Label htmlFor="roadworthy_expiry">Roadworthy Expiry</Label>
                <Input
                  id="roadworthy_expiry"
                  name="roadworthy_expiry"
                  type="date"
                  defaultValue={(() => {
                    const date = editingVehicle?.roadworthyExpiry;
                    if (!date) return "";
                    const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                    return dateStr.split("T")[0];
                  })()}
                  data-testid="input-roadworthy-expiry"
                />
              </div>

              <div>
                <Label htmlFor="insurance_expiry">Insurance Expiry</Label>
                <Input
                  id="insurance_expiry"
                  name="insurance_expiry"
                  type="date"
                  defaultValue={(() => {
                    const date = editingVehicle?.insuranceExpiry;
                    if (!date) return "";
                    const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                    return dateStr.split("T")[0];
                  })()}
                  data-testid="input-insurance-expiry"
                />
              </div>

              <div>
                <Label htmlFor="tracker_installed">Tracker Installed</Label>
                <Select 
                  name="tracker_installed" 
                  defaultValue={editingVehicle?.trackerInstalled ? "yes" : "no"}
                >
                  <SelectTrigger data-testid="select-tracker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label htmlFor="tracker_provider">Tracker Provider</Label>
                <Input
                  id="tracker_provider"
                  name="tracker_provider"
                  defaultValue={editingVehicle?.trackerProvider || ""}
                  placeholder="e.g., Tracker, Cartrack"
                  data-testid="input-tracker-provider"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveVehicleMutation.isPending}
                data-testid="button-save-vehicle"
              >
                {saveVehicleMutation.isPending ? "Saving..." : editingVehicle ? "Update Vehicle" : "Add Vehicle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vehicle</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this vehicle? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => vehicleToDelete && deleteVehicleMutation.mutate(vehicleToDelete)}
              disabled={deleteVehicleMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteVehicleMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
