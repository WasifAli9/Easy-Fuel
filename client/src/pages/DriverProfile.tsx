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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { User, Lock, Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Shield, Building, MapPin, Loader2 } from "lucide-react";
import { normalizeFilePath } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
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

interface DriverDocument {
  id: string;
  doc_type: string;
  title: string;
  file_path: string;
  verification_status: string;
  expiry_date: string | null;
  created_at: string;
}

export default function DriverProfile() {
  const { toast } = useToast();
  const { updatePassword, refetchProfile } = useAuth();

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/driver/profile"],
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  });
  
  // Debug: Log profile data to see what we're getting
  console.log("Driver Profile Data:", profile);
  console.log("Profile Photo URL:", profile?.profile_photo_url);

  const { data: documents = [] } = useQuery<DriverDocument[]>({
    queryKey: ["/api/driver/documents"],
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  });

  // Listen for document status updates and KYC approval via WebSocket
  useWebSocket((message) => {
    if (message.type === "document_approved" || message.type === "document_rejected" || 
        message.type === "kyc_approved" || message.type === "compliance_approved") {
      console.log("[DriverProfile] Received WebSocket message:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      queryClient.refetchQueries({ queryKey: ["/api/driver/documents"] });
      queryClient.refetchQueries({ queryKey: ["/api/driver/profile"] });
    }
  });

  // Get compliance status
  const { data: complianceStatus } = useQuery<any>({
    queryKey: ["/api/driver/compliance/status"],
  });

  // Helper function to find document by type
  const findDocument = (docType: string, title?: string) => {
    return documents.find((d) => {
      if (d.doc_type !== docType) return false;
      if (title && d.title !== title) return false;
      return true;
    });
  };

  // Compliance form
  const complianceForm = useForm<any>({
    defaultValues: {
      // Basic Profile
      driver_type: profile?.driver_type || "",
      mobile_number: profile?.mobile_number || "",
      // SA ID / Passport
      id_type: profile?.id_type || "",
      id_number: profile?.id_number || "",
      id_issue_country: profile?.id_issue_country || "",
      // Proof of Address
      address_line_1: profile?.address_line_1 || "",
      address_line_2: profile?.address_line_2 || "",
      city: profile?.city || "",
      province: profile?.province || "",
      postal_code: profile?.postal_code || "",
      country: profile?.country || "South Africa",
      // Driver's Licence
      license_number: profile?.license_number || "",
      license_code: profile?.license_code || "",
      license_issue_date: profile?.license_issue_date || "",
      license_expiry_date: profile?.license_expiry_date || "",
      // PrDP
      prdp_required: profile?.prdp_required || false,
      prdp_number: profile?.prdp_number || "",
      prdp_category: profile?.prdp_category || "",
      prdp_issue_date: profile?.prdp_issue_date || "",
      prdp_expiry_date: profile?.prdp_expiry_date || "",
      // Dangerous Goods Training
      dg_training_required: profile?.dg_training_required || false,
      dg_training_provider: profile?.dg_training_provider || "",
      dg_training_certificate_number: profile?.dg_training_certificate_number || "",
      dg_training_issue_date: profile?.dg_training_issue_date || "",
      dg_training_expiry_date: profile?.dg_training_expiry_date || "",
      // Criminal Check
      criminal_check_done: profile?.criminal_check_done || false,
      criminal_check_reference: profile?.criminal_check_reference || "",
      criminal_check_date: profile?.criminal_check_date || "",
      // Bank & Payment
      bank_account_holder: profile?.bank_account_holder || "",
      bank_name: profile?.bank_name || "",
      account_number: profile?.account_number || "",
      branch_code: profile?.branch_code || "",
      // Company Link
      is_company_driver: profile?.is_company_driver || false,
      company_id: profile?.company_id || "",
      role_in_company: profile?.role_in_company || "",
    },
    values: profile ? {
      driver_type: profile.driver_type || "",
      mobile_number: profile.mobile_number || "",
      id_type: profile.id_type || "",
      id_number: profile.id_number || "",
      id_issue_country: profile.id_issue_country || "",
      address_line_1: profile.address_line_1 || "",
      address_line_2: profile.address_line_2 || "",
      city: profile.city || "",
      province: profile.province || "",
      postal_code: profile.postal_code || "",
      country: profile.country || "South Africa",
      license_number: profile.license_number || "",
      license_code: profile.license_code || "",
      license_issue_date: profile.license_issue_date || "",
      license_expiry_date: profile.license_expiry_date || "",
      prdp_required: profile.prdp_required || false,
      prdp_number: profile.prdp_number || "",
      prdp_category: profile.prdp_category || "",
      prdp_issue_date: profile.prdp_issue_date || "",
      prdp_expiry_date: profile.prdp_expiry_date || "",
      dg_training_required: profile.dg_training_required || false,
      dg_training_provider: profile.dg_training_provider || "",
      dg_training_certificate_number: profile.dg_training_certificate_number || "",
      dg_training_issue_date: profile.dg_training_issue_date || "",
      dg_training_expiry_date: profile.dg_training_expiry_date || "",
      criminal_check_done: profile.criminal_check_done || false,
      criminal_check_reference: profile.criminal_check_reference || "",
      criminal_check_date: profile.criminal_check_date || "",
      bank_account_holder: profile.bank_account_holder || "",
      bank_name: profile.bank_name || "",
      account_number: profile.account_number || "",
      branch_code: profile.branch_code || "",
      is_company_driver: profile.is_company_driver || false,
      company_id: profile.company_id || "",
      role_in_company: profile.role_in_company || "",
    } : undefined,
  });

  const updateComplianceMutation = useMutation({
    mutationFn: async (data: any) => {
      // Debug: Log what we're sending, especially company_id
      console.log("[DriverProfile] Sending compliance data:", {
        company_id: data.company_id,
        company_id_type: typeof data.company_id,
        company_id_length: typeof data.company_id === 'string' ? data.company_id.length : 'N/A',
        has_company_id: data.hasOwnProperty('company_id'),
        full_data_keys: Object.keys(data).filter(k => k.includes('company') || k.includes('prdp'))
      });
      return apiRequest("PUT", "/api/driver/compliance", data);
    },
    onSuccess: async (responseData) => {
      // Update the query cache with the response data if available
      if (responseData) {
        queryClient.setQueryData(["/api/driver/profile"], (oldData: any) => {
          if (!oldData) return responseData;
          return {
            ...oldData,
            ...responseData,
            mobile_number: responseData.mobile_number || oldData.mobile_number || oldData.phone || "",
            id_number: responseData.id_number || oldData.id_number || "",
            license_number: responseData.license_number || oldData.license_number || "",
            license_issue_date: responseData.license_issue_date || oldData.license_issue_date || "",
            license_expiry_date: responseData.license_expiry_date || oldData.license_expiry_date || "",
            prdp_number: responseData.prdp_number || oldData.prdp_number || "",
            prdp_issue_date: responseData.prdp_issue_date || oldData.prdp_issue_date || "",
            prdp_expiry_date: responseData.prdp_expiry_date || oldData.prdp_expiry_date || oldData.prdp_expiry || "",
            dg_training_issue_date: responseData.dg_training_issue_date || oldData.dg_training_issue_date || "",
            dg_training_expiry_date: responseData.dg_training_expiry_date || oldData.dg_training_expiry_date || "",
            criminal_check_date: responseData.criminal_check_date || oldData.criminal_check_date || "",
            company_id: responseData.company_id || oldData.company_id || "",
            bank_account_holder: responseData.bank_account_holder || oldData.bank_account_holder || oldData.bank_account_name || "",
          };
        });
      }
      
      // Invalidate and refetch to get updated data
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/status"] });
      await queryClient.refetchQueries({ queryKey: ["/api/driver/profile"] });
      
      toast({
        title: "Success",
        description: "Compliance information updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Compliance update error:", error);
      const errorMessage = error.details?.join?.(", ") || error.message || "Failed to update compliance information";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: "",
    },
    values: profile ? {
      fullName: profile.full_name || "",
    } : {
      fullName: "",
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

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { fullName: string }) => {
      return apiRequest("PUT", "/api/driver/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
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
      // Note: Supabase doesn't provide a way to verify current password without signing in
      // In a production app, you might want to add server-side verification
      // For now, we'll update the password directly
      await updatePassword(data.newPassword);
    },
    onSuccess: () => {
      passwordForm.reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
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

  const handleProfilePictureUpload = async (result: any) => {
    console.log("Upload result:", result);
    
    if (!result.successful || result.successful.length === 0) {
      console.error("Upload failed or no successful files:", result);
      const failedFiles = result.failed || [];
      const errorMessage = failedFiles.length > 0 && failedFiles[0]?.error 
        ? failedFiles[0].error 
        : "File upload failed. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      return;
    }
    
    const uploadedFile = result.successful[0];
    console.log("Uploaded file data:", uploadedFile);
    console.log("Uploaded file response:", uploadedFile?.response);
    console.log("Uploaded file response.body:", uploadedFile?.response?.body);
    console.log("Uploaded file uploadURL:", uploadedFile?.uploadURL);
    
    // The server upload endpoint returns { objectPath, uploadURL, location, url }
    // objectPath is in bucket/path format which is what we need
    let objectPath: string | undefined;
    
    // Try multiple ways to extract the response data from Uppy
    // Uppy's AwsS3 plugin stores the response in different places depending on the response format
    let responseData: any = null;
    
    // Method 1: Check response.body (most common for Uppy AwsS3 - response body is a string)
    if (uploadedFile?.response?.body) {
      try {
        responseData = typeof uploadedFile.response.body === 'string' 
          ? JSON.parse(uploadedFile.response.body) 
          : uploadedFile.response.body;
        console.log("Extracted responseData from response.body:", responseData);
      } catch (e) {
        console.warn("Could not parse response.body:", e);
      }
    }
    
    // Method 2: Check response directly (if it's already an object)
    if (!responseData && uploadedFile?.response) {
      try {
        if (typeof uploadedFile.response === 'object' && !Array.isArray(uploadedFile.response) && uploadedFile.response !== null) {
          // Check if it has objectPath directly (already parsed)
          if (uploadedFile.response.objectPath || uploadedFile.response.fullPath) {
            responseData = uploadedFile.response;
            console.log("Using response as object:", responseData);
          } else if (typeof uploadedFile.response === 'string') {
            responseData = JSON.parse(uploadedFile.response);
            console.log("Parsed response string:", responseData);
          }
        }
      } catch (e) {
        console.warn("Could not parse response:", e);
      }
    }
    
    // Method 3: Check response.data (some Uppy versions)
    if (!responseData && uploadedFile?.response?.data) {
      try {
        responseData = typeof uploadedFile.response.data === 'string' 
          ? JSON.parse(uploadedFile.response.data) 
          : uploadedFile.response.data;
        console.log("Extracted responseData from response.data:", responseData);
      } catch (e) {
        console.warn("Could not parse response.data:", e);
      }
    }
    
    // Extract objectPath from responseData
    if (responseData) {
      objectPath = responseData?.objectPath || responseData?.fullPath || responseData?.path;
      console.log("Extracted objectPath from responseData:", objectPath);
    }
    
    // If we still don't have objectPath, try to extract from uploadURL
    if (!objectPath) {
      let uploadURL = uploadedFile?.uploadURL;
      
      // If uploadURL is the full endpoint path, extract bucket/path from it
      // The format should be: /api/storage/upload/bucket/path or http://.../api/storage/upload/bucket/path
      if (uploadURL) {
        // Remove protocol and domain if present
        const pathOnly = uploadURL.replace(/^https?:\/\/[^/]+/, '');
        
        if (pathOnly.startsWith('/api/storage/upload/')) {
          const pathMatch = pathOnly.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
          if (pathMatch) {
            const [, bucket, path] = pathMatch;
            objectPath = `${bucket}/${path}`;
            console.log("Extracted bucket/path from uploadURL:", objectPath);
          } else {
            // If bucket is missing, use default bucket
            const defaultBucket = "private-objects";
            const pathMatch = pathOnly.match(/\/api\/storage\/upload\/(.+)/);
            if (pathMatch) {
              const [, path] = pathMatch;
              objectPath = `${defaultBucket}/${path}`;
              console.log("Extracted path from uploadURL (using default bucket):", objectPath);
            }
          }
        }
      }
    }
    
    if (!objectPath) {
      console.error("No objectPath found in upload result. Full uploadedFile:", JSON.stringify(uploadedFile, null, 2));
      toast({
        title: "Error",
        description: "Could not get file URL from upload. Please check the console for details.",
        variant: "destructive",
      });
      return;
    }
    
    console.log("Final objectPath to use:", objectPath);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/profile-picture", {
        method: "PUT",
        headers,
        body: JSON.stringify({ profilePictureURL: objectPath }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        const errorMsg = errorData.message || errorData.details || errorData.error || "Failed to set profile picture";
        console.error("Profile picture API error:", errorData);
        throw new Error(errorMsg);
      }

      const { objectPath: finalObjectPath } = await response.json();
      
      if (!finalObjectPath) {
        throw new Error("No object path returned from server");
      }
      
      await apiRequest("PUT", "/api/driver/profile", { 
        profilePhotoUrl: finalObjectPath 
      });
      
      // Invalidate profile queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      
      // Refresh AuthContext profile after a short delay to ensure DB is updated
      setTimeout(async () => {
        await refetchProfile();
        queryClient.refetchQueries({ queryKey: ["/api/driver/profile"] });
        queryClient.refetchQueries({ queryKey: ["/api/profile"] });
      }, 500);
      
      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
    } catch (error: any) {
      console.error("Profile picture upload error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update profile picture",
        variant: "destructive",
      });
    }
  };

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
      
      await apiRequest("POST", "/api/driver/documents", {
        doc_type: docType,
        title: title || uploadedFile.name,
        file_path: objectPath,
        file_size: uploadedFile.size,
        mime_type: uploadedFile.type,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
      
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
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        const errorMsg = errorData.message || errorData.details || errorData.error || "Failed to generate upload URL";
        console.error("Upload URL generation error:", errorData);
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      let uploadURL = data.uploadURL;
      
      if (!uploadURL) {
        throw new Error("No upload URL returned from server");
      }
      
      // Convert relative URLs to absolute URLs for Uppy
      // Uppy's AwsS3 plugin requires a full URL (with protocol and domain)
      if (uploadURL.startsWith('/')) {
        // Relative URL - convert to absolute
        uploadURL = `${window.location.origin}${uploadURL}`;
      } else if (!uploadURL.startsWith('http://') && !uploadURL.startsWith('https://')) {
        // Path without leading slash - assume it's relative to origin
        uploadURL = `${window.location.origin}/${uploadURL}`;
      }
      
      console.log("Upload URL for Uppy:", uploadURL);
      return { method: "PUT" as const, url: uploadURL };
    } catch (error: any) {
      console.error("Error in getUploadURL:", error);
      toast({
        title: "Upload Error",
        description: error.message || "Failed to get upload URL. Please check server configuration.",
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
      case "pending":
      case "pending_review":
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getDocumentTypeLabel = (docType: string) => {
    const labels: Record<string, string> = {
      prdp: "Professional Driving Permit (PrDP-D)",
      drivers_license: "Driver's License",
      za_id: "South African ID",
      passport: "Passport",
      dangerous_goods_training: "Dangerous Goods Training Certificate",
      medical_fitness: "Medical Fitness Certificate",
      proof_of_address: "Proof of Address",
      criminal_check: "Criminal Clearance",
      banking_proof: "Banking Proof",
      other: "Other Document",
    };
    return labels[docType] || docType;
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

  const onProfileSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate({ fullName: data.fullName });
  };

  const onPasswordSubmit = (data: PasswordFormData) => {
    updatePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/driver">
            <Button variant="ghost" className="mb-4 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Driver Profile</h1>
          <p className="text-muted-foreground">Manage your profile, documents, and compliance</p>
        </div>

        {/* Regulation Information - Collapsible */}
        <Collapsible className="mb-6">
          <Card className="border-amber-200 bg-amber-50/50">
            <CollapsibleTrigger className="w-full">
              <CardHeader className="hover:bg-amber-100/50 transition-colors">
                <CardTitle className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <span>Diesel Transport Regulations (&gt;1000 Litres)</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-600 transition-transform duration-200 data-[state=open]:rotate-90" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Alert className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Compliance Required</AlertTitle>
                  <AlertDescription>
                    In South Africa, trucks carrying more than 1000 litres of diesel are classified as transporting dangerous goods and must comply with Chapter 8 of the National Road Traffic Act, Regulation 276, and SANS 10231.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">1. Dangerous Goods Classification</h4>
                    <p className="text-muted-foreground">
                      Diesel above 1000 litres is treated as a hazardous material. Trucks must be registered as dangerous goods carriers under SANS 10231.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">2. Vehicle Requirements</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>Dangerous Goods Vehicle License</li>
                      <li>Hazard warning placards (UN 1202 for diesel)</li>
                      <li>Minimum of two approved fire extinguishers</li>
                      <li>Tanks must comply with SANS 1518</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">3. Driver Requirements</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>Professional Driving Permit (PrDP-D) for Dangerous Goods</li>
                      <li>Accredited Dangerous Goods Training</li>
                      <li>Medical Fitness Certificate</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">4. Documentation</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>Transport Emergency Card (TREMCARD)</li>
                      <li>Consignment Note</li>
                      <li>Operational Agreement (SANS 10231)</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">5. Insurance & Liability</h4>
                    <p className="text-muted-foreground">
                      Operators must carry civil liability insurance covering accidents, pollution, and environmental rehabilitation.
                    </p>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>References:</strong> National Road Traffic Act – Chapter 8, Regulation 276, SANS 10231, SANS 1518
                    </p>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <div className="grid gap-6">
          {/* Profile Picture & Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>Update your profile picture and personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                  {/* Profile Picture */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      {profile?.profile_photo_url ? (
                        (() => {
                          let imageSrc: string;
                          const photoUrl = profile.profile_photo_url;
                          
                          // Handle Supabase Storage format: bucket/path (e.g., "private-objects/uploads/uuid")
                          if (photoUrl.includes('/') && !photoUrl.startsWith('/') && !photoUrl.startsWith('http')) {
                            // Check if it's a private bucket (private-objects)
                            if (photoUrl.startsWith('private-objects/')) {
                              // Use our server endpoint for private objects (handles authentication)
                              const pathOnly = photoUrl.replace('private-objects/', '');
                              imageSrc = `/objects/${pathOnly}`;
                            } else {
                              // For public buckets, use Supabase public URL
                              imageSrc = `${import.meta.env.VITE_SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co'}/storage/v1/object/public/${photoUrl}`;
                            }
                          }
                          // Handle /objects/ path format
                          else if (photoUrl.startsWith('/objects/')) {
                            imageSrc = photoUrl;
                          }
                          // Handle full URLs
                          else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
                            imageSrc = photoUrl;
                          }
                          // Default: assume it's a relative path
                          else {
                            imageSrc = `/objects/${photoUrl}`;
                          }
                          
                          console.log("Profile photo URL:", photoUrl);
                          console.log("Constructed image src:", imageSrc);
                          
                          return (
                            <img
                              src={imageSrc}
                              alt="Profile"
                              className="h-24 w-24 rounded-full object-cover border-2 border-border"
                              onError={(e) => {
                                console.error("Failed to load profile image:", imageSrc);
                                console.error("Image error:", e);
                              }}
                              onLoad={() => {
                                console.log("Profile image loaded successfully:", imageSrc);
                              }}
                            />
                          );
                        })()
                      ) : (
                        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                          <User className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div>
                      <ObjectUploader
                        onGetUploadParameters={getUploadURL}
                        onComplete={handleProfilePictureUpload}
                        allowedFileTypes={["image/*"]}
                        maxFileSize={5242880} // 5MB
                        buttonVariant="outline"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Photo
                      </ObjectUploader>
                      <p className="text-xs text-muted-foreground mt-2">
                        JPG, PNG up to 5MB
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Full Name */}
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

                  <Button type="submit" disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Password Update */}
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
                <form
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  className="space-y-4"
                >
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
                  {/* ========== SECTION 1: DRIVER (PERSON) – IDENTITY & LEGAL ========== */}
                  <div className="space-y-6">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        1. Driver (Person) – Identity & Legal
                      </h2>
                    </div>

                    {/* A. Basic Profile */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">A. Basic Profile</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="driver_type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Driver Type *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select driver type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="individual">Individual</SelectItem>
                                  <SelectItem value="company_driver">Company Driver</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="mobile_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mobile Number *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter mobile number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

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
                    </div>

                    {/* B. SA ID / Passport */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">B. SA ID / Passport</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="id_type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ID Type *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select ID type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="SA_ID">South African ID</SelectItem>
                                  <SelectItem value="Passport">Passport</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="id_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ID Number / Passport Number *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter ID or passport number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {complianceForm.watch("id_type") === "Passport" && (
                        <FormField
                          control={complianceForm.control}
                          name="id_issue_country"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Passport Issue Country *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter country" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* ID Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">ID Document Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument(complianceForm.watch("id_type") === "SA_ID" ? "za_id" : "passport");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
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
                                  onComplete={(result) => handleDocumentUpload(
                                    complianceForm.watch("id_type") === "SA_ID" ? "za_id" : "passport",
                                    complianceForm.watch("id_type") === "SA_ID" ? "South African ID" : "Passport",
                                    result
                                  )}
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
                              onComplete={(result) => handleDocumentUpload(
                                complianceForm.watch("id_type") === "SA_ID" ? "za_id" : "passport",
                                complianceForm.watch("id_type") === "SA_ID" ? "South African ID" : "Passport",
                                result
                              )}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload {complianceForm.watch("id_type") === "SA_ID" ? "SA ID" : "Passport"} Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* C. Proof of Address */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">C. Proof of Address</h3>
                      
                      <FormField
                        control={complianceForm.control}
                        name="address_line_1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 1 *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Street address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={complianceForm.control}
                        name="address_line_2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 2 (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Apartment, suite, etc." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="City" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="province"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Province *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Province" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="postal_code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Postal Code *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Postal code" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="country"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Country" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* D. Driver's Licence */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">D. Driver's Licence</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="license_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Number *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter license number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="license_code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Code *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g., B, EB, C1, EC" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="license_issue_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Issue Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="license_expiry_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Expiry Date *</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* License Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Driver's License Document Upload *</h4>
                        {(() => {
                          const existingDoc = findDocument("drivers_license");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
                                  {existingDoc.expiry_date && ` | Expires: ${new Date(existingDoc.expiry_date).toLocaleDateString()}`}
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
                                  onComplete={(result) => handleDocumentUpload("drivers_license", "Driver's License", result)}
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
                              onComplete={(result) => handleDocumentUpload("drivers_license", "Driver's License", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Driver's License Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>

                    {/* E. Professional Driving Permit (PrDP) */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">E. Professional Driving Permit (PrDP – Dangerous Goods)</h3>
                      <p className="text-sm text-muted-foreground">For fuel transport, this is critical.</p>
                      
                      <FormField
                        control={complianceForm.control}
                        name="prdp_required"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>PrDP Required</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Required if you will transport fuel
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      {complianceForm.watch("prdp_required") && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={complianceForm.control}
                              name="prdp_number"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>PrDP Number *</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter PrDP number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={complianceForm.control}
                              name="prdp_category"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>PrDP Category *</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="e.g., Dangerous Goods" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={complianceForm.control}
                              name="prdp_issue_date"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>PrDP Issue Date *</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={complianceForm.control}
                              name="prdp_expiry_date"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>PrDP Expiry Date *</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* PrDP Document Upload */}
                          <div className="pt-4 border-t border-border">
                            <h4 className="text-sm font-semibold mb-3">PrDP Document Upload *</h4>
                            {(() => {
                              const existingDoc = findDocument("prdp");
                              return existingDoc ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm text-muted-foreground">
                                      Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
                                      {existingDoc.expiry_date && ` | Expires: ${new Date(existingDoc.expiry_date).toLocaleDateString()}`}
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
                                      onComplete={(result) => handleDocumentUpload("prdp", "Professional Driving Permit (PrDP-D)", result)}
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
                                  onComplete={(result) => handleDocumentUpload("prdp", "Professional Driving Permit (PrDP-D)", result)}
                                  allowedFileTypes={["application/pdf", "image/*"]}
                                  maxFileSize={10485760}
                                  buttonVariant="default"
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload PrDP Document
                                </ObjectUploader>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    {/* F. Dangerous Goods / Hazchem Training */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">F. Dangerous Goods / Hazchem Training</h3>
                      
                      <FormField
                        control={complianceForm.control}
                        name="dg_training_required"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Dangerous Goods Training Required</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Required for transporting fuel
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      {complianceForm.watch("dg_training_required") && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={complianceForm.control}
                              name="dg_training_provider"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Training Provider *</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter training provider name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={complianceForm.control}
                              name="dg_training_certificate_number"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Certificate Number *</FormLabel>
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
                              name="dg_training_issue_date"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Training Issue Date *</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={complianceForm.control}
                              name="dg_training_expiry_date"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Training Expiry Date (if applicable)</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* DG Training Document Upload */}
                          <div className="pt-4 border-t border-border">
                            <h4 className="text-sm font-semibold mb-3">Dangerous Goods Training Certificate Upload *</h4>
                            {(() => {
                              const existingDoc = findDocument("dangerous_goods_training", "Dangerous Goods Training Certificate");
                              return existingDoc ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm text-muted-foreground">
                                      Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
                                      {existingDoc.expiry_date && ` | Expires: ${new Date(existingDoc.expiry_date).toLocaleDateString()}`}
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
                                      onComplete={(result) => handleDocumentUpload("dangerous_goods_training", "Dangerous Goods Training Certificate", result)}
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
                                  onComplete={(result) => handleDocumentUpload("dangerous_goods_training", "Dangerous Goods Training Certificate", result)}
                                  allowedFileTypes={["application/pdf", "image/*"]}
                                  maxFileSize={10485760}
                                  buttonVariant="default"
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload Dangerous Goods Training Certificate
                                </ObjectUploader>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    {/* G. Criminal / Clearance */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">G. Criminal / Clearance</h3>
                      
                      <FormField
                        control={complianceForm.control}
                        name="criminal_check_done"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Criminal Check Completed</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      {complianceForm.watch("criminal_check_done") && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={complianceForm.control}
                              name="criminal_check_reference"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Criminal Check Reference *</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter reference number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={complianceForm.control}
                              name="criminal_check_date"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Criminal Check Date *</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Criminal Check Document Upload */}
                          <div className="pt-4 border-t border-border">
                            <h4 className="text-sm font-semibold mb-3">Criminal Clearance Document Upload *</h4>
                            {(() => {
                              const existingDoc = findDocument("criminal_check");
                              return existingDoc ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm text-muted-foreground">
                                      Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
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
                                      onComplete={(result) => handleDocumentUpload("criminal_check", "Criminal Clearance", result)}
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
                                  onComplete={(result) => handleDocumentUpload("criminal_check", "Criminal Clearance", result)}
                                  allowedFileTypes={["application/pdf", "image/*"]}
                                  maxFileSize={10485760}
                                  buttonVariant="default"
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload Criminal Clearance Document
                                </ObjectUploader>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ========== SECTION 2: DRIVER – BANK & PAYMENT DETAILS ========== */}
                  <div className="space-y-6 pt-4 border-t-2 border-primary/20">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Building className="h-5 w-5 text-primary" />
                        2. Driver – Bank & Payment Details
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        If you ever receive incentives, rebates, or commissions
                      </p>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="bank_account_holder"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Account Holder Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter account holder name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="bank_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bank Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter bank name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="account_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Account Number</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter account number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="branch_code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Branch Code</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter branch code" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Banking Proof Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Banking Proof Document Upload</h4>
                        {(() => {
                          const existingDoc = findDocument("banking_proof");
                          return existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Uploaded: {new Date(existingDoc.created_at).toLocaleDateString()}
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
                                  onComplete={(result) => handleDocumentUpload("banking_proof", "Banking Proof", result)}
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
                              onComplete={(result) => handleDocumentUpload("banking_proof", "Banking Proof", result)}
                              allowedFileTypes={["application/pdf", "image/*"]}
                              maxFileSize={10485760}
                              buttonVariant="default"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Banking Proof Document
                            </ObjectUploader>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ========== SECTION 3: COMPANY LINK ========== */}
                  <div className="space-y-6 pt-4 border-t-2 border-primary/20">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Building className="h-5 w-5 text-primary" />
                        3. Company Link
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        If driver is attached to a business
                      </p>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <FormField
                        control={complianceForm.control}
                        name="is_company_driver"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Company Driver</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Check if you work for a transport company or fuel buyer
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      {complianceForm.watch("is_company_driver") && (
                        <>
                          <FormField
                            control={complianceForm.control}
                            name="company_id"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Company ID</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    placeholder="Enter company UUID (e.g., a3d27256-cf59-447a-81c2-ce9babde91d5)" 
                                  />
                                </FormControl>
                                <FormDescription className="text-xs text-muted-foreground">
                                  Must be a valid UUID format. This should reference a customer/company ID from the system.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={complianceForm.control}
                            name="role_in_company"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Role in Company</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="e.g., Driver, Owner-Driver" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
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

