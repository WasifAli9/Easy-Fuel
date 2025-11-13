import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Use environment variables if available, otherwise fall back to hardcoded values
const SUPABASE_URL = process.env.SUPABASE_URL || "https://piejkqvpkxnrnudztrmt.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpZWprcXZwa3hucm51ZHp0cm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxNzk4NTksImV4cCI6MjA3NTc1NTg1OX0.g4k9ldjwMgdmvjc3li3I99TS-uyHduQldLSUZaXo98I";
// Service role key - use anon key as fallback if not set
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

// Client for browser/public operations (respects RLS)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client for server-side operations (bypasses RLS when using service role key)
// Uses anon key as fallback - will respect RLS in that case
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Auth client for token validation (uses anon key)
export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
