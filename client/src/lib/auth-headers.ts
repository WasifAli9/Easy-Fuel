/** API calls use the session cookie; no Bearer token. */
export async function getAuthHeaders(): Promise<HeadersInit> {
  return {
    "Content-Type": "application/json",
  };
}
