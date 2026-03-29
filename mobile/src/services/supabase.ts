import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://piejkqvpkxnrnudztrmt.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpZWprcXZwa3hucm51ZHp0cm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxNzk4NTksImV4cCI6MjA3NTc1NTg1OX0.g4k9ldjwMgdmvjc3li3I99TS-uyHduQldLSUZaXo98I";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase credentials for mobile auth");
}

// We persist tokens ourselves in SecureStore, so disable SDK persistence.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
