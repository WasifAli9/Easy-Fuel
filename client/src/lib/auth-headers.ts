/**
 * Cookie sessions (Inspect360-style): API auth uses `credentials: "include"` only.
 * No Bearer tokens on the web client.
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
  return {};
}
