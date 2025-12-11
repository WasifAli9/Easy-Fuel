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
import { Truck, Plus, Edit, Trash2, Calendar, Gauge, Shield, Upload, FileText, CheckCircle2, XCircle, AlertTriangle, Eye } from "lucide-react";
import { normalizeFilePath } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { Vehicle } from "@shared/schema";

export function DriverVehicleManager() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);
  const [selectedVehicleForCompliance, setSelectedVehicleForCompliance] = useState<string | null>(null);
  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);

  // Fetch vehicles
  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/driver/vehicles"],
  });

  // Fetch fuel types for selection
  const { data: fuelTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
  });

  // Fetch vehicle documents for selected vehicle
  const { data: vehicleDocuments = [], refetch: refetchVehicleDocuments } = useQuery<any[]>({
    queryKey: ["/api/driver/vehicles", selectedVehicleForCompliance, "documents"],
    enabled: !!selectedVehicleForCompliance,
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  });

  // Get vehicle compliance status
  const { data: vehicleComplianceStatus } = useQuery<any>({
    queryKey: ["/api/driver/vehicles", selectedVehicleForCompliance, "compliance/status"],
    enabled: !!selectedVehicleForCompliance,
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  });

  // Helper function to find document by type
  const findVehicleDocument = (docType: string) => {
    return vehicleDocuments.find((d: any) => d.doc_type === docType);
  };

  // Helper function to get document status badge
  const getDocumentStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
      case "approved":
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case "pending":
      case "pending_review":
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  // Helper function to handle document upload
  const handleVehicleDocumentUpload = async (
    docType: string,
    title: string,
    result: any
  ) => {
    if (!result.successful || result.successful.length === 0) return;
    
    const uploadedFile = result.successful[0];
    if (!uploadedFile?.uploadURL) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/documents", {
        method: "PUT",
        headers,
        body: JSON.stringify({ documentURL: uploadedFile.uploadURL }),
      });

      if (!response.ok) throw new Error("Failed to set document ACL");
      const { objectPath } = await response.json();
      
      const documentResponse = await apiRequest("POST", "/api/driver/documents", {
        owner_type: "vehicle",
        owner_id: selectedVehicleForCompliance,
        doc_type: docType,
        title: title || uploadedFile.name,
        file_path: objectPath,
        file_size: uploadedFile.size,
        mime_type: uploadedFile.type,
      });
      
      const newDocument = await documentResponse.json();
      
      // Immediately refetch queries to update UI - use refetchQueries for immediate update
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/driver/vehicles", selectedVehicleForCompliance, "documents"] }),
        queryClient.refetchQueries({ queryKey: ["/api/driver/vehicles", selectedVehicleForCompliance, "compliance/status"] }),
      ]);
      
      // Also invalidate to ensure any other related queries are refreshed
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", selectedVehicleForCompliance, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", selectedVehicleForCompliance, "compliance/status"] });
      
      toast({
        title: "Success",
        description: "Document uploaded successfully. Status: Pending Review",
      });
    } catch (error: any) {
      console.error("Error uploading vehicle document:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
      // Ensure modal can still be closed even if there's an error
      // Don't close automatically on error - let user decide
    }
  };

  // Get upload URL helper
  const getUploadURL = async () => {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/objects/upload", {
      method: "POST",
      headers,
    });
    const { uploadURL } = await response.json();
    return { method: "PUT" as const, url: uploadURL };
  };

  // Define all required vehicle documents
  const requiredVehicleDocuments = [
    { docType: "vehicle_registration", title: "Vehicle Registration Certificate", required: true },
    { docType: "roadworthy_certificate", title: "Roadworthy Certificate", required: true },
    { docType: "insurance_certificate", title: "Insurance Certificate", required: true },
    { docType: "dg_vehicle_permit", title: "Dangerous Goods Vehicle Permit", required: false },
    { docType: "letter_of_authority", title: "Letter of Authority", required: false },
  ];

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

  // Update vehicle compliance mutation
  const updateVehicleComplianceMutation = useMutation({
    mutationFn: async (data: { vehicleId: string; complianceData: any }) => {
      return apiRequest("POST", `/api/driver/vehicles/${data.vehicleId}/compliance`, data.complianceData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", selectedVehicleForCompliance, "compliance/status"] });
      toast({
        title: "Success",
        description: "Vehicle compliance updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vehicle compliance",
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
      roadworthy_certificate_number: formData.get("roadworthy_certificate_number") || null,
      roadworthy_issue_date: formData.get("roadworthy_issue_date") || null,
      vehicle_reg_certificate_number: formData.get("vehicle_reg_certificate_number") || null,
      dg_vehicle_permit_required: formData.get("dg_vehicle_permit_required") === "yes",
      dg_vehicle_permit_number: formData.get("dg_vehicle_permit_number") || null,
      dg_vehicle_permit_issue_date: formData.get("dg_vehicle_permit_issue_date") || null,
      dg_vehicle_permit_expiry_date: formData.get("dg_vehicle_permit_expiry_date") || null,
      vehicle_insured: formData.get("vehicle_insured") === "yes",
      insurance_provider: formData.get("insurance_provider") || null,
      policy_number: formData.get("policy_number") || null,
      policy_expiry_date: formData.get("policy_expiry_date") || null,
      insurance_expiry: formData.get("insurance_expiry") || null,
      loa_required: formData.get("loa_required") === "yes",
      loa_issue_date: formData.get("loa_issue_date") || null,
      loa_expiry_date: formData.get("loa_expiry_date") || null,
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

                    <Separator />

                    {/* Vehicle Compliance Status */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Compliance Status
                        </span>
                        <Badge 
                          variant={
                            vehicle.vehicleStatus === "active" ? "default" :
                            vehicle.vehicleStatus === "rejected" ? "destructive" :
                            vehicle.vehicleStatus === "suspended" ? "secondary" :
                            "secondary"
                          }
                          className="text-xs"
                        >
                          {vehicle.vehicleStatus === "active" ? "Approved" :
                           vehicle.vehicleStatus === "rejected" ? "Rejected" :
                           vehicle.vehicleStatus === "suspended" ? "Suspended" :
                           vehicle.vehicleStatus === "pending_compliance" || !vehicle.vehicleStatus ? "Pending" :
                           "Pending"}
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedVehicleForCompliance(vehicle.id);
                          setComplianceDialogOpen(true);
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Manage Compliance
                      </Button>
                    </div>
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

              <Separator className="col-span-2" />

              {/* Vehicle Compliance Section */}
              <div className="col-span-2 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Vehicle Compliance
                </h3>

                <div>
                  <Label htmlFor="vehicle_reg_certificate_number">Vehicle Registration Certificate Number</Label>
                  <Input
                    id="vehicle_reg_certificate_number"
                    name="vehicle_reg_certificate_number"
                    defaultValue={(editingVehicle as any)?.vehicleRegCertificateNumber || ""}
                    placeholder="Enter certificate number"
                  />
                </div>

                <div>
                  <Label htmlFor="roadworthy_certificate_number">Roadworthy Certificate Number</Label>
                  <Input
                    id="roadworthy_certificate_number"
                    name="roadworthy_certificate_number"
                    defaultValue={(editingVehicle as any)?.roadworthyCertificateNumber || ""}
                    placeholder="Enter certificate number"
                  />
                </div>

                <div>
                  <Label htmlFor="roadworthy_issue_date">Roadworthy Issue Date</Label>
                  <Input
                    id="roadworthy_issue_date"
                    name="roadworthy_issue_date"
                    type="date"
                    defaultValue={(() => {
                      const date = (editingVehicle as any)?.roadworthyIssueDate;
                      if (!date) return "";
                      const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                      return dateStr.split("T")[0];
                    })()}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="dg_vehicle_permit_required"
                    name="dg_vehicle_permit_required"
                    value="yes"
                    defaultChecked={(editingVehicle as any)?.dgVehiclePermitRequired || false}
                    className="rounded"
                  />
                  <Label htmlFor="dg_vehicle_permit_required" className="cursor-pointer">
                    Dangerous Goods Vehicle Permit Required
                  </Label>
                </div>

                {(() => {
                  const form = document.querySelector('form');
                  const checkbox = form?.querySelector('#dg_vehicle_permit_required') as HTMLInputElement;
                  return checkbox?.checked || (editingVehicle as any)?.dgVehiclePermitRequired;
                })() && (
                  <>
                    <div>
                      <Label htmlFor="dg_vehicle_permit_number">DG Vehicle Permit Number</Label>
                      <Input
                        id="dg_vehicle_permit_number"
                        name="dg_vehicle_permit_number"
                        defaultValue={(editingVehicle as any)?.dgVehiclePermitNumber || ""}
                        placeholder="Enter permit number"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="dg_vehicle_permit_issue_date">Permit Issue Date</Label>
                        <Input
                          id="dg_vehicle_permit_issue_date"
                          name="dg_vehicle_permit_issue_date"
                          type="date"
                          defaultValue={(() => {
                            const date = (editingVehicle as any)?.dgVehiclePermitIssueDate;
                            if (!date) return "";
                            const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                            return dateStr.split("T")[0];
                          })()}
                        />
                      </div>
                      <div>
                        <Label htmlFor="dg_vehicle_permit_expiry_date">Permit Expiry Date</Label>
                        <Input
                          id="dg_vehicle_permit_expiry_date"
                          name="dg_vehicle_permit_expiry_date"
                          type="date"
                          defaultValue={(() => {
                            const date = (editingVehicle as any)?.dgVehiclePermitExpiryDate;
                            if (!date) return "";
                            const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                            return dateStr.split("T")[0];
                          })()}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="vehicle_insured"
                    name="vehicle_insured"
                    value="yes"
                    defaultChecked={(editingVehicle as any)?.vehicleInsured || false}
                    className="rounded"
                  />
                  <Label htmlFor="vehicle_insured" className="cursor-pointer">
                    Vehicle Insured
                  </Label>
                </div>

                {(() => {
                  const form = document.querySelector('form');
                  const checkbox = form?.querySelector('#vehicle_insured') as HTMLInputElement;
                  return checkbox?.checked || (editingVehicle as any)?.vehicleInsured;
                })() && (
                  <>
                    <div>
                      <Label htmlFor="insurance_provider">Insurance Provider</Label>
                      <Input
                        id="insurance_provider"
                        name="insurance_provider"
                        defaultValue={(editingVehicle as any)?.insuranceProvider || ""}
                        placeholder="Enter insurance provider"
                      />
                    </div>
                    <div>
                      <Label htmlFor="policy_number">Policy Number</Label>
                      <Input
                        id="policy_number"
                        name="policy_number"
                        defaultValue={(editingVehicle as any)?.policyNumber || ""}
                        placeholder="Enter policy number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="policy_expiry_date">Policy Expiry Date</Label>
                      <Input
                        id="policy_expiry_date"
                        name="policy_expiry_date"
                        type="date"
                        defaultValue={(() => {
                          const date = (editingVehicle as any)?.policyExpiryDate;
                          if (!date) return "";
                          const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                          return dateStr.split("T")[0];
                        })()}
                      />
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="loa_required"
                    name="loa_required"
                    value="yes"
                    defaultChecked={(editingVehicle as any)?.loaRequired || false}
                    className="rounded"
                  />
                  <Label htmlFor="loa_required" className="cursor-pointer">
                    Letter of Authority Required (if vehicle not in your name)
                  </Label>
                </div>

                {(() => {
                  const form = document.querySelector('form');
                  const checkbox = form?.querySelector('#loa_required') as HTMLInputElement;
                  return checkbox?.checked || (editingVehicle as any)?.loaRequired;
                })() && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="loa_issue_date">LOA Issue Date</Label>
                      <Input
                        id="loa_issue_date"
                        name="loa_issue_date"
                        type="date"
                        defaultValue={(() => {
                          const date = (editingVehicle as any)?.loaIssueDate;
                          if (!date) return "";
                          const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                          return dateStr.split("T")[0];
                        })()}
                      />
                    </div>
                    <div>
                      <Label htmlFor="loa_expiry_date">LOA Expiry Date</Label>
                      <Input
                        id="loa_expiry_date"
                        name="loa_expiry_date"
                        type="date"
                        defaultValue={(() => {
                          const date = (editingVehicle as any)?.loaExpiryDate;
                          if (!date) return "";
                          const dateStr = typeof date === "string" ? date : new Date(date).toISOString();
                          return dateStr.split("T")[0];
                        })()}
                      />
                    </div>
                  </div>
                )}
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

      {/* Vehicle Compliance Management Dialog */}
      <Dialog 
        open={complianceDialogOpen} 
        onOpenChange={(open) => {
          setComplianceDialogOpen(open);
          if (!open) {
            setSelectedVehicleForCompliance(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vehicle Compliance Management</DialogTitle>
            <DialogDescription>
              Upload compliance documents and manage vehicle compliance status
            </DialogDescription>
          </DialogHeader>
          
          {vehicleComplianceStatus && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Compliance Status</span>
                  <Badge 
                    variant={
                      vehicleComplianceStatus.overallStatus === "approved" ? "default" :
                      vehicleComplianceStatus.overallStatus === "rejected" ? "destructive" :
                      "secondary"
                    }
                  >
                    {vehicleComplianceStatus.overallStatus === "approved" ? "Approved" :
                     vehicleComplianceStatus.overallStatus === "rejected" ? "Rejected" :
                     vehicleComplianceStatus.overallStatus === "pending" ? "Pending Review" :
                     "Incomplete"}
                  </Badge>
                </div>
                {vehicleComplianceStatus.checklist && (
                  <>
                    <Progress 
                      value={
                        vehicleComplianceStatus.checklist.required.length > 0
                          ? (vehicleComplianceStatus.checklist.approved.length / vehicleComplianceStatus.checklist.required.length) * 100
                          : 0
                      } 
                      className="h-2"
                    />
                    <p className="text-sm text-muted-foreground">
                      {vehicleComplianceStatus.checklist.approved.length} / {vehicleComplianceStatus.checklist.required.length} documents approved
                    </p>
                  </>
                )}
              </div>

              {vehicleComplianceStatus.checklist?.missing.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Missing documents: {vehicleComplianceStatus.checklist.missing.join(", ")}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Required Documents</h3>
            <div className="space-y-3">
              {requiredVehicleDocuments.map((doc) => {
                const existingDoc = findVehicleDocument(doc.docType);
                return (
                  <div key={doc.docType} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{doc.title}</h4>
                        {doc.required && <Badge variant="outline" className="text-xs mt-1">Required</Badge>}
                      </div>
                      {existingDoc && getDocumentStatusBadge(existingDoc.verification_status)}
                    </div>
                    {existingDoc ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">
                            Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
                            {existingDoc.expiry_date && ` | Expires: ${new Date(existingDoc.expiry_date).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const normalizedPath = normalizeFilePath(existingDoc.file_path);
                              if (normalizedPath) {
                                window.open(normalizedPath, "_blank");
                              } else {
                                toast({
                                  title: "Error",
                                  description: "Document file path is missing or invalid",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                          <ObjectUploader
                            onGetUploadParameters={getUploadURL}
                            onComplete={(result) => handleVehicleDocumentUpload(doc.docType, doc.title, result)}
                            allowedFileTypes={["application/pdf", "image/*"]}
                            maxFileSize={10485760}
                            buttonVariant="outline"
                            buttonSize="sm"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Reupload
                          </ObjectUploader>
                        </div>
                      </div>
                    ) : (
                      <ObjectUploader
                        onGetUploadParameters={getUploadURL}
                        onComplete={(result) => handleVehicleDocumentUpload(doc.docType, doc.title, result)}
                        allowedFileTypes={["application/pdf", "image/*"]}
                        maxFileSize={10485760}
                        buttonVariant="default"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload {doc.title}
                      </ObjectUploader>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setComplianceDialogOpen(false);
                setSelectedVehicleForCompliance(null);
              }}
              type="button"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
