import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { User, Lock, ArrowLeft, Shield, Building, FileText, Upload, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

const profileSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressProvince: z.string().optional(),
  addressPostalCode: z.string().optional(),
  addressCountry: z.string().optional(),
}).refine((data) => {
  // If fullName is provided, it must be at least 2 characters
  if (data.fullName && data.fullName.trim().length > 0 && data.fullName.trim().length < 2) {
    return false;
  }
  return true;
}, {
  message: "Full name must be at least 2 characters if provided",
  path: ["fullName"],
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => {
  return data.newPassword === data.confirmPassword;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const SOUTH_AFRICAN_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

export default function SupplierProfile() {
  const { toast } = useToast();
  const { updatePassword, refetchProfile } = useAuth();

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/supplier/profile"],
  });

  // Get compliance status
  const { data: complianceStatus } = useQuery<any>({
    queryKey: ["/api/supplier/compliance/status"],
  });

  // Get supplier documents
  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ["/api/supplier/documents"],
  });

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      addressStreet: "",
      addressCity: "",
      addressProvince: "",
      addressPostalCode: "",
      addressCountry: "South Africa",
    },
    values: profile ? {
      fullName: profile.full_name || "",
      phone: profile.phone || "",
      addressStreet: profile.address_street || "",
      addressCity: profile.address_city || "",
      addressProvince: profile.address_province || "",
      addressPostalCode: profile.address_postal_code || "",
      addressCountry: profile.address_country || "South Africa",
    } : {
      fullName: "",
      phone: "",
      addressStreet: "",
      addressCity: "",
      addressProvince: "",
      addressPostalCode: "",
      addressCountry: "South Africa",
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Compliance form
  const complianceForm = useForm<any>({
    defaultValues: {
      director_names: profile?.director_names || [],
      registered_address: profile?.registered_address || "",
      vat_certificate_expiry: profile?.vat_certificate_expiry || "",
      tax_clearance_number: profile?.tax_clearance_number || "",
      tax_clearance_expiry: profile?.tax_clearance_expiry || "",
      wholesale_license_issue_date: profile?.wholesale_license_issue_date || "",
      allowed_fuel_types: profile?.allowed_fuel_types || [],
      site_license_number: profile?.site_license_number || "",
      depot_address: profile?.depot_address || "",
      permit_number: profile?.permit_number || "",
      permit_expiry_date: profile?.permit_expiry_date || "",
      environmental_auth_number: profile?.environmental_auth_number || "",
      approved_storage_capacity_litres: profile?.approved_storage_capacity_litres || "",
      fire_certificate_number: profile?.fire_certificate_number || "",
      fire_certificate_issue_date: profile?.fire_certificate_issue_date || "",
      fire_certificate_expiry_date: profile?.fire_certificate_expiry_date || "",
      hse_file_verified: profile?.hse_file_verified || false,
      hse_file_last_updated: profile?.hse_file_last_updated || "",
      spill_compliance_confirmed: profile?.spill_compliance_confirmed || false,
      sabs_certificate_number: profile?.sabs_certificate_number || "",
      sabs_certificate_issue_date: profile?.sabs_certificate_issue_date || "",
      sabs_certificate_expiry_date: profile?.sabs_certificate_expiry_date || "",
      calibration_certificate_number: profile?.calibration_certificate_number || "",
      calibration_certificate_issue_date: profile?.calibration_certificate_issue_date || "",
      calibration_certificate_expiry_date: profile?.calibration_certificate_expiry_date || "",
      public_liability_policy_number: profile?.public_liability_policy_number || "",
      public_liability_insurance_provider: profile?.public_liability_insurance_provider || "",
      public_liability_coverage_amount_rands: profile?.public_liability_coverage_amount_rands || "",
      public_liability_policy_expiry_date: profile?.public_liability_policy_expiry_date || "",
      env_insurance_number: profile?.env_insurance_number || "",
      env_insurance_expiry_date: profile?.env_insurance_expiry_date || "",
    },
    values: profile ? {
      director_names: profile.director_names || [],
      registered_address: profile.registered_address || "",
      vat_certificate_expiry: profile.vat_certificate_expiry || "",
      tax_clearance_number: profile.tax_clearance_number || "",
      tax_clearance_expiry: profile.tax_clearance_expiry || "",
      wholesale_license_issue_date: profile.wholesale_license_issue_date || "",
      allowed_fuel_types: profile.allowed_fuel_types || [],
      site_license_number: profile.site_license_number || "",
      depot_address: profile.depot_address || "",
      permit_number: profile.permit_number || "",
      permit_expiry_date: profile.permit_expiry_date || "",
      environmental_auth_number: profile.environmental_auth_number || "",
      approved_storage_capacity_litres: profile.approved_storage_capacity_litres || "",
      fire_certificate_number: profile.fire_certificate_number || "",
      fire_certificate_issue_date: profile.fire_certificate_issue_date || "",
      fire_certificate_expiry_date: profile.fire_certificate_expiry_date || "",
      hse_file_verified: profile.hse_file_verified || false,
      hse_file_last_updated: profile.hse_file_last_updated || "",
      spill_compliance_confirmed: profile.spill_compliance_confirmed || false,
      sabs_certificate_number: profile.sabs_certificate_number || "",
      sabs_certificate_issue_date: profile.sabs_certificate_issue_date || "",
      sabs_certificate_expiry_date: profile.sabs_certificate_expiry_date || "",
      calibration_certificate_number: profile.calibration_certificate_number || "",
      calibration_certificate_issue_date: profile.calibration_certificate_issue_date || "",
      calibration_certificate_expiry_date: profile.calibration_certificate_expiry_date || "",
      public_liability_policy_number: profile.public_liability_policy_number || "",
      public_liability_insurance_provider: profile.public_liability_insurance_provider || "",
      public_liability_coverage_amount_rands: profile.public_liability_coverage_amount_rands || "",
      public_liability_policy_expiry_date: profile.public_liability_policy_expiry_date || "",
      env_insurance_number: profile.env_insurance_number || "",
      env_insurance_expiry_date: profile.env_insurance_expiry_date || "",
    } : undefined,
  });

  const updateComplianceMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/supplier/compliance", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/status"] });
      toast({
        title: "Success",
        description: "Compliance information updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update compliance information",
        variant: "destructive",
      });
    },
  });

  const handleDocumentUpload = async (
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
      
      await apiRequest("POST", "/api/supplier/documents", {
        owner_type: "supplier",
        doc_type: docType,
        title: title || uploadedFile.name,
        file_path: objectPath,
        file_size: uploadedFile.size,
        mime_type: uploadedFile.type,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/status"] });
      
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload document",
        variant: "destructive",
      });
    }
  };

  const getUploadURL = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        headers,
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate upload URL");
      }
      
      const data = await response.json();
      let uploadURL = data.uploadURL;
      
      if (uploadURL.startsWith('/')) {
        uploadURL = `${window.location.origin}${uploadURL}`;
      } else if (!uploadURL.startsWith('http://') && !uploadURL.startsWith('https://')) {
        uploadURL = `${window.location.origin}/${uploadURL}`;
      }
      
      return { method: "PUT" as const, url: uploadURL };
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: error.message || "Failed to get upload URL",
        variant: "destructive",
      });
      throw error;
    }
  };

  const getDocumentStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      return apiRequest("PUT", "/api/supplier/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
      setTimeout(async () => {
        await refetchProfile();
        queryClient.refetchQueries({ queryKey: ["/api/supplier/profile"] });
      }, 500);
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await updatePassword(data.newPassword);
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({
        title: "Success",
        description: "Password updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update password",
        variant: "destructive",
      });
    },
  });

  const onProfileSubmit = (data: ProfileFormData) => {
    // Only send fields that are being updated (partial update)
    const updateData: any = {};
    
    // Check current values to detect changes
    const currentFullName = profile?.full_name || "";
    const currentPhone = profile?.phone || "";
    const currentStreet = profile?.address_street || "";
    const currentCity = profile?.address_city || "";
    const currentProvince = profile?.address_province || "";
    const currentPostalCode = profile?.address_postal_code || "";
    const currentCountry = profile?.address_country || "South Africa";
    
    // Only include fields that have changed
    if (data.fullName !== undefined && data.fullName.trim() !== currentFullName) {
      updateData.fullName = data.fullName.trim();
    }
    
    if (data.phone !== undefined && data.phone.trim() !== currentPhone) {
      updateData.phone = data.phone.trim();
    }
    
    if (data.addressStreet !== undefined && data.addressStreet.trim() !== currentStreet) {
      updateData.addressStreet = data.addressStreet.trim();
    }
    
    if (data.addressCity !== undefined && data.addressCity.trim() !== currentCity) {
      updateData.addressCity = data.addressCity.trim();
    }
    
    if (data.addressProvince !== undefined && data.addressProvince !== currentProvince) {
      updateData.addressProvince = data.addressProvince;
    }
    
    if (data.addressPostalCode !== undefined && data.addressPostalCode.trim() !== currentPostalCode) {
      updateData.addressPostalCode = data.addressPostalCode.trim();
    }
    
    if (data.addressCountry !== undefined && data.addressCountry.trim() !== currentCountry) {
      updateData.addressCountry = data.addressCountry.trim();
    }

    // Check if at least one field has changed
    const hasChanges = Object.keys(updateData).length > 0;
    
    if (!hasChanges) {
      toast({
        title: "No changes",
        description: "No fields were changed. Please update at least one field.",
        variant: "destructive",
      });
      return;
    }

    updateProfileMutation.mutate(updateData);
  };

  const onPasswordSubmit = (data: PasswordFormData) => {
    updatePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-8 text-muted-foreground">Loading profile...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/supplier">
            <Button variant="ghost" className="mb-4 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Supplier Profile</h1>
          <p className="text-muted-foreground">Manage your profile and account settings</p>
        </div>

        <div className="grid gap-6">
          {/* Profile Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                  <FormField
                    control={profileForm.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter your full name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Email (read-only) */}
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      value={profile?.email || ""}
                      disabled
                      className="mt-1 bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Email cannot be changed
                    </p>
                  </div>

                  <FormField
                    control={profileForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter your contact number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Address</h3>
                    
                    <FormField
                      control={profileForm.control}
                      name="addressStreet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter street address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={profileForm.control}
                        name="addressCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter city" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={profileForm.control}
                        name="addressProvince"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select province" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {SOUTH_AFRICAN_PROVINCES.map((province) => (
                                  <SelectItem key={province} value={province}>
                                    {province}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={profileForm.control}
                        name="addressPostalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postal Code</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter postal code" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={profileForm.control}
                        name="addressCountry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter country" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} placeholder="Enter current password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} placeholder="Enter new password (min 8 characters)" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} placeholder="Confirm new password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={updatePasswordMutation.isPending}>
                    {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Compliance Status */}
          {complianceStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Compliance Status
                </CardTitle>
                <CardDescription>
                  Your compliance status and document checklist
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Overall Status</p>
                    <Badge 
                      variant={
                        complianceStatus.overallStatus === "approved" ? "default" :
                        complianceStatus.overallStatus === "rejected" ? "destructive" :
                        "secondary"
                      }
                      className="mt-1"
                    >
                      {complianceStatus.overallStatus === "approved" ? "Approved" :
                       complianceStatus.overallStatus === "rejected" ? "Rejected" :
                       complianceStatus.overallStatus === "pending" ? "Pending Review" :
                       "Incomplete"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">Platform Access</p>
                    <Badge variant={complianceStatus.canAccessPlatform ? "default" : "secondary"} className="mt-1">
                      {complianceStatus.canAccessPlatform ? "Active" : "Restricted"}
                    </Badge>
                  </div>
                </div>

                {complianceStatus.checklist && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Document Progress</p>
                        <p className="text-sm text-muted-foreground">
                          {complianceStatus.checklist.approved.length} / {complianceStatus.checklist.required.length} approved
                        </p>
                      </div>
                      <Progress 
                        value={
                          (complianceStatus.checklist.approved.length / complianceStatus.checklist.required.length) * 100
                        } 
                        className="h-2"
                      />
                    </div>

                    {complianceStatus.checklist.missing.length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Missing Documents</AlertTitle>
                        <AlertDescription>
                          You need to upload {complianceStatus.checklist.missing.length} more document(s) to complete compliance.
                        </AlertDescription>
                      </Alert>
                    )}

                    {complianceStatus.rejectionReason && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Compliance Rejected</AlertTitle>
                        <AlertDescription>
                          {complianceStatus.rejectionReason}
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Compliance Information Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Compliance Information
              </CardTitle>
              <CardDescription>
                Complete your compliance profile to access platform features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...complianceForm}>
                <form 
                  onSubmit={complianceForm.handleSubmit((data) => updateComplianceMutation.mutate(data))} 
                  className="space-y-6"
                >
                  {/* Company Registration Section */}
                  <Collapsible defaultOpen={true}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Building className="h-5 w-5" />
                          <span className="font-semibold">Company Registration</span>
                        </div>
                        <ChevronRight className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <FormField
                        control={complianceForm.control}
                        name="registered_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Registered Address</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Enter registered company address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  <Separator />

                  {/* Tax & VAT Section */}
                  <Collapsible>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-semibold">Tax & VAT</span>
                        </div>
                        <ChevronRight className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <FormField
                        control={complianceForm.control}
                        name="vat_certificate_expiry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>VAT Certificate Expiry Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="tax_clearance_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax Clearance Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter tax clearance number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="tax_clearance_expiry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax Clearance Expiry Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  <Separator />

                  {/* Petroleum Licensing Section */}
                  <Collapsible>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-semibold">Petroleum Licensing</span>
                        </div>
                        <ChevronRight className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <FormField
                        control={complianceForm.control}
                        name="wholesale_license_issue_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Wholesale License Issue Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="site_license_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Site License Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter site license number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="depot_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Depot Address</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Enter depot address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="permit_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fuel Trading Permit Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter permit number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="permit_expiry_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Permit Expiry Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  <Separator />

                  {/* Environmental & Safety Section */}
                  <Collapsible>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-semibold">Environmental & Safety</span>
                        </div>
                        <ChevronRight className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <FormField
                        control={complianceForm.control}
                        name="environmental_auth_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Environmental Authorisation Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter authorisation number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="approved_storage_capacity_litres"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Approved Storage Capacity (Litres)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} placeholder="Enter capacity in litres" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="fire_certificate_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fire Certificate Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter certificate number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="fire_certificate_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fire Certificate Issue Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={complianceForm.control}
                          name="fire_certificate_expiry_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fire Certificate Expiry Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={complianceForm.control}
                        name="hse_file_verified"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>HSE File Verified</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Health & Safety file has been verified
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="spill_compliance_confirmed"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Spill Containment Compliance Confirmed</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  <Separator />

                  {/* Fuel Quality Section */}
                  <Collapsible>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-semibold">Fuel Quality Compliance</span>
                        </div>
                        <ChevronRight className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <FormField
                        control={complianceForm.control}
                        name="sabs_certificate_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SABS Fuel Quality Certificate Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter certificate number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="sabs_certificate_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SABS Certificate Issue Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={complianceForm.control}
                          name="sabs_certificate_expiry_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SABS Certificate Expiry Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={complianceForm.control}
                        name="calibration_certificate_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pump/Meter Calibration Certificate Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter certificate number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="calibration_certificate_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Calibration Certificate Issue Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={complianceForm.control}
                          name="calibration_certificate_expiry_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Calibration Certificate Expiry Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <Separator />

                  {/* Insurance Section */}
                  <Collapsible>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-semibold">Insurance</span>
                        </div>
                        <ChevronRight className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <FormField
                        control={complianceForm.control}
                        name="public_liability_policy_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Public Liability Policy Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter policy number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="public_liability_insurance_provider"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Public Liability Insurance Provider</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter insurance provider" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="public_liability_coverage_amount_rands"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Coverage Amount (Rands)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} placeholder="Enter coverage amount" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="public_liability_policy_expiry_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Public Liability Policy Expiry Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="env_insurance_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Environmental Liability Insurance Number (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter insurance number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={complianceForm.control}
                        name="env_insurance_expiry_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Environmental Insurance Expiry Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  <Button type="submit" disabled={updateComplianceMutation.isPending}>
                    {updateComplianceMutation.isPending ? "Saving..." : "Save Compliance Information"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Required Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Required Documents
              </CardTitle>
              <CardDescription>
                Upload your compliance documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { type: "cipc_certificate", label: "CIPC Certificate", required: true },
                { type: "vat_certificate", label: "VAT Certificate", required: true },
                { type: "tax_clearance", label: "SARS Tax Clearance Certificate", required: true },
                { type: "dmre_license", label: "DMRE Wholesale Fuel License", required: true },
                { type: "site_license", label: "Site/Depot License", required: true },
                { type: "environmental_authorisation", label: "Environmental Authorisation", required: true },
                { type: "fire_certificate", label: "Fire Department Certificate", required: true },
                { type: "sabs_certificate", label: "SABS Fuel Quality Certificate", required: true },
                { type: "calibration_certificate", label: "Pump/Meter Calibration Certificate", required: true },
                { type: "public_liability_insurance", label: "Public Liability Insurance", required: true },
                { type: "env_liability_insurance", label: "Environmental Liability Insurance", required: false },
              ].map((doc) => {
                const existingDoc = documents.find((d) => d.doc_type === doc.type);
                return (
                  <div key={doc.type} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{doc.label}</h4>
                        {doc.required && (
                          <Badge variant="outline" className="mt-1">Required</Badge>
                        )}
                      </div>
                      {existingDoc && getDocumentStatusBadge(existingDoc.verification_status)}
                    </div>
                    
                    {existingDoc ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
                        </p>
                        {existingDoc.expiry_date && (
                          <p className="text-sm text-muted-foreground">
                            Expires: {new Date(existingDoc.expiry_date).toLocaleDateString()}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/objects/${existingDoc.file_path}`, "_blank")}
                          >
                            View Document
                          </Button>
                          <ObjectUploader
                            onGetUploadParameters={getUploadURL}
                            onComplete={(result) => handleDocumentUpload(doc.type, doc.label, result)}
                            allowedFileTypes={["application/pdf", "image/*"]}
                            maxFileSize={10485760}
                            buttonVariant="outline"
                            buttonSize="sm"
                          >
                            Replace
                          </ObjectUploader>
                        </div>
                      </div>
                    ) : (
                      <ObjectUploader
                        onGetUploadParameters={getUploadURL}
                        onComplete={(result) => handleDocumentUpload(doc.type, doc.label, result)}
                        allowedFileTypes={["application/pdf", "image/*"]}
                        maxFileSize={10485760}
                        buttonVariant="default"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload {doc.label}
                      </ObjectUploader>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

