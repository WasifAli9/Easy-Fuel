import { useQuery } from "@tanstack/react-query";
import { Upload, User } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeProfilePhotoUrl } from "@/lib/utils";
import {
  getObjectUploadParameters,
  saveProfilePhotoFromUpload,
  type ProfilePhotoSaveTarget,
} from "@/lib/profile-photo-upload";

type ProfilePhotoUploadProps = {
  photoUrl?: string | null;
  profilePutPath: ProfilePhotoSaveTarget;
};

export function ProfilePhotoUpload({ photoUrl, profilePutPath }: ProfilePhotoUploadProps) {
  const { toast } = useToast();
  const { refetchProfile } = useAuth();

  const displayUrl = useQuery({
    queryKey: ["/api/objects/presigned-url", "profile-photo-web", photoUrl],
    enabled: Boolean(photoUrl),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const normalized = normalizeProfilePhotoUrl(photoUrl);
      if (!normalized) return null;
      if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
        return normalized;
      }
      const res = await fetch("/api/objects/presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ objectPath: normalized }),
      });
      if (!res.ok) return normalized;
      const data = await res.json();
      return (data.signedUrl as string) || normalized;
    },
  });

  const imageSrc = displayUrl.data || normalizeProfilePhotoUrl(photoUrl) || undefined;

  const handleComplete = async (result: {
    successful?: Array<{
      uploadURL?: string;
      response?: { body?: unknown; data?: unknown } & Record<string, unknown>;
    }>;
    failed?: Array<{ error?: string }>;
  }) => {
    if (!result.successful?.length) {
      const err = result.failed?.[0]?.error || "File upload failed.";
      toast({ title: "Error", description: err, variant: "destructive" });
      return;
    }
    try {
      await saveProfilePhotoFromUpload(result.successful[0], profilePutPath);
      await refetchProfile();
      toast({ title: "Success", description: "Profile picture updated successfully" });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile picture",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-6 mb-6">
      <div className="relative">
        {imageSrc ? (
          <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
            <img src={imageSrc} alt="Profile" className="w-full h-full object-cover object-center" />
          </div>
        ) : (
          <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center border-2 border-border flex-shrink-0">
            <User className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
      </div>
      <div>
        <ObjectUploader
          onGetUploadParameters={getObjectUploadParameters}
          onComplete={handleComplete}
          allowedFileTypes={["image/*"]}
          maxFileSize={5242880}
          buttonVariant="outline"
        >
          <Upload className="h-4 w-4 mr-2" />
          {photoUrl ? "Change Photo" : "Upload Photo"}
        </ObjectUploader>
        <p className="text-xs text-muted-foreground mt-2">JPG or PNG up to 5MB</p>
      </div>
    </div>
  );
}
