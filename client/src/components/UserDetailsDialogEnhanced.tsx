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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, User, FileText, Truck, Building2, ShieldCheck } from "lucide-react";

interface UserDetailsDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserDetails {
  profile: any;
  customer?: any;
  driver?: any;
  supplier?: any;
  admin?: any;
}

export function UserDetailsDialogEnhanced({ userId, open, onOpenChange }: UserDetailsDialogProps) {
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
        // Profile fields
        full_name: userDetails.profile.full_name,
        phone: userDetails.profile.phone || "",
        phone_country_code: userDetails.profile.phone_country_code || "+27",
        role: userDetails.profile.role, // CRITICAL: Include role for backend branching
        address_street: userDetails.profile.address_street || "",
        address_city: userDetails.profile.address_city || "",
        address_province: userDetails.profile.address_province || "",
        address_postal_code: userDetails.profile.address_postal_code || "",
        approval_status: userDetails.profile.approval_status,
        is_active: userDetails.profile.is_active,
        notes: userDetails.profile.notes || "",
        // Role-specific fields
        ...(userDetails.customer && {
          za_id_number: userDetails.customer.za_id_number || "",
          dob: userDetails.customer.dob || "",
          company_name: userDetails.customer.company_name || "",
          trading_as: userDetails.customer.trading_as || "",
          vat_number: userDetails.customer.vat_number || "",
          sars_tax_number: userDetails.customer.sars_tax_number || "",
          billing_address_street: userDetails.customer.billing_address_street || "",
          billing_address_city: userDetails.customer.billing_address_city || "",
          risk_tier: userDetails.customer.risk_tier || "low",
          verification_level: userDetails.customer.verification_level || "none",
        }),
        ...(userDetails.driver && {
          za_id_number: userDetails.driver.za_id_number || "",
          passport_number: userDetails.driver.passport_number || "",
          dob: userDetails.driver.dob || "",
          drivers_license_number: userDetails.driver.drivers_license_number || "",
          prdp_number: userDetails.driver.prdp_number || "",
          bank_account_name: userDetails.driver.bank_account_name || "",
          bank_name: userDetails.driver.bank_name || "",
          account_number: userDetails.driver.account_number || "",
          branch_code: userDetails.driver.branch_code || "",
          next_of_kin_name: userDetails.driver.next_of_kin_name || "",
          next_of_kin_phone: userDetails.driver.next_of_kin_phone || "",
        }),
        ...(userDetails.supplier && {
          registered_name: userDetails.supplier.registered_name || "",
          trading_as: userDetails.supplier.trading_as || "",
          vat_number: userDetails.supplier.vat_number || "",
          bbbee_level: userDetails.supplier.bbbee_level || "",
          dmre_license_number: userDetails.supplier.dmre_license_number || "",
          primary_contact_name: userDetails.supplier.primary_contact_name || "",
          primary_contact_phone: userDetails.supplier.primary_contact_phone || "",
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-user-details">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{userDetails.profile.full_name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="capitalize">{userDetails.profile.role}</Badge>
                <Badge variant={userDetails.profile.is_active ? "default" : "secondary"}>
                  {userDetails.profile.is_active ? "Active" : "Inactive"}
                </Badge>
                <Badge variant={
                  userDetails.profile.approval_status === "approved" ? "default" :
                  userDetails.profile.approval_status === "pending" ? "secondary" :
                  "destructive"
                } className="capitalize">
                  {userDetails.profile.approval_status}
                </Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="profile" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Details
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              Activity
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-4 mt-0">
              <div className="grid gap-4">
                <div>
                  <Label>Full Name</Label>
                  {isEditing ? (
                    <Input
                      value={formData.full_name || ""}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.profile.full_name}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Country Code</Label>
                    {isEditing ? (
                      <Input
                        value={formData.phone_country_code || ""}
                        onChange={(e) => setFormData({ ...formData, phone_country_code: e.target.value })}
                      />
                    ) : (
                      <p className="text-sm mt-1">{userDetails.profile.phone_country_code || "+27"}</p>
                    )}
                  </div>
                  <div>
                    <Label>Phone</Label>
                    {isEditing ? (
                      <Input
                        value={formData.phone || ""}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    ) : (
                      <p className="text-sm mt-1">{userDetails.profile.phone || "N/A"}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Address</Label>
                  {isEditing ? (
                    <div className="space-y-2 mt-1">
                      <Input
                        placeholder="Street"
                        value={formData.address_street || ""}
                        onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="City"
                          value={formData.address_city || ""}
                          onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                        />
                        <Input
                          placeholder="Province"
                          value={formData.address_province || ""}
                          onChange={(e) => setFormData({ ...formData, address_province: e.target.value })}
                        />
                      </div>
                      <Input
                        placeholder="Postal Code"
                        value={formData.address_postal_code || ""}
                        onChange={(e) => setFormData({ ...formData, address_postal_code: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="text-sm mt-1 text-muted-foreground">
                      {userDetails.profile.address_street ? (
                        <>
                          {userDetails.profile.address_street}<br />
                          {userDetails.profile.address_city}, {userDetails.profile.address_province}<br />
                          {userDetails.profile.address_postal_code}
                        </>
                      ) : "No address provided"}
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div>
                    <Label>Admin Notes</Label>
                    <Textarea
                      value={formData.notes || ""}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Internal notes about this user..."
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Details Tab - Role Specific */}
            <TabsContent value="details" className="space-y-4 mt-0">
              {userDetails.customer && (
                <CustomerDetails customer={userDetails.customer} formData={formData} setFormData={setFormData} isEditing={isEditing} />
              )}
              {userDetails.driver && (
                <DriverDetails driver={userDetails.driver} formData={formData} setFormData={setFormData} isEditing={isEditing} />
              )}
              {userDetails.supplier && (
                <SupplierDetails supplier={userDetails.supplier} formData={formData} setFormData={setFormData} isEditing={isEditing} />
              )}
            </TabsContent>

            {/* Documents Tab - Placeholder */}
            <TabsContent value="documents" className="mt-0">
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Document management coming soon</p>
              </div>
            </TabsContent>

            {/* Activity Tab - Placeholder */}
            <TabsContent value="activity" className="mt-0">
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Activity history coming soon</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
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

// Customer Details Component
function CustomerDetails({ customer, formData, setFormData, isEditing }: any) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground">Customer Information</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>SA ID Number</Label>
          {isEditing ? (
            <Input
              value={formData.za_id_number || ""}
              onChange={(e) => setFormData({ ...formData, za_id_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{customer.za_id_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Date of Birth</Label>
          {isEditing ? (
            <Input
              type="date"
              value={formData.dob || ""}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{customer.dob ? new Date(customer.dob).toLocaleDateString() : "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Company Name</Label>
          {isEditing ? (
            <Input
              value={formData.company_name || ""}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{customer.company_name || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Trading As</Label>
          {isEditing ? (
            <Input
              value={formData.trading_as || ""}
              onChange={(e) => setFormData({ ...formData, trading_as: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{customer.trading_as || "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>VAT Number</Label>
          {isEditing ? (
            <Input
              value={formData.vat_number || ""}
              onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{customer.vat_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>SARS Tax Number</Label>
          {isEditing ? (
            <Input
              value={formData.sars_tax_number || ""}
              onChange={(e) => setFormData({ ...formData, sars_tax_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{customer.sars_tax_number || "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Risk Tier</Label>
          {isEditing ? (
            <Select
              value={formData.risk_tier}
              onValueChange={(value) => setFormData({ ...formData, risk_tier: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm mt-1 capitalize">{customer.risk_tier || "low"}</p>
          )}
        </div>
        <div>
          <Label>Verification Level</Label>
          {isEditing ? (
            <Select
              value={formData.verification_level}
              onValueChange={(value) => setFormData({ ...formData, verification_level: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="enhanced">Enhanced</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm mt-1 capitalize">{customer.verification_level || "none"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Driver Details Component
function DriverDetails({ driver, formData, setFormData, isEditing }: any) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground">Driver Information</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>SA ID / Passport</Label>
          {isEditing ? (
            <Input
              value={formData.za_id_number || formData.passport_number || ""}
              onChange={(e) => setFormData({ ...formData, za_id_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.za_id_number || driver.passport_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Driver's License</Label>
          {isEditing ? (
            <Input
              value={formData.drivers_license_number || ""}
              onChange={(e) => setFormData({ ...formData, drivers_license_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.drivers_license_number || "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>PRDP Number</Label>
          {isEditing ? (
            <Input
              value={formData.prdp_number || ""}
              onChange={(e) => setFormData({ ...formData, prdp_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.prdp_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Availability</Label>
          <p className="text-sm mt-1 capitalize">{driver.availability_status || "offline"}</p>
        </div>
      </div>

      <h4 className="font-semibold text-sm text-muted-foreground pt-2">Banking Information</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Account Holder</Label>
          {isEditing ? (
            <Input
              value={formData.bank_account_name || ""}
              onChange={(e) => setFormData({ ...formData, bank_account_name: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.bank_account_name || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Bank Name</Label>
          {isEditing ? (
            <Input
              value={formData.bank_name || ""}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.bank_name || "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Account Number</Label>
          {isEditing ? (
            <Input
              value={formData.account_number || ""}
              onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.account_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Branch Code</Label>
          {isEditing ? (
            <Input
              value={formData.branch_code || ""}
              onChange={(e) => setFormData({ ...formData, branch_code: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.branch_code || "N/A"}</p>
          )}
        </div>
      </div>

      <h4 className="font-semibold text-sm text-muted-foreground pt-2">Emergency Contact</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Next of Kin Name</Label>
          {isEditing ? (
            <Input
              value={formData.next_of_kin_name || ""}
              onChange={(e) => setFormData({ ...formData, next_of_kin_name: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.next_of_kin_name || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Next of Kin Phone</Label>
          {isEditing ? (
            <Input
              value={formData.next_of_kin_phone || ""}
              onChange={(e) => setFormData({ ...formData, next_of_kin_phone: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{driver.next_of_kin_phone || "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <Label>Rating</Label>
          <p className="text-sm mt-1">{driver.rating ? `${driver.rating.toFixed(1)} ⭐` : "No ratings yet"}</p>
        </div>
        <div>
          <Label>Completed Trips</Label>
          <p className="text-sm mt-1">{driver.completed_trips || 0}</p>
        </div>
      </div>
    </div>
  );
}

// Supplier Details Component
function SupplierDetails({ supplier, formData, setFormData, isEditing }: any) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground">Supplier Information</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Registered Name</Label>
          {isEditing ? (
            <Input
              value={formData.registered_name || ""}
              onChange={(e) => setFormData({ ...formData, registered_name: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{supplier.registered_name || supplier.name}</p>
          )}
        </div>
        <div>
          <Label>Trading As</Label>
          {isEditing ? (
            <Input
              value={formData.trading_as || ""}
              onChange={(e) => setFormData({ ...formData, trading_as: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{supplier.trading_as || "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>VAT Number</Label>
          {isEditing ? (
            <Input
              value={formData.vat_number || ""}
              onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{supplier.vat_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>B-BBEE Level</Label>
          {isEditing ? (
            <Input
              value={formData.bbbee_level || ""}
              onChange={(e) => setFormData({ ...formData, bbbee_level: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{supplier.bbbee_level || "N/A"}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>DMRE License Number</Label>
          {isEditing ? (
            <Input
              value={formData.dmre_license_number || ""}
              onChange={(e) => setFormData({ ...formData, dmre_license_number: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{supplier.dmre_license_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>KYB Status</Label>
          <p className="text-sm mt-1 capitalize">{supplier.kyb_status || "pending"}</p>
        </div>
      </div>

      <h4 className="font-semibold text-sm text-muted-foreground pt-2">Primary Contact</h4>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Name</Label>
          {isEditing ? (
            <Input
              value={formData.primary_contact_name || ""}
              onChange={(e) => setFormData({ ...formData, primary_contact_name: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{supplier.primary_contact_name || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Phone</Label>
          {isEditing ? (
            <Input
              value={formData.primary_contact_phone || ""}
              onChange={(e) => setFormData({ ...formData, primary_contact_phone: e.target.value })}
            />
          ) : (
            <p className="text-sm mt-1">{supplier.primary_contact_phone || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>Email</Label>
          <p className="text-sm mt-1">{supplier.primary_contact_email || "N/A"}</p>
        </div>
      </div>
    </div>
  );
}
