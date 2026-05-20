import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
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
import {
  Loader2,
  User,
  FileText,
  Truck,
  Building2,
  ShieldCheck,
  Upload,
  Camera,
  Eye,
  CheckCircle2,
  XCircle,
  Package,
  Bell,
  ClipboardList,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { documentObjectUrl, normalizeProfilePhotoUrl } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";
import type { UploadResult } from "@uppy/core";

interface UserDetailsDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open another user in this dialog (e.g. driver from fleet company view). */
  onNavigateToUser?: (userId: string) => void;
}

interface UserDetails {
  profile: any;
  customer?: any;
  driver?: any;
  supplier?: any;
  company?: any;
  admin?: any;
  vehicles?: any[];
  linkedDrivers?: Array<{
    driverId: string;
    profileId?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    membershipStatus?: string;
    appliedAt?: string;
    workIndependent?: boolean;
    isDisabledByCompany?: boolean;
    kycStatus?: string;
    complianceStatus?: string;
  }>;
  pendingApplications?: Array<{
    driverId: string;
    profileId?: string;
    fullName?: string;
    phone?: string;
    appliedAt?: string;
    complianceStatus?: string;
  }>;
}

type ActivityEntry = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  occurredAt: string;
};

function activityKindIcon(kind: string) {
  if (kind.startsWith("order_") || kind === "fleet_order") return Package;
  if (kind.includes("vehicle") || kind.includes("depot")) return Truck;
  if (kind.includes("document")) return FileText;
  if (kind.includes("fleet") || kind.includes("driver_application") || kind.includes("driver_approved"))
    return Building2;
  if (kind.startsWith("notification_")) return Bell;
  if (kind === "account_registered") return User;
  return ClipboardList;
}

function activityKindBadgeVariant(kind: string): "default" | "secondary" | "outline" | "destructive" {
  if (kind.includes("completed") || kind.includes("approved") || kind === "order_paid") return "default";
  if (kind.includes("rejected") || kind.includes("declined")) return "destructive";
  return "secondary";
}

function UserActivityTab({ activities, isLoading }: { activities: ActivityEntry[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No activity recorded yet</p>
        <p className="text-xs mt-2 max-w-sm mx-auto">
          Orders, vehicles, depot pickups, fleet events, and notifications will appear here as this user uses the
          platform.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        {activities.length} event{activities.length === 1 ? "" : "s"} · newest first
      </p>
      {activities.map((item) => {
        const Icon = activityKindIcon(item.kind);
        return (
          <div
            key={item.id}
            className="flex gap-3 rounded-lg border p-3 bg-card/50"
            data-testid={`activity-${item.id}`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-sm">{item.title}</p>
                <Badge variant={activityKindBadgeVariant(item.kind)} className="text-[10px] capitalize">
                  {item.kind.replace(/_/g, " ")}
                </Badge>
              </div>
              {item.detail ? (
                <p className="text-sm text-muted-foreground mt-1 break-words">{item.detail}</p>
              ) : null}
              <p className="text-xs text-muted-foreground mt-1.5">
                {formatDistanceToNow(new Date(item.occurredAt), { addSuffix: true })}
                <span className="mx-1">·</span>
                {new Date(item.occurredAt).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UserDetailsDialogEnhanced({
  userId,
  open,
  onOpenChange,
  onNavigateToUser,
}: UserDetailsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    setIsEditing(false);
  }, [userId]);

  // Fetch user details
  const {
    data: userDetails,
    isLoading,
    isError,
    error,
    refetch: refetchUserDetails,
  } = useQuery<UserDetails>({
    queryKey: ["/api/admin/users", userId],
    enabled: !!userId && open,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<{ activities: ActivityEntry[] }>({
    queryKey: ["/api/admin/users", userId, "activity"],
    enabled: !!userId && open,
  });

  // Listen for KYC/compliance approval to refresh user details
  useWebSocket((message) => {
    const payload = (message as any).payload || {};
    const messageUserId = payload.userId || payload.driverId;
    
    // Check if this message is for the current user
    const isForCurrentUser = messageUserId === userId;
    
    // Also check if message type matches and we have user details loaded
    const isRelevantMessage = message.type === "kyc_approved" || 
                              message.type === "compliance_approved" || 
                              message.type === "kyb_approved" || 
                              message.type === "kyc_rejected" ||
                              message.type === "compliance_rejected";
    
    if (isRelevantMessage && (isForCurrentUser || (userDetails && payload.type === userDetails.profile?.role))) {
      console.log("[UserDetailsDialog] KYC status changed, refreshing user details", {
        messageType: message.type,
        payload,
        userId,
        messageUserId,
        userRole: userDetails?.profile?.role,
        isForCurrentUser
      });
      // Invalidate queries first, then refetch
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      // Refetch user details after a short delay to ensure backend has updated
      setTimeout(() => {
        refetchUserDetails();
      }, 500);
    }
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

  if (isError || (!isLoading && !userDetails)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Could not load user</DialogTitle>
            <DialogDescription>
              {(error as Error)?.message || "The user record could not be loaded."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => refetchUserDetails()}>Retry</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!userDetails) return null;

  const profile = userDetails.profile || {};
  const safeProfile = {
    id: userId || "",
    full_name: profile.full_name ?? profile.fullName ?? "Unknown User",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    role: profile.role ?? profile.userRole ?? "customer",
    profile_photo_url: profile.profile_photo_url ?? profile.profilePhotoUrl ?? null,
    approval_status: profile.approval_status ?? profile.approvalStatus ?? "pending",
    is_active: profile.is_active ?? profile.isActive ?? false,
    phone_country_code: profile.phone_country_code ?? profile.phoneCountryCode ?? "+27",
    notes: profile.notes ?? "",
    address_street: profile.address_street ?? profile.addressStreet,
    address_city: profile.address_city ?? profile.addressCity,
    address_province: profile.address_province ?? profile.addressProvince,
    address_postal_code: profile.address_postal_code ?? profile.addressPostalCode,
  } as any;

  const isCompanyAccount = safeProfile.role === "company" || !!userDetails.company;
  const tabCount =
    4 + (userDetails.driver || isCompanyAccount ? 1 : 0) + (isCompanyAccount ? 1 : 0);

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
                  src={normalizeProfilePhotoUrl(safeProfile.profile_photo_url) || undefined}
                  onError={() => {
                    // Suppress image load errors
                  }} 
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {String(safeProfile.full_name || "U")
                    .split(" ")
                    .filter(Boolean)
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "U"}
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
              <DialogTitle className="text-xl">{safeProfile.full_name}</DialogTitle>
              <DialogDescription>
                User details and management
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="capitalize">{safeProfile.role}</Badge>
                <Badge variant={
                  // For drivers, if approved, they should be active
                  (userDetails.driver && safeProfile.approval_status === "approved") || safeProfile.is_active
                    ? "default" 
                    : "secondary"
                }>
                  {(userDetails.driver && safeProfile.approval_status === "approved") || safeProfile.is_active
                    ? "Active" 
                    : "Inactive"}
                </Badge>
                <Badge variant={
                  safeProfile.approval_status === "approved" ? "default" :
                  safeProfile.approval_status === "pending" ? "secondary" :
                  "destructive"
                } className="capitalize">
                  {safeProfile.approval_status}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="profile" className="flex-1 overflow-hidden flex flex-col">
          <TabsList
            className={`grid w-full ${
              tabCount >= 6
                ? "grid-cols-6"
                : tabCount === 5
                  ? "grid-cols-5"
                  : "grid-cols-4"
            }`}
          >
            <TabsTrigger value="profile" className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Details
            </TabsTrigger>
            {(userDetails.driver || isCompanyAccount) && (
              <TabsTrigger value="vehicles" className="flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" />
                {isCompanyAccount ? "Fleet vehicles" : "Vehicles"}
              </TabsTrigger>
            )}
            {isCompanyAccount && (
              <TabsTrigger value="drivers" className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Drivers
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
                    <p className="text-sm mt-1">{safeProfile.full_name}</p>
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
              {isCompanyAccount && userDetails.company && <CompanyDetails company={userDetails.company} />}
              {isCompanyAccount && !userDetails.company && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No fleet company record found for this account.</p>
                  <p className="text-sm mt-2">The profile role is company but the companies table has no row.</p>
                </div>
              )}
              {!userDetails.customer &&
                !userDetails.driver &&
                !userDetails.supplier &&
                !userDetails.company && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Role-specific profile not found.</p>
                  </div>
                )}
            </TabsContent>

            {(userDetails.driver || isCompanyAccount) && (
              <TabsContent value="vehicles" className="mt-0">
                <VehiclesTab
                  driverId={userDetails.driver?.id}
                  vehicles={userDetails.vehicles || []}
                  userId={userId!}
                  fleetCompanyName={userDetails.company?.name ?? userDetails.company?.companyName}
                />
              </TabsContent>
            )}

            {isCompanyAccount && (
              <TabsContent value="drivers" className="mt-0">
                <CompanyDriversTab
                  linkedDrivers={userDetails.linkedDrivers || []}
                  pendingApplications={userDetails.pendingApplications || []}
                  onViewDriver={(driverProfileId) => {
                    if (driverProfileId && onNavigateToUser) {
                      onNavigateToUser(driverProfileId);
                    }
                  }}
                />
              </TabsContent>
            )}

            {/* Documents Tab */}
            <TabsContent value="documents" className="mt-0">
              <DocumentsTab userId={userId!} userRole={userDetails.profile.role} />
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <UserActivityTab
                activities={activityData?.activities ?? []}
                isLoading={activityLoading}
              />
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
            <p className="text-sm mt-1 capitalize">{driver.driver_type || driver.driverType || "N/A"}</p>
          </div>
          <div>
            <Label>ID Type</Label>
            <p className="text-sm mt-1">{driver.id_type || driver.idType || "N/A"}</p>
          </div>
          <div>
            <Label>ID Number</Label>
            <p className="text-sm mt-1">{driver.id_number || driver.za_id_number || driver.zaIdNumber || driver.passport_number || driver.passportNumber || "N/A"}</p>
          </div>
          <div>
            <Label>ID Issue Country</Label>
            <p className="text-sm mt-1">{driver.id_issue_country || driver.idIssueCountry || driver.passport_country || driver.passportCountry || "South Africa"}</p>
          </div>
        </div>
      </div>

      {/* Driver's License */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-4">Driver's License</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>License Number</Label>
            <p className="text-sm mt-1">{driver.license_number || driver.drivers_license_number || driver.driversLicenseNumber || "N/A"}</p>
          </div>
          <div>
            <Label>License Code</Label>
            <p className="text-sm mt-1">{driver.license_code || driver.licenseCode || "N/A"}</p>
          </div>
          <div>
            <Label>Issue Date</Label>
            <p className="text-sm mt-1">{(driver.license_issue_date || driver.drivers_license_issue_date || driver.driversLicenseIssueDate) ? new Date(driver.license_issue_date || driver.drivers_license_issue_date || driver.driversLicenseIssueDate).toLocaleDateString() : "N/A"}</p>
          </div>
          <div>
            <Label>Expiry Date</Label>
            <p className="text-sm mt-1">{(driver.license_expiry_date || driver.drivers_license_expiry || driver.driversLicenseExpiry) ? new Date(driver.license_expiry_date || driver.drivers_license_expiry || driver.driversLicenseExpiry).toLocaleDateString() : "N/A"}</p>
          </div>
        </div>
      </div>

      {/* Professional Driving Permit (PrDP) */}
      {(driver.prdp_required || driver.prdpRequired) && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-4">Professional Driving Permit (PrDP)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>PrDP Number</Label>
              <p className="text-sm mt-1">{driver.prdp_number || driver.prdpNumber || "N/A"}</p>
            </div>
            <div>
              <Label>Category</Label>
              <p className="text-sm mt-1">{driver.prdp_category || driver.prdpCategory || "N/A"}</p>
            </div>
            <div>
              <Label>Issue Date</Label>
              <p className="text-sm mt-1">{(driver.prdp_issue_date || driver.prdpIssueDate) ? new Date(driver.prdp_issue_date || driver.prdpIssueDate).toLocaleDateString() : "N/A"}</p>
            </div>
            <div>
              <Label>Expiry Date</Label>
              <p className="text-sm mt-1">{(driver.prdp_expiry_date || driver.prdpExpiry) ? new Date(driver.prdp_expiry_date || driver.prdpExpiry).toLocaleDateString() : "N/A"}</p>
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
  if (!supplier) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Supplier profile not found. The supplier may need to complete their profile setup.</p>
      </div>
    );
  }

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
            <p className="text-sm mt-1">{supplier.registered_name || supplier.company_name || supplier.name || "N/A"}</p>
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
            <p className="text-sm mt-1">{supplier.dmre_license_number || supplier.wholesale_license_number || "N/A"}</p>
          )}
        </div>
        <div>
          <Label>KYB Status</Label>
          <p className="text-sm mt-1 capitalize">{supplier.kyb_status || supplier.compliance_status || "pending"}</p>
        </div>
      </div>

      {/* Compliance Fields */}
      {(supplier.company_name || supplier.registered_address || supplier.director_names) && (
        <>
          <h4 className="font-semibold text-sm text-muted-foreground pt-4">Company Details</h4>
          <div className="grid grid-cols-2 gap-4">
            {supplier.company_name && (
              <div>
                <Label>Company Name</Label>
                <p className="text-sm mt-1">{supplier.company_name}</p>
              </div>
            )}
            {supplier.registered_address && (
              <div>
                <Label>Registered Address</Label>
                <p className="text-sm mt-1">{supplier.registered_address}</p>
              </div>
            )}
            {supplier.director_names && Array.isArray(supplier.director_names) && supplier.director_names.length > 0 && (
              <div className="col-span-2">
                <Label>Directors</Label>
                <p className="text-sm mt-1">{supplier.director_names.join(", ")}</p>
              </div>
            )}
          </div>
        </>
      )}

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

function CompanyDetails({ company }: { company: any }) {
  const name = company.name ?? company.companyName;
  const contactEmail = company.contact_email ?? company.contactEmail;
  const contactPhone = company.contact_phone ?? company.contactPhone;
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground">Fleet company</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Company name</Label>
          <p className="text-sm mt-1">{name || "N/A"}</p>
        </div>
        <div>
          <Label>Status</Label>
          <p className="text-sm mt-1 capitalize">{company.status || "active"}</p>
        </div>
        <div>
          <Label>Contact email</Label>
          <p className="text-sm mt-1">{contactEmail || "N/A"}</p>
        </div>
        <div>
          <Label>Contact phone</Label>
          <p className="text-sm mt-1">{contactPhone || "N/A"}</p>
        </div>
      </div>
    </div>
  );
}

function membershipStatusBadge(status?: string) {
  const s = (status || "none").toLowerCase();
  if (s === "approved") return <Badge className="bg-green-600">Approved</Badge>;
  if (s === "pending") return <Badge variant="secondary">Pending</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function CompanyDriversTab({
  linkedDrivers,
  pendingApplications,
  onViewDriver,
}: {
  linkedDrivers: UserDetails["linkedDrivers"];
  pendingApplications: UserDetails["pendingApplications"];
  onViewDriver: (profileId: string) => void;
}) {
  return (
    <div className="space-y-6">
      {pendingApplications && pendingApplications.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-3">Pending applications</h3>
          <div className="space-y-2">
            {pendingApplications.map((app) => (
              <div key={app.driverId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="font-medium text-sm">{app.fullName || "Driver"}</p>
                  <p className="text-xs text-muted-foreground">
                    {app.phone || "—"}
                    {app.appliedAt ? ` · Applied ${new Date(app.appliedAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {membershipStatusBadge("pending")}
                  {app.profileId && (
                    <Button size="sm" variant="outline" onClick={() => onViewDriver(app.profileId!)}>
                      View driver
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-3">
          Drivers linked to this company ({linkedDrivers?.length ?? 0})
        </h3>
        {!linkedDrivers?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No drivers have applied or been approved for this company yet.
          </p>
        ) : (
          <div className="space-y-2">
            {linkedDrivers.map((d) => (
              <div
                key={d.driverId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <p className="font-medium text-sm">{d.fullName || "Driver"}</p>
                  <p className="text-xs text-muted-foreground">
                    {[d.email, d.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    KYC: {d.kycStatus || "—"} · Compliance: {d.complianceStatus || "—"}
                    {d.isDisabledByCompany ? " · Disabled by company" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {membershipStatusBadge(d.membershipStatus)}
                  {d.profileId && (
                    <Button size="sm" variant="outline" onClick={() => onViewDriver(d.profileId!)}>
                      View driver
                    </Button>
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

// Vehicles tab — driver personal vehicles or company fleet pool
function VehiclesTab({
  driverId,
  vehicles,
  userId,
  fleetCompanyName,
}: {
  driverId?: string;
  vehicles: any[];
  userId: string;
  fleetCompanyName?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Approve vehicle mutation
  const approveVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      return apiRequest("POST", `/api/admin/vehicles/${vehicleId}/approve`);
    },
    onSuccess: (data, vehicleId) => {
      // Invalidate admin queries
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", vehicleId, "compliance/status"] });
      toast({
        title: "Success",
        description: "Vehicle approved successfully. Compliance status updated to Approved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve vehicle",
        variant: "destructive",
      });
    },
  });

  // Reject vehicle mutation
  const rejectVehicleMutation = useMutation({
    mutationFn: async ({ vehicleId, rejectionReason }: { vehicleId: string; rejectionReason?: string }) => {
      return apiRequest("POST", `/api/admin/vehicles/${vehicleId}/reject`, { rejectionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
      toast({
        title: "Success",
        description: "Vehicle rejected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject vehicle",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (vehicleId: string) => {
    approveVehicleMutation.mutate(vehicleId);
  };

  const handleReject = (vehicleId: string) => {
    const reason = prompt("Please provide a reason for rejection (optional):");
    rejectVehicleMutation.mutate({ vehicleId, rejectionReason: reason || undefined });
  };

  const getVehicleStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "suspended":
        return <Badge variant="secondary">Suspended</Badge>;
      case "pending_compliance":
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground">
          {fleetCompanyName ? `Fleet vehicles — ${fleetCompanyName}` : "Driver vehicles"}
        </h3>
        <Badge variant="secondary" data-testid="badge-vehicle-count">
          {vehicles.length} {vehicles.length === 1 ? 'Vehicle' : 'Vehicles'}
        </Badge>
      </div>

      {vehicles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No vehicles registered</p>
          <p className="text-xs mt-1">
            {fleetCompanyName ? "No fleet vehicles registered yet" : "Driver has not added any vehicles yet"}
          </p>
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
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="outline" data-testid={`badge-capacity-${vehicle.id}`}>
                    {vehicle.capacity_litres ? `${vehicle.capacity_litres}L` : 'N/A'}
                  </Badge>
                  {getVehicleStatusBadge(vehicle.vehicle_status || "pending_compliance")}
                </div>
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

              {/* Approve/Reject Actions */}
              {(vehicle.vehicle_status === "pending_compliance" || !vehicle.vehicle_status) && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleApprove(vehicle.id)}
                    disabled={approveVehicleMutation.isPending || rejectVehicleMutation.isPending}
                    className="flex-1"
                  >
                    {approveVehicleMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleReject(vehicle.id)}
                    disabled={approveVehicleMutation.isPending || rejectVehicleMutation.isPending}
                    className="flex-1"
                  >
                    {rejectVehicleMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <XCircle className="h-3 w-3 mr-1" />
                    )}
                    Reject
                  </Button>
                </div>
              )}
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
      try {
        const response = await apiRequest("GET", `/api/admin/users/${userId}/documents`);
        const data = await response.json();
        console.log("[DocumentsTab] Parsed response from API:", data);
        console.log("[DocumentsTab] Response type:", typeof data);
        console.log("[DocumentsTab] Is array?", Array.isArray(data));
        console.log("[DocumentsTab] Response length:", Array.isArray(data) ? data.length : "N/A");
        
        // Ensure we always return an array
        const result = Array.isArray(data) ? data : [];
        console.log("[DocumentsTab] Returning documents:", result.length);
        return result;
      } catch (error) {
        console.error("[DocumentsTab] Error fetching documents:", error);
        return [];
      }
    },
  });
  
  console.log("[DocumentsTab] Current documents state:", documents);
  console.log("[DocumentsTab] Is loading:", isLoading);

  // Update document status mutation
  const updateDocumentStatusMutation = useMutation({
    mutationFn: async ({ documentId, status, rejectionReason }: { documentId: string; status: string; rejectionReason?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/documents/${documentId}/status`, {
        status,
        rejectionReason,
      });
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        throw new Error(`Failed to update document status: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text.substring(0, 200));
        throw new Error("Server returned non-JSON response. The endpoint may not exist or there's a server error.");
      }
      
      return response.json();
    },
    onSuccess: async () => {
      // Invalidate and refetch documents
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "documents"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/users", userId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      toast({
        title: "Success",
        description: "Document status updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Error updating document status:", error);
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
      letter_of_authority: "Letter of Authority",
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
                          (doc.document_status || doc.verification_status) === "approved" || (doc.document_status || doc.verification_status) === "verified"
                            ? "default"
                            : (doc.document_status || doc.verification_status) === "pending_review" || (doc.document_status || doc.verification_status) === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                        className="text-xs capitalize"
                      >
                        {(doc.document_status || doc.verification_status) === "verified" ? "approved" : (doc.document_status || doc.verification_status)}
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
                      // Normalize the file path to work with /objects/ endpoint
                      const fileUrl = documentObjectUrl(doc.file_path, {
                        title: doc.title,
                        mime_type: doc.mime_type,
                      });
                      if (fileUrl) {
                        window.open(fileUrl, "_blank");
                      } else {
                        toast({
                          title: "Error",
                          description: "Document file path is missing or invalid",
                          variant: "destructive",
                        });
                      }
                    }}
                    data-testid={`button-view-${doc.id}`}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                  {((doc.document_status === "pending_review" || doc.document_status === "pending" || doc.document_status === "draft" || !doc.document_status) && 
                    (doc.verification_status === "pending" || doc.verification_status === "pending_review" || doc.verification_status === "draft" || !doc.verification_status)) && (
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
