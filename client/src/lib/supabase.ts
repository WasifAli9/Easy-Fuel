import { createClient } from "@supabase/supabase-js";

// For Replit, environment variables need to be accessed from window if not available in import.meta.env
const getEnvVar = (key: string): string => {
  // Try import.meta.env first
  const viteValue = import.meta.env[key];
  if (viteValue) return viteValue;
  
  // Fallback to window for Replit environment
  const windowValue = (window as any).__ENV__?.[key];
  if (windowValue) return windowValue;
  
  // Last resort: check if values are hardcoded for development
  if (key === 'VITE_SUPABASE_URL') {
    return 'https://piejkqvpkxnrnudztrmt.supabase.co';
  }
  if (key === 'VITE_SUPABASE_ANON_KEY') {
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpZWprcXZwa3hucm51ZHp0cm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxNzk4NTksImV4cCI6MjA3NTc1NTg1OX0.g4k9ldjwMgdmvjc3li3I99TS-uyHduQldLSUZaXo98I';
  }
  
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials. URL:", !!supabaseUrl, "Key:", !!supabaseAnonKey);
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
