import { useState, useEffect } from "react";
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
import { useWebSocket } from "@/hooks/useWebSocket";
import { User, Lock, ArrowLeft, Shield, Building, FileText, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
import { normalizeFilePath } from "@/lib/utils";
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

// Helper function to format dates consistently
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString("en-ZA", {
      dateStyle: "medium",
      timeZone: "Africa/Johannesburg",
    });
  } catch (error) {
    return "Invalid Date";
  }
};

// Helper function to format date for input field (YYYY-MM-DD)
const formatDateForInput = (dateString: string | null | undefined): string => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    // Handle timezone by using local date
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (error) {
    return "";
  }
};

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
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  });

  // Listen for document status updates and KYC approval via WebSocket
  useWebSocket((message) => {
    if (message.type === "document_approved" || message.type === "document_rejected" || 
        message.type === "kyc_approved" || message.type === "compliance_approved" || 
        message.type === "kyb_approved") {
      console.log("[SupplierProfile] Received WebSocket message:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/status"] });
      queryClient.refetchQueries({ queryKey: ["/api/supplier/documents"] });
      queryClient.refetchQueries({ queryKey: ["/api/supplier/profile"] });
    }
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

  // Helper function to find document by type
  const findDocument = (docType: string, title?: string) => {
    return documents.find((d) => {
      if (d.doc_type !== docType) return false;
      if (title && d.title !== title) return false;
      return true;
    });
  };

  // Compliance form - use useEffect to reset form when profile data loads
  const complianceForm = useForm<any>({
    defaultValues: {
      // Company Registration
      company_name: "",
      registration_number: "",
      registered_address: "",
      director_names: [],
      // VAT Certificate
      vat_number: "",
      // SARS Tax Clearance
      tax_clearance_number: "",
      tax_clearance_expiry: "",
      // Wholesale Fuel Licence
      wholesale_license_number: "",
      wholesale_license_issue_date: "",
      wholesale_license_expiry_date: "",
      allowed_fuel_types: [],
      // Depot / Site Licence
      site_license_number: "",
      depot_address: "",
      // Additional Fuel Trading Permit
      permit_number: "",
      permit_expiry_date: "",
      // Environmental Authorisation
      environmental_auth_number: "",
      approved_storage_capacity_litres: "",
      // Fire Department Certificate
      fire_certificate_number: "",
      fire_certificate_issue_date: "",
      fire_certificate_expiry_date: "",
      // Health & Safety File
      hse_file_verified: false,
      hse_file_last_updated: "",
      // Spill Containment Compliance
      spill_compliance_confirmed: false,
      // SABS Fuel Quality Certificate
      sabs_certificate_number: "",
      sabs_certificate_issue_date: "",
      sabs_certificate_expiry_date: "",
      // Pump / Meter Calibration Certificates
      calibration_certificate_number: "",
      calibration_certificate_issue_date: "",
      calibration_certificate_expiry_date: "",
      // Public Liability Insurance
      public_liability_policy_number: "",
      public_liability_insurance_provider: "",
      public_liability_coverage_amount_rands: "",
      public_liability_policy_expiry_date: "",
      // Environmental Liability Insurance
      env_insurance_number: "",
      env_insurance_expiry_date: "",
    },
  });

  // Reset form when profile data loads or changes
  useEffect(() => {
    if (profile) {
      complianceForm.reset({
        // Company Registration - map registered_name to company_name
        company_name: profile.registered_name || profile.company_name || "",
        registration_number: profile.registration_number || "",
        registered_address: profile.registered_address || "",
        director_names: Array.isArray(profile.director_names) ? profile.director_names : (profile.director_names ? [profile.director_names] : []),
        // VAT Certificate
        vat_number: profile.vat_number || "",
        // SARS Tax Clearance
        tax_clearance_number: profile.tax_clearance_number || "",
        tax_clearance_expiry: profile.tax_clearance_expiry ? formatDateForInput(profile.tax_clearance_expiry) : "",
        // Wholesale Fuel Licence - map dmre_license_number to wholesale_license_number
        wholesale_license_number: profile.dmre_license_number || profile.wholesale_license_number || "",
        wholesale_license_issue_date: profile.wholesale_license_issue_date ? formatDateForInput(profile.wholesale_license_issue_date) : "",
        wholesale_license_expiry_date: profile.dmre_license_expiry ? formatDateForInput(profile.dmre_license_expiry) : (profile.wholesale_license_expiry_date ? formatDateForInput(profile.wholesale_license_expiry_date) : ""),
        allowed_fuel_types: Array.isArray(profile.allowed_fuel_types) ? profile.allowed_fuel_types : (profile.allowed_fuel_types ? [profile.allowed_fuel_types] : []),
        // Depot / Site Licence
        site_license_number: profile.site_license_number || "",
        depot_address: profile.depot_address || "",
        // Additional Fuel Trading Permit
        permit_number: profile.permit_number || "",
        permit_expiry_date: profile.permit_expiry_date ? formatDateForInput(profile.permit_expiry_date) : "",
        // Environmental Authorisation
        environmental_auth_number: profile.environmental_auth_number || "",
        approved_storage_capacity_litres: profile.approved_storage_capacity_litres || "",
        // Fire Department Certificate
        fire_certificate_number: profile.fire_certificate_number || "",
        fire_certificate_issue_date: profile.fire_certificate_issue_date ? formatDateForInput(profile.fire_certificate_issue_date) : "",
        fire_certificate_expiry_date: profile.fire_certificate_expiry_date ? formatDateForInput(profile.fire_certificate_expiry_date) : "",
        // Health & Safety File
        hse_file_verified: profile.hse_file_verified || false,
        hse_file_last_updated: profile.hse_file_last_updated ? formatDateForInput(profile.hse_file_last_updated) : "",
        // Spill Containment Compliance
        spill_compliance_confirmed: profile.spill_compliance_confirmed || false,
        // SABS Fuel Quality Certificate
        sabs_certificate_number: profile.sabs_certificate_number || "",
        sabs_certificate_issue_date: profile.sabs_certificate_issue_date ? formatDateForInput(profile.sabs_certificate_issue_date) : "",
        sabs_certificate_expiry_date: profile.sabs_certificate_expiry_date ? formatDateForInput(profile.sabs_certificate_expiry_date) : "",
        // Pump / Meter Calibration Certificates
        calibration_certificate_number: profile.calibration_certificate_number || "",
        calibration_certificate_issue_date: profile.calibration_certificate_issue_date ? formatDateForInput(profile.calibration_certificate_issue_date) : "",
        calibration_certificate_expiry_date: profile.calibration_certificate_expiry_date ? formatDateForInput(profile.calibration_certificate_expiry_date) : "",
        // Public Liability Insurance
        public_liability_policy_number: profile.public_liability_policy_number || "",
        public_liability_insurance_provider: profile.public_liability_insurance_provider || "",
        public_liability_coverage_amount_rands: profile.public_liability_coverage_amount_rands || "",
        public_liability_policy_expiry_date: profile.public_liability_policy_expiry_date ? formatDateForInput(profile.public_liability_policy_expiry_date) : "",
        // Environmental Liability Insurance
        env_insurance_number: profile.env_insurance_number || "",
        env_insurance_expiry_date: profile.env_insurance_expiry_date ? formatDateForInput(profile.env_insurance_expiry_date) : "",
      });
    }
  }, [profile, complianceForm]);

  const updateComplianceMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/supplier/compliance", data);
    },
    onSuccess: async () => {
      // Invalidate and refetch profile data to get updated values
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/compliance/status"] });
      // Refetch profile to update form values
      await queryClient.refetchQueries({ queryKey: ["/api/supplier/profile"] });
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
      case "approved":
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
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
                  className="space-y-8"
                >
                  {/* ========== SECTION 1: COMPANY LEGITIMACY ========== */}
                  <div className="space-y-6">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Building className="h-5 w-5 text-primary" />
                        1. Company Legitimacy
                      </h2>
                    </div>

                    {/* A. Company Registration (CIPC Docs) */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">A. Company Registration (CIPC Docs)</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="company_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Name *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter company name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="registration_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Registration Number (CIPC) *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter CIPC registration number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={complianceForm.control}
                        name="registered_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Registered Address *</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Enter registered company address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={complianceForm.control}
                        name="director_names"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Director Names *</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                placeholder="Enter director names (one per line or comma-separated)"
                                value={Array.isArray(field.value) ? field.value.join(", ") : field.value || ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const names = value.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
                                  field.onChange(names);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* CIPC Documents Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">CIPC Documents Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("cipc_certificate");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("cipc_certificate", "CIPC Certificate", result)}
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
                              onComplete={(result) => handleDocumentUpload("cipc_certificate", "CIPC Certificate", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload CIPC Documents
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* B. VAT Certificate */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">B. VAT Certificate</h3>
                      
                      <FormField
                        control={complianceForm.control}
                        name="vat_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>VAT Number *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter VAT number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* VAT Certificate Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">VAT Certificate Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("vat_certificate");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("vat_certificate", "VAT Certificate", result)}
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
                              onComplete={(result) => handleDocumentUpload("vat_certificate", "VAT Certificate", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload VAT Certificate
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* C. SARS Tax Clearance Certificate */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">C. SARS Tax Clearance Certificate</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="tax_clearance_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tax Clearance Number *</FormLabel>
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
                              <FormLabel>Tax Clearance Expiry Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Tax Clearance Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Tax Clearance Certificate Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("tax_clearance");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("tax_clearance", "SARS Tax Clearance Certificate", result)}
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
                              onComplete={(result) => handleDocumentUpload("tax_clearance", "SARS Tax Clearance Certificate", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Tax Clearance Certificate
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ========== SECTION 2: PETROLEUM LICENSING (MOST IMPORTANT) ========== */}
                  <div className="space-y-6 pt-4 border-t-2 border-primary/20">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        2. Petroleum Licensing
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1 font-semibold text-amber-600">
                        Most Important
                      </p>
                    </div>

                    {/* A. Wholesale Fuel Licence (DMRE) */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">A. Wholesale Fuel Licence (DMRE)</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="wholesale_license_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Wholesale License Number *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter DMRE license number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="allowed_fuel_types"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Allowed Fuel Types *</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="e.g., Diesel, Petrol, Paraffin (comma-separated)"
                                  value={Array.isArray(field.value) ? field.value.join(", ") : field.value || ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const types = value.split(",").map(t => t.trim()).filter(Boolean);
                                    field.onChange(types);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="wholesale_license_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Issue Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="wholesale_license_expiry_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Expiry Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* DMRE License Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">DMRE Wholesale Fuel License Document Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("dmre_license");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("dmre_license", "DMRE Wholesale Fuel License", result)}
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
                              onComplete={(result) => handleDocumentUpload("dmre_license", "DMRE Wholesale Fuel License", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload DMRE Wholesale Fuel License
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* B. Depot / Site Licence */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">B. Depot / Site Licence</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="site_license_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Site License Number *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter site license number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={complianceForm.control}
                        name="depot_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Depot Address *</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Enter depot address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Site License Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Site/Depot License Document Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("site_license");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("site_license", "Site/Depot License", result)}
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
                              onComplete={(result) => handleDocumentUpload("site_license", "Site/Depot License", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Site/Depot License Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* C. Additional Fuel Trading Permit */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">C. Additional Fuel Trading Permit (If required)</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="permit_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Permit Number</FormLabel>
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
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Permit Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Fuel Trading Permit Document Upload</h4>
                        {(() => {
                          const existingDoc = findDocument("fuel_trading_permit");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("fuel_trading_permit", "Fuel Trading Permit", result)}
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
                              onComplete={(result) => handleDocumentUpload("fuel_trading_permit", "Fuel Trading Permit", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Fuel Trading Permit Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ========== SECTION 3: ENVIRONMENTAL & SAFETY COMPLIANCE ========== */}
                  <div className="space-y-6 pt-4 border-t-2 border-primary/20">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        3. Environmental & Safety Compliance
                      </h2>
                    </div>

                    {/* A. Environmental Authorisation */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">A. Environmental Authorisation</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="environmental_auth_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Environmental Authorisation Number *</FormLabel>
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
                              <FormLabel>Approved Storage Capacity (Litres) *</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} placeholder="Enter capacity in litres" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Environmental Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Environmental Authorisation Document Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("environmental_authorisation");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("environmental_authorisation", "Environmental Authorisation", result)}
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
                              onComplete={(result) => handleDocumentUpload("environmental_authorisation", "Environmental Authorisation", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Environmental Authorisation Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* B. Fire Department Certificate */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">B. Fire Department Certificate</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="fire_certificate_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fire Certificate Number *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter certificate number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="fire_certificate_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fire Certificate Issue Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
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
                              <FormLabel>Fire Certificate Expiry Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Fire Certificate Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Fire Department Certificate Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("fire_certificate");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("fire_certificate", "Fire Department Certificate", result)}
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
                              onComplete={(result) => handleDocumentUpload("fire_certificate", "Fire Department Certificate", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Fire Department Certificate
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* C. Health & Safety File */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">C. Health & Safety File (Confirmation Only)</h3>
                      
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

                      {complianceForm.watch("hse_file_verified") && (
                        <FormField
                          control={complianceForm.control}
                          name="hse_file_last_updated"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>HSE File Last Updated Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {/* D. Spill Containment Compliance */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">D. Spill Containment Compliance</h3>
                      
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

                      {/* Spill Certificate Document Upload (Optional) */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Spill Certificate Document Upload (Optional)</h4>
                        {(() => {
                          const existingDoc = findDocument("spill_certificate");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("spill_certificate", "Spill Certificate", result)}
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
                              onComplete={(result) => handleDocumentUpload("spill_certificate", "Spill Certificate", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Spill Certificate Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ========== SECTION 4: FUEL QUALITY COMPLIANCE ========== */}
                  <div className="space-y-6 pt-4 border-t-2 border-primary/20">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        4. Fuel Quality Compliance
                      </h2>
                    </div>

                    {/* A. SABS Fuel Quality Certificate */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">A. SABS Fuel Quality Certificate</h3>
                      
                      <FormField
                        control={complianceForm.control}
                        name="sabs_certificate_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SABS Certificate Number *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter certificate number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="sabs_certificate_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Certificate Issue Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
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
                              <FormLabel>Certificate Expiry Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* SABS Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">SABS Fuel Quality Certificate Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("sabs_certificate");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("sabs_certificate", "SABS Fuel Quality Certificate", result)}
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
                              onComplete={(result) => handleDocumentUpload("sabs_certificate", "SABS Fuel Quality Certificate", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload SABS Fuel Quality Certificate
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* B. Pump / Meter Calibration Certificates */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">B. Pump / Meter Calibration Certificates</h3>
                      
                      <FormField
                        control={complianceForm.control}
                        name="calibration_certificate_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Calibration Certificate Number *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter certificate number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="calibration_certificate_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Calibration Issue Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
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
                              <FormLabel>Calibration Expiry Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Calibration Certificate Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Pump/Meter Calibration Certificate Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("calibration_certificate");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("calibration_certificate", "Pump/Meter Calibration Certificate", result)}
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
                              onComplete={(result) => handleDocumentUpload("calibration_certificate", "Pump/Meter Calibration Certificate", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Calibration Certificate
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ========== SECTION 5: INSURANCE ========== */}
                  <div className="space-y-6 pt-4 border-t-2 border-primary/20">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        5. Insurance
                      </h2>
                    </div>

                    {/* A. Public Liability Insurance */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">A. Public Liability Insurance</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="public_liability_policy_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Policy Number *</FormLabel>
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
                              <FormLabel>Insurance Provider *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter insurance provider" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="public_liability_coverage_amount_rands"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Coverage Amount (Rands) *</FormLabel>
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
                              <FormLabel>Policy Expiry Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Public Liability Insurance Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Public Liability Insurance Document Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("public_liability_insurance");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("public_liability_insurance", "Public Liability Insurance", result)}
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
                              onComplete={(result) => handleDocumentUpload("public_liability_insurance", "Public Liability Insurance", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Public Liability Insurance Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* B. Environmental Liability Insurance (Optional) */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">B. Environmental Liability Insurance (Optional)</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="env_insurance_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Environmental Insurance Number</FormLabel>
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
                                <Input type="date" {...field} value={field.value ? formatDateForInput(field.value) : ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Environmental Liability Insurance Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Environmental Liability Insurance Document Upload</h4>
                        {(() => {
                          const existingDoc = findDocument("env_liability_insurance");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {formatDate(existingDoc.created_at)}
                                  {existingDoc.expiry_date && ` | Expires: ${formatDate(existingDoc.expiry_date)}`}
                                </p>
                                {getDocumentStatusBadge(existingDoc.verification_status)}
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
                                  View Document
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("env_liability_insurance", "Environmental Liability Insurance", result)}
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
                              onComplete={(result) => handleDocumentUpload("env_liability_insurance", "Environmental Liability Insurance", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Environmental Liability Insurance Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t-2 border-primary/20">
                    <Button type="submit" size="lg" disabled={updateComplianceMutation.isPending} className="w-full md:w-auto">
                      {updateComplianceMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Compliance Information"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

