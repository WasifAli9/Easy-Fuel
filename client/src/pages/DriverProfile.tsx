import { useState, useEffect } from "react";
import { useForm, type Control } from "react-hook-form";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { User, Lock, Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Shield, Building, MapPin, Loader2, Menu, Calendar as CalendarIcon } from "lucide-react";
import { downloadStoredDocument } from "@/lib/download-document";
import {
  COMPLIANCE_DOCUMENT_MIME,
  complianceDocumentDownloadMeta,
  compliancePdfOnlyError,
  isCompliancePdfUpload,
} from "@/lib/compliance-document-upload";
import { normalizeProfilePhotoUrl, cn } from "@/lib/utils";
import { normalizeDocuments } from "@/lib/document-normalize";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";
import { extractUploadObjectPath } from "@/lib/upload-object-path";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DashboardSidebarAside } from "@/components/dashboard/DashboardSidebar";
import { DriverWorkspaceSidebar } from "@/components/dashboard/DriverWorkspaceSidebar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

function mergeStreetAddress(line1?: string | null, line2?: string | null): string {
  const a = (line1 ?? "").trim();
  const b = (line2 ?? "").trim();
  if (!b) return a;
  if (!a) return b;
  return `${a}, ${b}`;
}

function parseLocalYmd(ymd: string | undefined): Date | undefined {
  if (!ymd?.trim()) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Parse JSON body from apiRequest errors like `400: {"error":"..."}`. */
function parseApiErrorJson(error: unknown): Record<string, any> | null {
  const msg = error instanceof Error ? error.message : String(error);
  const idx = msg.indexOf("{");
  if (idx === -1) return null;
  try {
    return JSON.parse(msg.slice(idx));
  } catch {
    return null;
  }
}

function ComplianceDateField({
  control,
  name,
  label,
}: {
  control: Control<any>;
  name: string;
  label: string;
}) {
  const required = label.trimEnd().endsWith("*");
  const displayLabel = required ? label.replace(/\s*\*$/, "").trimEnd() : label;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected = parseLocalYmd(field.value);
        return (
          <FormItem>
            <FormLabel>
              {displayLabel}
              {required ? <span className="text-destructive"> *</span> : null}
            </FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full pl-3 text-left font-normal h-9",
                      !field.value && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                    {selected
                      ? selected.toLocaleDateString("en-ZA", { dateStyle: "medium" })
                      : "Pick a date"}
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selected}
                  onSelect={(d) => field.onChange(d ? formatLocalYmd(d) : "")}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  phone: z.string().optional(),
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submitKycDialogOpen, setSubmitKycDialogOpen] = useState(false);

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/driver/profile"],
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  });

  const normalizedProfile = profile
    ? {
        ...profile,
        full_name: profile.full_name ?? profile.fullName ?? "",
        profile_photo_url: profile.profile_photo_url ?? profile.profilePhotoUrl ?? null,
      }
    : null;
  
  // Debug: Log profile data to see what we're getting
  console.log("Driver Profile Data:", normalizedProfile);
  console.log("Profile Photo URL:", normalizedProfile?.profile_photo_url);

  const { data: documents = [] } = useQuery<DriverDocument[]>({
    queryKey: ["/api/driver/documents"],
    refetchInterval: 5000, // Refetch every 5 seconds to get updated status
  });

  const normalizedDocuments = normalizeDocuments(documents as any[]) as DriverDocument[];

  // Listen for document status updates and KYC approval via WebSocket
  useWebSocket((message) => {
    if (message.type === "document_approved" || message.type === "document_rejected" || 
        message.type === "kyc_approved" || message.type === "compliance_approved" ||
        message.type === "kyc_rejected" || message.type === "kyc_submitted") {
      console.log("[DriverProfile] Received WebSocket message:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/kyc-readiness"] });
      queryClient.refetchQueries({ queryKey: ["/api/driver/documents"] });
      queryClient.refetchQueries({ queryKey: ["/api/driver/profile"] });
    }
  });

  // Get compliance status
  const { data: complianceStatus } = useQuery<any>({
    queryKey: ["/api/driver/compliance/status"],
  });

  const { data: kycReadiness, isLoading: kycReadinessLoading } = useQuery<any>({
    queryKey: ["/api/driver/compliance/kyc-readiness"],
    refetchInterval: 8000,
  });

  // Helper function to find document by type
  const findDocument = (docType: string, title?: string) => {
    return normalizedDocuments.find((d) => {
      if (d.doc_type !== docType) return false;
      if (title && d.title !== title) return false;
      return true;
    });
  };

  // Compliance form — do not use the `values` prop: profile polls every 5s and that
  // forced re-sync was kicking focus out of inputs after 1–2 keystrokes.
  const complianceForm = useForm<any>({
    defaultValues: {
      id_type: "",
      id_number: "",
      id_issue_country: "",
      address_line_1: "",
      city: "",
      province: "",
      postal_code: "",
      country: "South Africa",
      license_number: "",
      license_code: "",
      license_issue_date: "",
      license_expiry_date: "",
      prdp_required: false,
      prdp_number: "",
      prdp_category: "",
      prdp_issue_date: "",
      prdp_expiry_date: "",
      dg_training_required: false,
      dg_training_provider: "",
      dg_training_certificate_number: "",
      dg_training_issue_date: "",
      dg_training_expiry_date: "",
      criminal_check_done: false,
      criminal_check_reference: "",
      criminal_check_date: "",
      bank_account_holder: "",
      bank_name: "",
      account_number: "",
      branch_code: "",
    },
  });

  const { isDirty: complianceIsDirty } = complianceForm.formState;

  useEffect(() => {
    if (!profile) return;
    if (complianceIsDirty) return;
    complianceForm.reset({
      id_type: profile.id_type || "",
      id_number: profile.id_number || "",
      id_issue_country: profile.id_issue_country || "",
      address_line_1: mergeStreetAddress(profile.address_line_1, profile.address_line_2),
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
    });
  }, [profile, complianceIsDirty]);

  const updateComplianceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", "/api/driver/compliance", data);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        return (await res.json()) as Record<string, unknown>;
      }
      return null;
    },
    onSuccess: async (responseData) => {
      // Mark form clean with values just saved so polling cannot fight mid-edit state.
      complianceForm.reset(complianceForm.getValues());
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
            bank_account_holder: responseData.bank_account_holder || oldData.bank_account_holder || oldData.bank_account_name || "",
          };
        });
      }
      
      // Invalidate and refetch to get updated data
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/kyc-readiness"] });
      await queryClient.refetchQueries({ queryKey: ["/api/driver/profile"] });
      
      toast({
        title: "Success",
        description: "Draft saved. Submit KYC when your checklist is complete.",
      });
    },
    onError: (error: any) => {
      console.error("Compliance update error:", error);
      const body = parseApiErrorJson(error);
      const errorMessage =
        body?.error ||
        error.details?.join?.(", ") ||
        error.message ||
        "Failed to update compliance information";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const submitKycMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/driver/compliance/submit-kyc");
      return res.json();
    },
    onSuccess: async () => {
      setSubmitKycDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/kyc-readiness"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      toast({
        title: "KYC submitted",
        description: "Your package has been sent for admin review.",
      });
    },
    onError: (error: any) => {
      const body = parseApiErrorJson(error);
      const base = body?.error || error?.message || "Failed to submit KYC";
      const parts: string[] = [base];
      const md = body?.missing_docs ?? body?.missingDocs;
      const mf = body?.missing_fields ?? body?.missingFields;
      if (Array.isArray(md) && md.length) parts.push(`Missing documents: ${md.join(", ")}`);
      if (Array.isArray(mf) && mf.length) parts.push(`Missing fields: ${mf.join(", ")}`);
      toast({
        title: "Cannot submit KYC",
        description: parts.join(" — "),
        variant: "destructive",
      });
    },
  });

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: "",
      phone: "",
    },
    values: normalizedProfile ? {
      fullName: normalizedProfile.full_name || "",
      phone: normalizedProfile.phone || normalizedProfile.mobile_number || "",
    } : {
      fullName: "",
      phone: "",
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
    mutationFn: async (data: { fullName: string; phone?: string }) => {
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
      await updatePassword(data.newPassword, data.currentPassword);
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

        // Local object upload endpoint format:
        // /api/object-storage/upload/private/<id>
        if (!objectPath && pathOnly.startsWith("/api/object-storage/upload/")) {
          objectPath = pathOnly;
          console.log("Using object-storage upload URL as objectPath:", objectPath);
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

  const downloadComplianceDocument = async (doc: {
    file_path: string;
    title?: string;
    mime_type?: string | null;
  }) => {
    toast({
      title: "Downloading",
      description: "Please wait while the document is being downloaded.",
    });
    try {
      await downloadStoredDocument(
        doc.file_path,
        complianceDocumentDownloadMeta({
          title: doc.title,
          mime_type: doc.mime_type ?? COMPLIANCE_DOCUMENT_MIME,
        }),
      );
      toast({
        title: "Download complete",
        description: "Your document has been saved to your device.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download document",
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
    const uploadedMime = String(uploadedFile.type || "").toLowerCase().split(";")[0].trim();
    if (!isCompliancePdfUpload(uploadedMime, uploadedFile.name)) {
      toast({
        title: "PDF only",
        description: compliancePdfOnlyError(),
        variant: "destructive",
      });
      return;
    }
    const documentURL = extractUploadObjectPath(uploadedFile);
    if (!documentURL) {
      toast({
        title: "Error",
        description: "Could not resolve uploaded file path",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("PUT", "/api/documents", { documentURL });
      const { objectPath } = await response.json();
      
      await apiRequest("POST", "/api/driver/documents", {
        doc_type: docType,
        title: title || uploadedFile.name,
        file_path: objectPath,
        file_size: uploadedFile.size,
        mime_type: COMPLIANCE_DOCUMENT_MIME,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/compliance/kyc-readiness"] });
      
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
        return <Badge variant="secondary">Pending</Badge>;
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
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
        <main className="w-full min-w-0 px-5 sm:px-8 lg:px-10 py-4 sm:py-8">
          <div className="text-center py-8 text-muted-foreground">Loading profile...</div>
        </main>
      </div>
    );
  }

  const onProfileSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate({
      fullName: data.fullName,
      phone: data.phone?.trim() ?? "",
    });
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
      
      <div className="flex flex-1 min-h-0">
        <DashboardSidebarAside aria-label="Driver navigation">
          <DriverWorkspaceSidebar active={null} />
        </DashboardSidebarAside>

        <Button
          variant="outline"
          size="icon"
          className="md:hidden fixed bottom-4 right-4 z-40 rounded-full shadow-lg"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="w-[min(100vw-2rem,288px)] p-0 overflow-hidden flex flex-col bg-sidebar border-r border-sidebar-border"
          >
            <div className="flex flex-col h-full min-h-0">
              <DriverWorkspaceSidebar
                active={null}
                onNavigate={() => setSidebarOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 overflow-auto dashboard-main-area">
          <div className="w-full min-w-0 px-5 sm:px-8 lg:px-10 py-4 sm:py-8">
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

        {/* Regulation Information - Collapsible (light: pale amber panel; dark: deep amber so theme text contrasts) */}
        <Collapsible className="mb-6">
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800/80 dark:bg-amber-950/85 dark:text-amber-50">
            <CollapsibleTrigger className="w-full">
              <CardHeader className="hover:bg-amber-100/50 dark:hover:bg-amber-900/40 transition-colors">
                <CardTitle className="flex items-center justify-between gap-2 text-amber-950 dark:text-amber-50">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Diesel Transport Regulations (&gt;1000 Litres)</span>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300 transition-transform duration-200 data-[state=open]:rotate-90" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="text-amber-950 dark:text-amber-100">
                <Alert className="mb-4 border-amber-200/80 bg-amber-100/60 dark:border-amber-800 dark:bg-amber-900/50 [&>svg]:text-amber-700 dark:[&>svg]:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-amber-950 dark:text-amber-50">Compliance Required</AlertTitle>
                  <AlertDescription className="text-amber-900 dark:text-amber-100/90">
                    In South Africa, trucks carrying more than 1000 litres of diesel are classified as transporting dangerous goods and must comply with Chapter 8 of the National Road Traffic Act, Regulation 276, and SANS 10231.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2 text-amber-950 dark:text-amber-50">1. Dangerous Goods Classification</h4>
                    <p className="text-amber-900/90 dark:text-amber-200/95">
                      Diesel above 1000 litres is treated as a hazardous material. Trucks must be registered as dangerous goods carriers under SANS 10231.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 text-amber-950 dark:text-amber-50">2. Vehicle Requirements</h4>
                    <ul className="list-disc list-inside space-y-1 text-amber-900/90 dark:text-amber-200/95">
                      <li>Dangerous Goods Vehicle License</li>
                      <li>Hazard warning placards (UN 1202 for diesel)</li>
                      <li>Minimum of two approved fire extinguishers</li>
                      <li>Tanks must comply with SANS 1518</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 text-amber-950 dark:text-amber-50">3. Driver Requirements</h4>
                    <ul className="list-disc list-inside space-y-1 text-amber-900/90 dark:text-amber-200/95">
                      <li>Professional Driving Permit (PrDP-D) for Dangerous Goods</li>
                      <li>Accredited Dangerous Goods Training</li>
                      <li>Medical Fitness Certificate</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 text-amber-950 dark:text-amber-50">4. Documentation</h4>
                    <ul className="list-disc list-inside space-y-1 text-amber-900/90 dark:text-amber-200/95">
                      <li>Transport Emergency Card (TREMCARD)</li>
                      <li>Consignment Note</li>
                      <li>Operational Agreement (SANS 10231)</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 text-amber-950 dark:text-amber-50">5. Insurance & Liability</h4>
                    <p className="text-amber-900/90 dark:text-amber-200/95">
                      Operators must carry civil liability insurance covering accidents, pollution, and environmental rehabilitation.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-amber-200/80 dark:border-amber-800">
                    <p className="text-xs text-amber-800 dark:text-amber-300/90">
                      <strong className="text-amber-950 dark:text-amber-100">References:</strong> National Road Traffic Act – Chapter 8, Regulation 276, SANS 10231, SANS 1518
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
                      {normalizedProfile?.profile_photo_url ? (
                        (() => {
                          const imageSrc = normalizeProfilePhotoUrl(normalizedProfile.profile_photo_url);
                          
                          if (!imageSrc) {
                            return null;
                          }
                          
                          return (
                            <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
                              <img
                                src={imageSrc}
                                alt="Profile"
                                className="w-full h-full object-cover object-center"
                                onError={(e) => {
                                  // Suppress image load errors
                                  console.error("Image error:", e);
                                }}
                                onLoad={() => {
                                  console.log("Profile image loaded successfully:", imageSrc);
                                }}
                              />
                            </div>
                          );
                        })()
                      ) : (
                        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center border-2 border-border flex-shrink-0">
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

                  <FormField
                    control={profileForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter your mobile number" inputMode="tel" autoComplete="tel" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                  Your compliance status and document checklist. Uploads stay as drafts until you submit your KYC package.
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

                {(() => {
                  const pkgAt =
                    complianceStatus.package_submitted_at ?? complianceStatus.packageSubmittedAt;
                  const awaitingRev =
                    !!pkgAt && complianceStatus.overallStatus === "pending";
                  if (complianceStatus.overallStatus === "approved") return null;
                  if (awaitingRev) {
                    return (
                      <Alert>
                        <FileText className="h-4 w-4" />
                        <AlertTitle>Submitted for admin review</AlertTitle>
                        <AlertDescription>
                          Your KYC package is pending. Editing is locked until an admin approves or rejects it.
                        </AlertDescription>
                      </Alert>
                    );
                  }
                  return (
                    <Alert>
                      <AlertTitle>Draft mode</AlertTitle>
                      <AlertDescription>
                        Save fields and upload documents as drafts. Admins are notified only after you use Submit KYC.
                      </AlertDescription>
                    </Alert>
                  );
                })()}

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
                Save your answers as a draft with the button below. When every required field and document is complete, submit your full KYC package for review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...complianceForm}>
                <form 
                  onSubmit={complianceForm.handleSubmit((data) =>
                    updateComplianceMutation.mutate({ ...data, address_line_2: "" }),
                  )}
                  className="space-y-8"
                >
                  {/* Banking first — required for KYC submit */}
                  <div id="banking" className="space-y-6 scroll-mt-24">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Building className="h-5 w-5 text-primary" />
                        Banking details
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Required to submit KYC. Used for payouts, incentives, rebates, or commissions.
                        Fields marked with <span className="text-destructive font-semibold">*</span> are required.
                      </p>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="bank_account_holder"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Account holder name <span className="text-destructive">*</span>
                              </FormLabel>
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
                              <FormLabel>
                                Bank name <span className="text-destructive">*</span>
                              </FormLabel>
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
                              <FormLabel>
                                Account number <span className="text-destructive">*</span>
                              </FormLabel>
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
                              <FormLabel>
                                Branch code <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Enter branch code" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">
                          Banking Proof Document Upload <span className="text-destructive">*</span>
                        </h4>
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
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadComplianceDocument(existingDoc)}
                                >
                                  Download
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("banking_proof", "Banking Proof", result)}
                                  allowedFileTypes={["application/pdf"]}
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
                              allowedFileTypes={["application/pdf"]}
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

                  {/* ========== SECTION 1: DRIVER (PERSON) – IDENTITY & LEGAL ========== */}
                  <div className="space-y-6">
                    <div className="border-b-2 border-primary/20 pb-3">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        1. Driver (Person) – Identity & Legal
                      </h2>
                    </div>

                    {/* A. SA ID / Passport */}
                    <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                      <h3 className="text-lg font-semibold text-primary">A. SA ID / Passport</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="id_type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ID Type <span className="text-destructive">*</span></FormLabel>
                              <FormControl>
                                <select
                                  className={cn(
                                    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                    "disabled:cursor-not-allowed disabled:opacity-50",
                                  )}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  onBlur={field.onBlur}
                                  ref={field.ref}
                                >
                                  <option value="">Select ID type</option>
                                  <option value="SA_ID">SA_ID</option>
                                  <option value="Passport">Passport</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={complianceForm.control}
                          name="id_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ID Number / Passport Number <span className="text-destructive">*</span></FormLabel>
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
                              <FormLabel>Passport Issue Country</FormLabel>
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
                        <h4 className="text-sm font-semibold mb-3">ID Document Upload <span className="text-destructive">*</span></h4>
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
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadComplianceDocument(existingDoc)}
                                >
                                  Download
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload(
                                    complianceForm.watch("id_type") === "SA_ID" ? "za_id" : "passport",
                                    complianceForm.watch("id_type") === "SA_ID" ? "South African ID" : "Passport",
                                    result
                                  )}
                                  allowedFileTypes={["application/pdf"]}
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
                              allowedFileTypes={["application/pdf"]}
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
                      <h3 className="text-lg font-semibold text-primary">B. Proof of Address</h3>
                      
                      <FormField
                        control={complianceForm.control}
                        name="address_line_1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street address <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Street, unit, building (one line)" />
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
                              <FormLabel>City <span className="text-destructive">*</span></FormLabel>
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
                              <FormLabel>Province <span className="text-destructive">*</span></FormLabel>
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
                              <FormLabel>Postal Code <span className="text-destructive">*</span></FormLabel>
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
                              <FormLabel>Country</FormLabel>
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
                      <h3 className="text-lg font-semibold text-primary">C. Driver's Licence</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={complianceForm.control}
                          name="license_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Number <span className="text-destructive">*</span></FormLabel>
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
                              <FormLabel>License Code <span className="text-destructive">*</span></FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g., B, EB, C1, EC" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ComplianceDateField
                          control={complianceForm.control}
                          name="license_issue_date"
                          label="License Issue Date *"
                        />

                        <ComplianceDateField
                          control={complianceForm.control}
                          name="license_expiry_date"
                          label="License Expiry Date *"
                        />
                      </div>

                      {/* License Document Upload */}
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3">Driver's License Document Upload <span className="text-destructive">*</span></h4>
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
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadComplianceDocument(existingDoc)}
                                >
                                  Download
                                </Button>
                                <ObjectUploader
                                  onGetUploadParameters={getUploadURL}
                                  onComplete={(result) => handleDocumentUpload("drivers_license", "Driver's License", result)}
                                  allowedFileTypes={["application/pdf"]}
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
                              allowedFileTypes={["application/pdf"]}
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
                      <h3 className="text-lg font-semibold text-primary">D. Professional Driving Permit (PrDP – Dangerous Goods)</h3>
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
                                  <FormLabel>PrDP Number <span className="text-destructive">*</span></FormLabel>
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
                                  <FormLabel>PrDP Category <span className="text-destructive">*</span></FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="e.g., Dangerous Goods" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ComplianceDateField
                              control={complianceForm.control}
                              name="prdp_issue_date"
                              label="PrDP Issue Date *"
                            />

                            <ComplianceDateField
                              control={complianceForm.control}
                              name="prdp_expiry_date"
                              label="PrDP Expiry Date *"
                            />
                          </div>

                          {/* PrDP Document Upload */}
                          <div className="pt-4 border-t border-border">
                            <h4 className="text-sm font-semibold mb-3">PrDP Document Upload <span className="text-destructive">*</span></h4>
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
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadComplianceDocument(existingDoc)}
                                    >
                                      Download
                                    </Button>
                                    <ObjectUploader
                                      onGetUploadParameters={getUploadURL}
                                      onComplete={(result) => handleDocumentUpload("prdp", "Professional Driving Permit (PrDP-D)", result)}
                                      allowedFileTypes={["application/pdf"]}
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
                                  allowedFileTypes={["application/pdf"]}
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
                      <h3 className="text-lg font-semibold text-primary">E. Dangerous Goods / Hazchem Training</h3>
                      
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
                                  <FormLabel>Training Provider <span className="text-destructive">*</span></FormLabel>
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
                                  <FormLabel>Certificate Number <span className="text-destructive">*</span></FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter certificate number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ComplianceDateField
                              control={complianceForm.control}
                              name="dg_training_issue_date"
                              label="Training Issue Date *"
                            />

                            <ComplianceDateField
                              control={complianceForm.control}
                              name="dg_training_expiry_date"
                              label="Training Expiry Date *"
                            />
                          </div>

                          {/* DG Training Document Upload */}
                          <div className="pt-4 border-t border-border">
                            <h4 className="text-sm font-semibold mb-3">Dangerous Goods Training Certificate Upload <span className="text-destructive">*</span></h4>
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
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadComplianceDocument(existingDoc)}
                                    >
                                      Download
                                    </Button>
                                    <ObjectUploader
                                      onGetUploadParameters={getUploadURL}
                                      onComplete={(result) => handleDocumentUpload("dangerous_goods_training", "Dangerous Goods Training Certificate", result)}
                                      allowedFileTypes={["application/pdf"]}
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
                                  allowedFileTypes={["application/pdf"]}
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
                      <h3 className="text-lg font-semibold text-primary">F. Criminal / Clearance</h3>
                      <p className="text-sm text-muted-foreground">
                        Optional unless you have completed a criminal clearance check.
                      </p>
                      
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
                                  <FormLabel>Criminal Check Reference <span className="text-destructive">*</span></FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter reference number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <ComplianceDateField
                              control={complianceForm.control}
                              name="criminal_check_date"
                              label="Criminal Check Date *"
                            />
                          </div>

                          {/* Criminal Check Document Upload */}
                          <div className="pt-4 border-t border-border">
                            <h4 className="text-sm font-semibold mb-3">Criminal Clearance Document Upload <span className="text-destructive">*</span></h4>
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
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadComplianceDocument(existingDoc)}
                                    >
                                      Download
                                    </Button>
                                    <ObjectUploader
                                      onGetUploadParameters={getUploadURL}
                                      onComplete={(result) => handleDocumentUpload("criminal_check", "Criminal Clearance", result)}
                                      allowedFileTypes={["application/pdf"]}
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
                                  allowedFileTypes={["application/pdf"]}
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

                  <div className="pt-6 border-t-2 border-primary/20 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Button type="submit" size="lg" disabled={updateComplianceMutation.isPending} className="w-full sm:w-auto">
                      {updateComplianceMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save draft"
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="default"
                      className="w-full sm:w-auto"
                      disabled={
                        submitKycMutation.isPending ||
                        kycReadinessLoading ||
                        !(kycReadiness?.can_submit ?? kycReadiness?.canSubmit)
                      }
                      onClick={() => setSubmitKycDialogOpen(true)}
                    >
                      {submitKycMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        "Submit KYC"
                      )}
                    </Button>
                    <AlertDialog open={submitKycDialogOpen} onOpenChange={setSubmitKycDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Submit KYC for review?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your documents and details will be sent to an admin for review. You will not be able to
                            edit this package while it is pending. Make sure everything is correct before continuing.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={submitKycMutation.isPending}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={submitKycMutation.isPending}
                            onClick={(e) => {
                              e.preventDefault();
                              submitKycMutation.mutate();
                            }}
                          >
                            {submitKycMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              "Yes, submit KYC"
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {kycReadiness &&
                    !(kycReadiness.can_submit ?? kycReadiness.canSubmit) &&
                    (() => {
                      const pkgAt =
                        kycReadiness.package_submitted_at ?? kycReadiness.packageSubmittedAt;
                      const pend =
                        (kycReadiness.overall_status ?? kycReadiness.overallStatus) === "pending";
                      if (pkgAt && pend) {
                        return (
                          <p className="text-sm text-muted-foreground">
                            Your package is already submitted and awaiting review.
                          </p>
                        );
                      }
                      if ((kycReadiness.overall_status ?? kycReadiness.overallStatus) === "approved") {
                        return (
                          <p className="text-sm text-muted-foreground">
                            Your KYC is already approved. Submit KYC is not needed.
                          </p>
                        );
                      }
                      const md = kycReadiness.missing_docs ?? kycReadiness.missingDocs ?? [];
                      const mf = kycReadiness.missing_fields ?? kycReadiness.missingFields ?? [];
                      return (
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>Complete the items below, then click Save draft before Submit KYC.</p>
                          {Array.isArray(md) && md.length > 0 && (
                            <p>
                              Missing documents:{" "}
                              {md
                                .map(
                                  (k: string) =>
                                    ({
                                      za_id: "SA ID document",
                                      passport: "Passport document",
                                      za_id_or_passport: "ID or passport document",
                                      drivers_license: "Driver's licence document",
                                      banking_proof: "Banking proof document",
                                      criminal_check: "Criminal clearance document",
                                      prdp: "PrDP document",
                                      dangerous_goods_training:
                                        "Dangerous goods training certificate",
                                      proof_of_address: "Proof of address document",
                                    }[k] ?? k),
                                )
                                .join(", ")}
                            </p>
                          )}
                          {Array.isArray(mf) && mf.length > 0 && (
                            <p>
                              Missing fields:{" "}
                              {mf
                                .map(
                                  (k: string) =>
                                    ({
                                      address_line_1: "Street address",
                                      city: "City",
                                      province: "Province",
                                      postal_code: "Postal code",
                                      id_type: "ID type",
                                      za_id_number: "ID number",
                                      passport_number: "Passport number",
                                      drivers_license_number: "Licence number",
                                      license_code: "Licence code",
                                      drivers_license_issue_date: "Licence issue date",
                                      drivers_license_expiry: "Licence expiry date",
                                      bank_account_name: "Account holder name",
                                      bank_name: "Bank name",
                                      account_number: "Account number",
                                      branch_code: "Branch code",
                                      criminal_check_reference: "Criminal check reference",
                                      criminal_check_date: "Criminal check date",
                                    }[k] ?? k),
                                )
                                .join(", ")}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
          </div>
        </main>
      </div>
    </div>
  );
}

