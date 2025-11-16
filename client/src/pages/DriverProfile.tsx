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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { User, Lock, Upload, FileText, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

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
  });
  
  // Debug: Log profile data to see what we're getting
  console.log("Driver Profile Data:", profile);
  console.log("Profile Photo URL:", profile?.profile_photo_url);

  const { data: documents = [] } = useQuery<DriverDocument[]>({
    queryKey: ["/api/driver/documents"],
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
    
    // The server upload endpoint returns { objectPath, uploadURL, location, url }
    // objectPath is in bucket/path format which is what we need
    let objectPath: string | undefined;
    
    // Try to get objectPath from the response body first (this is the correct format)
    if (uploadedFile?.response) {
      try {
        const responseData = typeof uploadedFile.response === 'string' 
          ? JSON.parse(uploadedFile.response) 
          : uploadedFile.response;
        // Prefer objectPath (bucket/path format) - this is what the server returns
        objectPath = responseData?.objectPath || responseData?.fullPath;
        console.log("Extracted objectPath from response:", objectPath);
      } catch (e) {
        console.warn("Could not parse response:", e);
      }
    }
    
    // If we don't have objectPath from response, try to extract from uploadURL
    if (!objectPath) {
      let uploadURL = uploadedFile?.uploadURL || uploadedFile?.response?.uploadURL;
      
      // If uploadURL is the full endpoint path, extract bucket/path from it
      // The format should be: /api/storage/upload/bucket/path
      if (uploadURL && uploadURL.startsWith('/api/storage/upload/')) {
        const pathMatch = uploadURL.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
        if (pathMatch) {
          const [, bucket, path] = pathMatch;
          objectPath = `${bucket}/${path}`;
          console.log("Extracted bucket/path from uploadURL:", objectPath);
        } else {
          // If bucket is missing, use default bucket
          const defaultBucket = "private-objects";
          const pathMatch = uploadURL.match(/\/api\/storage\/upload\/(.+)/);
          if (pathMatch) {
            const [, path] = pathMatch;
            objectPath = `${defaultBucket}/${path}`;
            console.log("Extracted path from uploadURL (using default bucket):", objectPath);
          }
        }
      }
    }
    
    // Use objectPath as uploadURL for the rest of the function
    const uploadURL = objectPath;
    
    if (!uploadURL) {
      console.error("No upload URL in upload result:", uploadedFile);
      toast({
        title: "Error",
        description: "Could not get file URL from upload. Please check the console for details.",
        variant: "destructive",
      });
      return;
    }

    try {
      let objectPath: string;
      
      // Helper function to check if a string is a valid URL
      const isValidURL = (str: string): boolean => {
        try {
          new URL(str);
          return true;
        } catch {
          return false;
        }
      };
      
      // Check if this is a Supabase Storage upload endpoint (starts with /api/storage/upload)
      // The upload URL format is: /api/storage/upload/bucket/path
      // We need to extract bucket/path and use that as the storage path
      if (uploadURL.startsWith('/api/storage/upload/')) {
        const pathMatch = uploadURL.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
        if (pathMatch) {
          const [, bucket, path] = pathMatch;
          // Store as bucket/path format for Supabase Storage
          objectPath = `${bucket}/${path}`;
          console.log("Extracted Supabase Storage path:", objectPath);
        } else {
          throw new Error("Could not parse Supabase storage path from upload URL");
        }
      }
      // Check if this is a Supabase Storage upload (bucket/path format) - not a full URL
      else if (uploadURL.includes('/') && !isValidURL(uploadURL) && !uploadURL.startsWith('/objects/') && !uploadURL.startsWith('http')) {
        // Likely Supabase Storage format: bucket/path (e.g., "private-objects/uploads/uuid")
        objectPath = uploadURL;
      }
      // For Replit/S3 storage, extract path from URL
      else if (isValidURL(uploadURL)) {
        // Try to extract path from Google Cloud Storage URL
        if (uploadURL.includes('storage.googleapis.com')) {
          try {
            const url = new URL(uploadURL);
            objectPath = url.pathname;
          } catch (e) {
            console.warn("Failed to parse Google Cloud Storage URL:", e);
            objectPath = uploadURL;
          }
        } 
        // Try to extract path from S3 URL
        else if (uploadURL.includes('.s3.') || uploadURL.includes('s3://')) {
          try {
            const url = new URL(uploadURL.split('?')[0]);
            const pathParts = url.pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
              objectPath = '/' + pathParts.join('/');
            } else {
              objectPath = uploadURL;
            }
          } catch (e) {
            console.warn("Failed to parse S3 URL:", e);
            const match = uploadURL.match(/\/private-objects\/uploads\/[^?]+/);
            objectPath = match ? match[0] : uploadURL.split('?')[0];
          }
        }
        // For other valid URLs, try to extract path
        else {
          try {
            const url = new URL(uploadURL);
            objectPath = url.pathname || uploadURL;
          } catch (e) {
            console.warn("Failed to parse URL:", e);
            objectPath = uploadURL;
          }
        }
      }
      // If it's already a path starting with /, use it directly
      else if (uploadURL.startsWith('/')) {
        objectPath = uploadURL.split('?')[0];
      } 
      // Fallback: use the uploadURL as-is
      else {
        objectPath = uploadURL;
      }
      
      console.log("Extracted objectPath:", objectPath);

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
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
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
      other: "Other Document",
    };
    return labels[docType] || docType;
  };

  const requiredDocuments = [
    { type: "prdp", label: "Professional Driving Permit (PrDP-D)", required: true },
    { type: "safety_certificate", label: "Dangerous Goods Training Certificate", required: true, title: "Dangerous Goods Training Certificate" },
    { type: "other", label: "Medical Fitness Certificate", required: true, title: "Medical Fitness Certificate" },
    { type: "drivers_license", label: "Driver's License", required: true },
  ];

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
                          
                          // Handle Supabase Storage format: bucket/path
                          if (photoUrl.includes('/') && !photoUrl.startsWith('/') && !photoUrl.startsWith('http')) {
                            imageSrc = `${import.meta.env.VITE_SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co'}/storage/v1/object/public/${photoUrl}`;
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

          {/* Required Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Required Documents
              </CardTitle>
              <CardDescription>
                Upload your compliance documents for diesel transport &gt;1000L
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {requiredDocuments.map((doc) => {
                // Find existing document by type and title (if title is specified)
                const existingDoc = documents.find((d) => {
                  if (d.doc_type !== doc.type) return false;
                  if (doc.title && d.title !== doc.title) return false;
                  return true;
                });
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
                            onComplete={(result) => handleDocumentUpload(doc.type, doc.title || doc.label, result)}
                            allowedFileTypes={["application/pdf", "image/*"]}
                            maxFileSize={10485760} // 10MB
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
                            onComplete={(result) => handleDocumentUpload(doc.type, doc.title || doc.label, result)}
                            allowedFileTypes={["application/pdf", "image/*"]}
                            maxFileSize={10485760} // 10MB
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

