import { supabase } from "./supabase";

async function getSessionWithRetry() {
  const read = () => supabase.auth.getSession();
  let { data: { session }, error } = await read();
  // Brief race: Supabase may not have rehydrated from cookie storage on first tick
  if (!session?.access_token && !error) {
    await new Promise((r) => setTimeout(r, 50));
    ({ data: { session }, error } = await read());
  }
  return { session, error };
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  const { session, error } = await getSessionWithRetry();

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
