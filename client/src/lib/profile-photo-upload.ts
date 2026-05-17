import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/auth-headers";
import { extractUploadObjectPath } from "@/lib/upload-object-path";

export type ProfilePhotoSaveTarget = "/api/profile" | "/api/driver/profile" | "/api/supplier/profile";

export async function saveProfilePhotoFromUpload(
  uploadedFile: {
    uploadURL?: string;
    response?: { body?: unknown; data?: unknown } & Record<string, unknown>;
  },
  profilePutPath: ProfilePhotoSaveTarget,
): Promise<string> {
  const objectPath = extractUploadObjectPath(uploadedFile);
  if (!objectPath) {
    throw new Error("Could not get file URL from upload.");
  }

  let responseData: Record<string, unknown> | null = null;
  const rawResponse = uploadedFile.response?.body ?? uploadedFile.response?.data ?? uploadedFile.response;
  if (rawResponse) {
    try {
      responseData =
        typeof rawResponse === "string"
          ? (JSON.parse(rawResponse) as Record<string, unknown>)
          : (rawResponse as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  }

  const pictureRef =
    (responseData?.location as string) ||
    (responseData?.url as string) ||
    objectPath;

  const headers = await getAuthHeaders();
  const aclRes = await fetch("/api/profile-picture", {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ profilePictureURL: pictureRef }),
  });

  if (!aclRes.ok) {
    const errorData = await aclRes.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.message || errorData.error || "Failed to set profile picture");
  }

  const { objectPath: finalObjectPath } = await aclRes.json();
  const storedPath = finalObjectPath || objectPath;

  await apiRequest("PUT", profilePutPath, { profilePhotoUrl: storedPath });

  await queryClient.invalidateQueries({ queryKey: [profilePutPath] });
  await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
  await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
  await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
  await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

  return storedPath;
}

export async function getObjectUploadParameters(): Promise<{ method: "PUT"; url: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/objects/upload", { method: "POST", headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.message || errorData.error || "Failed to generate upload URL");
  }
  const data = await response.json();
  const uploadURL = data.uploadURL as string;
  if (!uploadURL) {
    throw new Error("No upload URL returned from server");
  }
  return { method: "PUT", url: uploadURL };
}
