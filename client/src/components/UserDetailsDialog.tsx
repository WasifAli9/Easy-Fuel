import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface UserDetailsDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserDetails {
  profile: {
    id: string;
    full_name: string;
    phone: string | null;
    phone_country_code: string | null;
    role: string;
    profile_photo_url: string | null;
    approval_status: string;
    approval_reason: string | null;
    is_active: boolean;
    notes: string | null;
    address_street: string | null;
    address_city: string | null;
    address_province: string | null;
    address_postal_code: string | null;
    address_country: string | null;
  };
  customer?: {
    za_id_number: string | null;
    dob: string | null;
    company_name: string | null;
    trading_as: string | null;
    registration_number: string | null;
    vat_number: string | null;
    sars_tax_number: string | null;
    billing_address_street: string | null;
    billing_address_city: string | null;
    billing_address_province: string | null;
    billing_address_postal_code: string | null;
    risk_tier: string | null;
    verification_level: string | null;
  };
  driver?: {
    kyc_status: string;
    za_id_number: string | null;
    passport_number: string | null;
    dob: string | null;
    gender: string | null;
    drivers_license_number: string | null;
    prdp_number: string | null;
    sars_tax_number: string | null;
    bank_account_name: string | null;
    bank_name: string | null;
    account_number: string | null;
    branch_code: string | null;
    next_of_kin_name: string | null;
    next_of_kin_phone: string | null;
    availability_status: string | null;
    rating: number | null;
    completed_trips: number | null;
  };
  supplier?: {
    registered_name: string;
    trading_as: string | null;
    name: string;
    kyb_status: string;
    registration_number: string | null;
    vat_number: string | null;
    sars_tax_number: string | null;
    bbbee_level: string | null;
    coid_number: string | null;
    dmre_license_number: string | null;
    primary_contact_name: string | null;
    primary_contact_phone: string | null;
    primary_contact_email: string | null;
  };
}

export function UserDetailsDialog({ userId, open, onOpenChange }: UserDetailsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});

  // Fetch user details
  const { data: userDetails, isLoading } = useQuery<UserDetails>({
    queryKey: ["/api/admin/users", userId],
    enabled: !!userId && open,
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      toast({
        title: "Success",
        description: "User details updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateUserMutation.mutate(formData);
  };

  const handleEdit = () => {
    if (userDetails) {
      setFormData({
        full_name: userDetails.profile.full_name,
        phone: userDetails.profile.phone || "",
        role: userDetails.profile.role,
        ...(userDetails.customer && {
          company_name: userDetails.customer.company_name || "",
          vat_number: userDetails.customer.vat_number || "",
        }),
        ...(userDetails.driver && {
          vehicle_registration: userDetails.driver.vehicle_registration || "",
          vehicle_capacity_litres: userDetails.driver.vehicle_capacity_litres || "",
          driver_company_name: userDetails.driver.company_name || "",
        }),
        ...(userDetails.supplier && {
          supplier_name: userDetails.supplier.name || "",
          cipc_number: userDetails.supplier.cipc_number || "",
        }),
      });
      setIsEditing(true);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!userDetails) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-user-details">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>
            {isEditing ? "Edit user information" : "View and manage user account"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Profile Information */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Profile Information</h3>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="full_name">Full Name</Label>
                {isEditing ? (
                  <Input
                    id="full_name"
                    value={formData.full_name || ""}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    data-testid="input-full-name"
                  />
                ) : (
                  <p className="text-sm mt-1">{userDetails.profile.full_name}</p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                {isEditing ? (
                  <Input
                    id="phone"
                    value={formData.phone || ""}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    data-testid="input-phone"
                  />
                ) : (
                  <p className="text-sm mt-1">{userDetails.profile.phone || "N/A"}</p>
                )}
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                {isEditing ? (
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-1 capitalize">{userDetails.profile.role}</p>
                )}
              </div>
            </div>
          </div>

          {/* Customer Details */}
          {userDetails.customer && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-sm text-muted-foreground">Customer Details</h3>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="company_name">Company Name</Label>
                  {isEditing ? (
                    <Input
                      id="company_name"
                      value={formData.company_name || ""}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.customer.company_name || "N/A"}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="vat_number">VAT Number</Label>
                  {isEditing ? (
                    <Input
                      id="vat_number"
                      value={formData.vat_number || ""}
                      onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.customer.vat_number || "N/A"}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Driver Details */}
          {userDetails.driver && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-sm text-muted-foreground">Driver Details</h3>
              <div className="grid gap-4">
                <div>
                  <Label>KYC Status</Label>
                  <p className="text-sm mt-1 capitalize">{userDetails.driver.kyc_status}</p>
                </div>
                <div>
                  <Label htmlFor="vehicle_registration">Vehicle Registration</Label>
                  {isEditing ? (
                    <Input
                      id="vehicle_registration"
                      value={formData.vehicle_registration || ""}
                      onChange={(e) => setFormData({ ...formData, vehicle_registration: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.driver.vehicle_registration || "N/A"}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="vehicle_capacity">Vehicle Capacity (Litres)</Label>
                  {isEditing ? (
                    <Input
                      id="vehicle_capacity"
                      type="number"
                      value={formData.vehicle_capacity_litres || ""}
                      onChange={(e) => setFormData({ ...formData, vehicle_capacity_litres: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.driver.vehicle_capacity_litres || "N/A"}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Supplier Details */}
          {userDetails.supplier && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-sm text-muted-foreground">Supplier Details</h3>
              <div className="grid gap-4">
                <div>
                  <Label>KYB Status</Label>
                  <p className="text-sm mt-1 capitalize">{userDetails.supplier.kyb_status}</p>
                </div>
                <div>
                  <Label htmlFor="supplier_name">Company Name</Label>
                  {isEditing ? (
                    <Input
                      id="supplier_name"
                      value={formData.supplier_name || ""}
                      onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.supplier.name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="cipc_number">CIPC Number</Label>
                  {isEditing ? (
                    <Input
                      id="cipc_number"
                      value={formData.cipc_number || ""}
                      onChange={(e) => setFormData({ ...formData, cipc_number: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.supplier.cipc_number || "N/A"}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={updateUserMutation.isPending}
                data-testid="button-save"
              >
                {updateUserMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={handleEdit} data-testid="button-edit">
              Edit Details
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
