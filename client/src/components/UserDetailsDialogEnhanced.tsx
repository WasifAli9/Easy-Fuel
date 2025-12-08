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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, User, FileText, Truck, Building2, ShieldCheck, Upload, Camera, Eye, CheckCircle2, XCircle } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";
import type { UploadResult } from "@uppy/core";

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
  vehicles?: any[];
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
        email: userDetails.profile.email || "",
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
          availability_status: userDetails.driver.availability_status || "offline",
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
          <DialogHeader>
            <DialogTitle>Loading User Details</DialogTitle>
            <DialogDescription>Please wait while we fetch the user information.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!userDetails) return null;

  const handleProfilePictureUpload = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (!result.successful || result.successful.length === 0) return;
    
    const uploadedFile = result.successful[0];
    if (!uploadedFile?.uploadURL) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/users/${userId}/profile-picture`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ profilePictureURL: uploadedFile.uploadURL }),
      });

      if (!response.ok) throw new Error("Failed to set profile picture");

      const { objectPath } = await response.json();
      
      // Update the profile with the new picture path
      await apiRequest("PATCH", `/api/admin/users/${userId}`, { 
        profile_photo_url: objectPath 
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      
      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile picture",
        variant: "destructive",
      });
    }
  };

  const getUploadURL = async () => {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/objects/upload", {
      method: "POST",
      headers,
    });
    const { uploadURL } = await response.json();
    return { method: "PUT" as const, url: uploadURL };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-user-details">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage 
                  src={
                    userDetails.profile.profile_photo_url 
                      ? (() => {
                          const photoUrl = userDetails.profile.profile_photo_url;
                          // Handle Supabase Storage format: bucket/path (e.g., "private-objects/uploads/uuid")
                          if (photoUrl.includes('/') && !photoUrl.startsWith('/') && !photoUrl.startsWith('http')) {
                            // Check if it's a private bucket (private-objects)
                            if (photoUrl.startsWith('private-objects/')) {
                              // Use our server endpoint for private objects (handles authentication)
                              const pathOnly = photoUrl.replace('private-objects/', '');
                              return `/objects/${pathOnly}`;
                            } else {
                              // For public buckets, use Supabase public URL
                              return `${import.meta.env.VITE_SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co'}/storage/v1/object/public/${photoUrl}`;
                            }
                          }
                          // Handle /objects/ path format
                          else if (photoUrl.startsWith('/objects/')) {
                            return photoUrl;
                          }
                          // Handle full URLs
                          else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
                            return photoUrl;
                          }
                          // Default: assume it's a relative path
                          else {
                            return `/objects/${photoUrl}`;
                          }
                        })()
                      : undefined
                  } 
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {userDetails.profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={5242880}
                  allowedFileTypes={["image/*"]}
                  onGetUploadParameters={getUploadURL}
                  onComplete={handleProfilePictureUpload}
                  buttonVariant="outline"
                  buttonSize="icon"
                  buttonClassName="h-7 w-7 rounded-full"
                >
                  <Camera className="h-3.5 w-3.5" />
                </ObjectUploader>
              </div>
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">{userDetails.profile.full_name}</DialogTitle>
              <DialogDescription>
                User details and management
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2">
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
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="profile" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className={`grid w-full ${userDetails.driver ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <TabsTrigger value="profile" className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Details
            </TabsTrigger>
            {userDetails.driver && (
              <TabsTrigger value="vehicles" className="flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" />
                Vehicles
              </TabsTrigger>
            )}
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

                <div>
                  <Label>Email Address</Label>
                  {isEditing ? (
                    <Input
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      data-testid="input-email"
                    />
                  ) : (
                    <p className="text-sm mt-1">{userDetails.profile.email || "N/A"}</p>
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
                        value={formData.address_street || formData.address_line_1 || ""}
                        onChange={(e) => setFormData({ ...formData, address_street: e.target.value, address_line_1: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="City"
                          value={formData.address_city || formData.city || ""}
                          onChange={(e) => setFormData({ ...formData, address_city: e.target.value, city: e.target.value })}
                        />
                        <Input
                          placeholder="Province"
                          value={formData.address_province || formData.province || ""}
                          onChange={(e) => setFormData({ ...formData, address_province: e.target.value, province: e.target.value })}
                        />
                      </div>
                      <Input
                        placeholder="Postal Code"
                        value={formData.address_postal_code || formData.postal_code || ""}
                        onChange={(e) => setFormData({ ...formData, address_postal_code: e.target.value, postal_code: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="text-sm mt-1 text-muted-foreground">
                      {(() => {
                        // For drivers, check driver table first, then profile
                        if (userDetails.driver) {
                          const address = userDetails.driver.address_line_1 || userDetails.profile.address_street;
                          const city = userDetails.driver.city || userDetails.profile.address_city;
                          const province = userDetails.driver.province || userDetails.profile.address_province;
                          const postalCode = userDetails.driver.postal_code || userDetails.profile.address_postal_code;
                          
                          if (address || city) {
                            return (
                              <>
                                {address && <>{address}<br /></>}
                                {city && province ? `${city}, ${province}` : city || province}
                                {postalCode && <><br />{postalCode}</>}
                              </>
                            );
                          }
                        } else if (userDetails.profile.address_street) {
                          return (
                            <>
                              {userDetails.profile.address_street}<br />
                              {userDetails.profile.address_city}, {userDetails.profile.address_province}<br />
                              {userDetails.profile.address_postal_code}
                            </>
                          );
                        }
                        return "No address provided";
                      })()}
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

            {/* Vehicles Tab - Driver Only */}
            {userDetails.driver && (
              <TabsContent value="vehicles" className="mt-0">
                <VehiclesTab driverId={userDetails.driver.id} vehicles={userDetails.vehicles || []} />
              </TabsContent>
            )}

            {/* Documents Tab */}
            <TabsContent value="documents" className="mt-0">
              <DocumentsTab userId={userId!} userRole={userDetails.profile.role} />
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
  if (!driver) return <p className="text-sm text-muted-foreground">No driver information available</p>;

  return (
    <div className="space-y-6">
      {/* Identity & Legal Information */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-4">Identity & Legal Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Driver Type</Label>
            <p className="text-sm mt-1 capitalize">{driver.driver_type || "N/A"}</p>
          </div>
          <div>
            <Label>ID Type</Label>
            <p className="text-sm mt-1">{driver.id_type || "N/A"}</p>
          </div>
          <div>
            <Label>ID Number</Label>
            <p className="text-sm mt-1">{driver.id_number || "N/A"}</p>
          </div>
          <div>
            <Label>ID Issue Country</Label>
            <p className="text-sm mt-1">{driver.id_issue_country || "N/A"}</p>
          </div>
        </div>
      </div>

      {/* Driver's License */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-4">Driver's License</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>License Number</Label>
            <p className="text-sm mt-1">{driver.license_number || "N/A"}</p>
          </div>
          <div>
            <Label>License Code</Label>
            <p className="text-sm mt-1">{driver.license_code || "N/A"}</p>
          </div>
          <div>
            <Label>Issue Date</Label>
            <p className="text-sm mt-1">{driver.license_issue_date ? new Date(driver.license_issue_date).toLocaleDateString() : "N/A"}</p>
          </div>
          <div>
            <Label>Expiry Date</Label>
            <p className="text-sm mt-1">{driver.license_expiry_date ? new Date(driver.license_expiry_date).toLocaleDateString() : "N/A"}</p>
          </div>
        </div>
      </div>

      {/* Professional Driving Permit (PrDP) */}
      {driver.prdp_required && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">Professional Driving Permit (PrDP)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>PrDP Number</Label>
              <p className="text-sm mt-1">{driver.prdp_number || "N/A"}</p>
            </div>
            <div>
              <Label>Category</Label>
              <p className="text-sm mt-1">{driver.prdp_category || "N/A"}</p>
            </div>
            <div>
              <Label>Issue Date</Label>
              <p className="text-sm mt-1">{driver.prdp_issue_date ? new Date(driver.prdp_issue_date).toLocaleDateString() : "N/A"}</p>
            </div>
            <div>
              <Label>Expiry Date</Label>
              <p className="text-sm mt-1">{driver.prdp_expiry_date ? new Date(driver.prdp_expiry_date).toLocaleDateString() : "N/A"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Dangerous Goods Training */}
      {driver.dg_training_required && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">Dangerous Goods Training</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Training Provider</Label>
              <p className="text-sm mt-1">{driver.dg_training_provider || "N/A"}</p>
            </div>
            <div>
              <Label>Certificate Number</Label>
              <p className="text-sm mt-1">{driver.dg_training_certificate_number || "N/A"}</p>
            </div>
            <div>
              <Label>Issue Date</Label>
              <p className="text-sm mt-1">{driver.dg_training_issue_date ? new Date(driver.dg_training_issue_date).toLocaleDateString() : "N/A"}</p>
            </div>
            <div>
              <Label>Expiry Date</Label>
              <p className="text-sm mt-1">{driver.dg_training_expiry_date ? new Date(driver.dg_training_expiry_date).toLocaleDateString() : "N/A"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Criminal Check */}
      {driver.criminal_check_done && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">Criminal Check</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Reference Number</Label>
              <p className="text-sm mt-1">{driver.criminal_check_reference || "N/A"}</p>
            </div>
            <div>
              <Label>Check Date</Label>
              <p className="text-sm mt-1">{driver.criminal_check_date ? new Date(driver.criminal_check_date).toLocaleDateString() : "N/A"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Company Information */}
      {driver.is_company_driver && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">Company Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company ID</Label>
              <p className="text-sm mt-1">{driver.company_id || "N/A"}</p>
            </div>
            <div>
              <Label>Role in Company</Label>
              <p className="text-sm mt-1">{driver.role_in_company || "N/A"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Banking Information */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-4">Banking Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Account Holder</Label>
            <p className="text-sm mt-1">{driver.bank_account_holder || driver.bank_account_name || "N/A"}</p>
          </div>
          <div>
            <Label>Bank Name</Label>
            <p className="text-sm mt-1">{driver.bank_name || "N/A"}</p>
          </div>
          <div>
            <Label>Account Number</Label>
            <p className="text-sm mt-1">{driver.account_number || "N/A"}</p>
          </div>
          <div>
            <Label>Branch Code</Label>
            <p className="text-sm mt-1">{driver.branch_code || "N/A"}</p>
          </div>
          <div>
            <Label>Account Type</Label>
            <p className="text-sm mt-1 capitalize">{driver.account_type || "N/A"}</p>
          </div>
        </div>
      </div>

      {/* Compliance Status */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-4">Compliance Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Status</Label>
            <p className="text-sm mt-1 capitalize">{driver.status || "N/A"}</p>
          </div>
          <div>
            <Label>Compliance Status</Label>
            <p className="text-sm mt-1 capitalize">{driver.compliance_status || "N/A"}</p>
          </div>
          {driver.compliance_review_date && (
            <div>
              <Label>Review Date</Label>
              <p className="text-sm mt-1">{new Date(driver.compliance_review_date).toLocaleDateString()}</p>
            </div>
          )}
          {driver.compliance_rejection_reason && (
            <div className="col-span-2">
              <Label>Rejection Reason</Label>
              <p className="text-sm mt-1 text-destructive">{driver.compliance_rejection_reason}</p>
            </div>
          )}
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

// Vehicles Tab Component - Driver Only
function VehiclesTab({ driverId, vehicles }: { driverId: string; vehicles: any[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground">Driver Vehicles</h3>
        <Badge variant="secondary" data-testid="badge-vehicle-count">
          {vehicles.length} {vehicles.length === 1 ? 'Vehicle' : 'Vehicles'}
        </Badge>
      </div>

      {vehicles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No vehicles registered</p>
          <p className="text-xs mt-1">Driver has not added any vehicles yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="p-4 border rounded-md space-y-3"
              data-testid={`card-vehicle-${vehicle.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">
                    {vehicle.make && vehicle.model ? `${vehicle.make} ${vehicle.model}` : 'Vehicle'}
                    {vehicle.year && ` (${vehicle.year})`}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Registration: {vehicle.registration_number || 'N/A'}
                  </p>
                </div>
                <Badge variant="outline" data-testid={`badge-capacity-${vehicle.id}`}>
                  {vehicle.capacity_litres ? `${vehicle.capacity_litres}L` : 'N/A'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Fuel Types</Label>
                  <p className="mt-1">
                    {vehicle.fuel_types && vehicle.fuel_types.length > 0
                      ? vehicle.fuel_types.join(', ')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tracker</Label>
                  <p className="mt-1">
                    {vehicle.tracker_installed ? `Yes - ${vehicle.tracker_provider || 'Unknown'}` : 'No'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm pt-2 border-t">
                <div>
                  <Label className="text-xs text-muted-foreground">License Disk</Label>
                  <p className="text-xs mt-1">
                    {vehicle.license_disk_expiry
                      ? new Date(vehicle.license_disk_expiry).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Roadworthy</Label>
                  <p className="text-xs mt-1">
                    {vehicle.roadworthy_expiry
                      ? new Date(vehicle.roadworthy_expiry).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Insurance</Label>
                  <p className="text-xs mt-1">
                    {vehicle.insurance_expiry
                      ? new Date(vehicle.insurance_expiry).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({ userId, userRole }: { userId: string; userRole: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch documents
  const { data: documents, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users", userId, "documents"],
    enabled: !!userId,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/users/${userId}/documents`);
      // Ensure we always return an array
      return Array.isArray(response) ? response : [];
    },
  });

  // Update document status mutation
  const updateDocumentStatusMutation = useMutation({
    mutationFn: async ({ documentId, status, rejectionReason }: { documentId: string; status: string; rejectionReason?: string }) => {
      return apiRequest("PATCH", `/api/admin/documents/${documentId}/status`, {
        status,
        rejectionReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      toast({
        title: "Success",
        description: "Document status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update document status",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (documentId: string) => {
    updateDocumentStatusMutation.mutate({ documentId, status: "approved" });
  };

  const handleReject = (documentId: string) => {
    const reason = prompt("Please provide a reason for rejection:");
    if (reason) {
      updateDocumentStatusMutation.mutate({ documentId, status: "rejected", rejectionReason: reason });
    }
  };

  const getDocumentTypeLabel = (docType: string) => {
    const labels: Record<string, string> = {
      za_id: "SA ID Document",
      passport: "Passport",
      drivers_license: "Driver's License",
      prdp: "PRDP Certificate",
      prdp_dangerous_goods: "Professional Driving Permit (PrDP-D)",
      dg_training_certificate: "Dangerous Goods Training Certificate",
      medical_fitness_certificate: "Medical Fitness Certificate",
      vehicle_registration: "Vehicle Registration",
      roadworthy_certificate: "Roadworthy Certificate",
      dg_vehicle_permit: "Dangerous Goods Vehicle Permit",
      insurance_certificate: "Insurance Certificate",
      loa: "Letter of Authority",
      cipc_certificate: "CIPC Certificate",
      cipc_document: "CIPC Document",
      vat_certificate: "VAT Certificate",
      tax_clearance: "Tax Clearance",
      tax_clearance_certificate: "Tax Clearance Certificate",
      wholesale_fuel_license: "Wholesale Fuel License",
      depot_site_license: "Depot/Site License",
      additional_fuel_permit: "Additional Fuel Trading Permit",
      environmental_authorization: "Environmental Authorization",
      fire_certificate: "Fire Department Certificate",
      sabs_fuel_quality_certificate: "SABS Fuel Quality Certificate",
      pump_calibration_certificate: "Pump/Meter Calibration Certificate",
      public_liability_insurance: "Public Liability Insurance",
      environmental_liability_insurance: "Environmental Liability Insurance",
      bbbee_certificate: "B-BBEE Certificate",
      dmre_license: "DMRE License",
      coid_certificate: "COID Certificate",
      bank_statement: "Bank Statement",
      proof_of_address: "Proof of Address",
      msds: "MSDS",
      safety_certificate: "Safety Certificate",
      other: "Other",
    };
    return labels[docType] || docType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Documents List */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Uploaded Documents</h4>
        {!documents || !Array.isArray(documents) || documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(Array.isArray(documents) ? documents : []).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 border rounded-lg hover-elevate"
                data-testid={`document-${doc.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{doc.title}</p>
                    <Badge variant="outline" className="text-xs">
                      {getDocumentTypeLabel(doc.doc_type)}
                    </Badge>
                    {(doc.document_status || doc.verification_status) && (
                      <Badge
                        variant={
                          (doc.document_status || doc.verification_status) === "approved"
                            ? "default"
                            : (doc.document_status || doc.verification_status) === "pending_review" || (doc.document_status || doc.verification_status) === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                        className="text-xs capitalize"
                      >
                        {doc.document_status || doc.verification_status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Uploaded: {new Date(doc.created_at).toLocaleDateString()} • {doc.mime_type || "Unknown type"}
                    {doc.expiry_date && ` • Expires: ${new Date(doc.expiry_date).toLocaleDateString()}`}
                  </p>
                  {doc.document_rejection_reason && (
                    <p className="text-xs text-destructive mt-1">
                      Rejection reason: {doc.document_rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Get the file URL - might be a Supabase storage path
                      let fileUrl = doc.file_path;
                      if (fileUrl && !fileUrl.startsWith('http') && !fileUrl.startsWith('/')) {
                        // It's a Supabase storage path (bucket/path format)
                        const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co';
                        fileUrl = `${supabaseUrl}/storage/v1/object/public/${fileUrl}`;
                      }
                      window.open(fileUrl, "_blank");
                    }}
                    data-testid={`button-view-${doc.id}`}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                  {(doc.document_status === "pending_review" || doc.verification_status === "pending" || !doc.document_status) && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleApprove(doc.id)}
                        disabled={updateDocumentStatusMutation.isPending}
                        data-testid={`button-approve-${doc.id}`}
                      >
                        {updateDocumentStatusMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleReject(doc.id)}
                        disabled={updateDocumentStatusMutation.isPending}
                        data-testid={`button-reject-${doc.id}`}
                      >
                        {updateDocumentStatusMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
