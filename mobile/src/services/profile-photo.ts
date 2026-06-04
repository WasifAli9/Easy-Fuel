import * as ImagePicker from "expo-image-picker";
import { apiClient } from "@/services/api/client";
import { putFileToUploadUrl, resolveApiUrl } from "@/lib/files";
import { appConfig } from "@/services/config";

export type ProfilePhotoRole = "customer" | "driver" | "supplier";

const PROFILE_PUT_BY_ROLE: Record<ProfilePhotoRole, string> = {
  customer: "/api/profile",
  driver: "/api/driver/profile",
  supplier: "/api/supplier/profile",
};

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

function extractObjectPathFromUpload(
  uploadURL: string,
  uploadMeta: { objectPath?: string },
  uploadResponse?: Record<string, unknown>,
) {
  const fromBody =
    (uploadResponse?.objectPath as string) ||
    (uploadResponse?.fullPath as string) ||
    (uploadResponse?.path as string) ||
    (uploadResponse?.location as string) ||
    uploadMeta.objectPath;

  if (fromBody) {
    return String(fromBody).replace(/^\/objects\//, "");
  }

  const pathOnly = uploadURL.replace(/^https?:\/\/[^/]+/, "");
  if (pathOnly.startsWith("/api/storage/upload/")) {
    const match = pathOnly.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
    if (match) return `${match[1]}/${match[2]}`;
    const fallback = pathOnly.match(/\/api\/storage\/upload\/(.+)/);
    if (fallback) return `local/${fallback[1]}`;
  }
  if (pathOnly.startsWith("/api/object-storage/upload/")) {
    return pathOnly;
  }
  if (pathOnly.startsWith("/objects/")) {
    return pathOnly.replace(/^\/objects\//, "");
  }
  return null;
}

async function pickProfileImageFromLibrary() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library access is required to choose a profile picture.");
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    allowsMultipleSelection: false,
  });

  if (picked.canceled || !picked.assets?.length) {
    throw new Error("cancelled");
  }

  const asset = picked.assets[0];
  if (asset.fileSize != null && asset.fileSize > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  return asset;
}

/** Pick from the device photo library, upload, and persist profile photo (same flow as web portal). */
export async function pickAndUploadProfilePhoto(role: ProfilePhotoRole): Promise<string> {
  const file = await pickProfileImageFromLibrary();

  const uploadMeta = (await apiClient.post("/api/objects/upload")).data as {
    uploadURL: string;
    objectPath?: string;
  };

  const mimeType = file.mimeType || "image/jpeg";
  const blob = await (await fetch(file.uri)).blob();
  const uploaded = await putFileToUploadUrl(uploadMeta.uploadURL, blob, mimeType);
  if (!uploaded.ok) {
    throw new Error("Could not upload image.");
  }

  let uploadResponse: Record<string, unknown> = {};
  try {
    uploadResponse = (await uploaded.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }

  const pictureRef =
    (uploadResponse.location as string) ||
    (uploadResponse.url as string) ||
    (uploadResponse.objectPath as string) ||
    uploadMeta.objectPath ||
    uploadMeta.uploadURL;

  const aclRes = await apiClient.put("/api/profile-picture", {
    profilePictureURL: pictureRef,
  });

  const objectPath =
    (aclRes.data as { objectPath?: string; profile_photo_url?: string }).objectPath ||
    (aclRes.data as { profile_photo_url?: string }).profile_photo_url ||
    extractObjectPathFromUpload(uploadMeta.uploadURL, uploadMeta, uploadResponse);

  if (!objectPath) {
    throw new Error("Could not resolve profile photo path.");
  }

  await apiClient.put(PROFILE_PUT_BY_ROLE[role], { profilePhotoUrl: objectPath });
  return objectPath;
}
