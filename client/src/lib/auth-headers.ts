import { supabase } from "./supabase";

export async function getAuthHeaders(): Promise<HeadersInit> {
  // Get current session (reads from cookie storage)
  const { data: { session }, error } = await supabase.auth.getSession();
  
  // If no session or error, try to refresh the session
  if (!session || error) {
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
    
    if (!refreshedSession || refreshError) {
      throw new Error("Not authenticated - Please log in again");
    }
    
    // Use refreshed session
    if (!refreshedSession.access_token) {
      throw new Error("Invalid session - missing access token");
    }

    return {
      "Authorization": `Bearer ${refreshedSession.access_token}`,
      "Content-Type": "application/json",
    };
  }
  
  if (!session.access_token) {
    throw new Error("Invalid session - missing access token");
  }

  return {
    "Authorization": `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}
