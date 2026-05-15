/**
 * Resolve the stored object path from an Uppy AwsS3 successful file entry.
 * Handles local storage PUT responses and upload endpoint URLs.
 */
export function extractUploadObjectPath(uploadedFile: {
  uploadURL?: string;
  response?: { body?: unknown; data?: unknown } & Record<string, unknown>;
}): string | undefined {
  let responseData: Record<string, unknown> | null = null;

  if (uploadedFile?.response?.body) {
    try {
      responseData =
        typeof uploadedFile.response.body === "string"
          ? JSON.parse(uploadedFile.response.body)
          : (uploadedFile.response.body as Record<string, unknown>);
    } catch {
      /* ignore parse errors */
    }
  }

  if (!responseData && uploadedFile?.response) {
    const resp = uploadedFile.response;
    if (typeof resp === "object" && resp !== null && !Array.isArray(resp)) {
      if (resp.objectPath || resp.fullPath || resp.path) {
        responseData = resp as Record<string, unknown>;
      }
    }
  }

  if (!responseData && uploadedFile?.response?.data) {
    try {
      responseData =
        typeof uploadedFile.response.data === "string"
          ? JSON.parse(uploadedFile.response.data)
          : (uploadedFile.response.data as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  }

  const fromResponse =
    (responseData?.objectPath as string | undefined) ||
    (responseData?.fullPath as string | undefined) ||
    (responseData?.path as string | undefined) ||
    (responseData?.uploadURL as string | undefined);

  if (fromResponse) {
    return fromResponse;
  }

  const uploadURL = uploadedFile?.uploadURL;
  if (!uploadURL) return undefined;

  const pathOnly = uploadURL.replace(/^https?:\/\/[^/]+/, "");

  if (pathOnly.startsWith("/api/storage/upload/")) {
    const pathMatch = pathOnly.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
    if (pathMatch) {
      const [, bucket, objectPath] = pathMatch;
      return `${bucket}/${objectPath}`;
    }
    const fallback = pathOnly.match(/\/api\/storage\/upload\/(.+)/);
    if (fallback) {
      return `local/${fallback[1]}`;
    }
  }

  if (pathOnly.startsWith("/api/object-storage/upload/")) {
    return pathOnly;
  }

  if (pathOnly.startsWith("/objects/")) {
    return pathOnly;
  }

  if (!pathOnly.startsWith("/api/") && pathOnly.includes("/")) {
    return pathOnly.replace(/^\/+/, "");
  }

  return uploadURL;
}
