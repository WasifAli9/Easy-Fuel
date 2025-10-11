import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  role: "customer" | "driver" | "supplier" | "admin";
  fullName: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signInWithOtp: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUserRole: (role: "customer" | "driver" | "supplier" | "admin", fullName: string, phone?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      
      setProfile(data ? {
        id: data.id,
        role: data.role,
        fullName: data.full_name,
        phone: data.phone,
      } : null);
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) throw error;
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  }

  async function setUserRole(
    role: "customer" | "driver" | "supplier" | "admin",
    fullName: string,
    phone?: string
  ) {
    if (!user) throw new Error("No user logged in");

    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      role,
      full_name: fullName,
      phone,
    });

    if (error) throw error;

    // Also create role-specific record
    if (role === "customer") {
      await supabase.from("customers").insert({
        user_id: user.id,
      });
    } else if (role === "driver") {
      await supabase.from("drivers").insert({
        user_id: user.id,
      });
    } else if (role === "supplier") {
      await supabase.from("suppliers").insert({
        owner_id: user.id,
        name: fullName,
      });
    }

    await fetchProfile(user.id);
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signInWithOtp,
    signInWithPassword,
    signOut,
    setUserRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
