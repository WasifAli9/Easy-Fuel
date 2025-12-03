import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { queryClient } from "@/lib/queryClient";

interface Profile {
  id: string;
  role: "customer" | "driver" | "supplier" | "admin";
  fullName: string;
  phone?: string;
  profilePhotoUrl?: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUpWithPassword: (email: string, password: string, fullName?: string) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUserRole: (role: "customer" | "driver" | "supplier" | "admin", fullName: string, phone?: string) => Promise<void>;
  refetchProfile: () => Promise<void>;
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
      
      const profileData = data ? {
        id: data.id,
        role: data.role,
        fullName: data.full_name,
        phone: data.phone,
        profilePhotoUrl: data.profile_photo_url || undefined,
      } : null;
      
      setProfile(profileData);
      
      // Invalidate related queries to ensure UI updates
      if (profileData) {
        // Invalidate profile-related queries
        await queryClient.invalidateQueries({ queryKey: ["/api/customer/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithOtp(email: string) {
    // Use the current window origin for redirect
    const redirectTo = window.location.origin;
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
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

  async function signUpWithPassword(email: string, password: string, fullName?: string) {
    // Use the current window origin for redirect, ensuring it includes the full path
    const redirectTo = `${window.location.origin}/auth`;
    
    console.log("[signUpWithPassword] Signing up with:", { email, fullName });
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: fullName ? { full_name: fullName } : undefined,
      },
    });
    
    if (error) throw error;
    
    // Debug: Log what was saved
    if (data.user) {
      console.log("[signUpWithPassword] User created:", {
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata,
        app_metadata: data.user.app_metadata,
      });
    }
    
    // Refresh user to get latest metadata (in case it wasn't immediately available)
    if (data.user) {
      try {
        const { data: { user: refreshedUser }, error: refreshError } = await supabase.auth.getUser();
        if (!refreshError && refreshedUser) {
          console.log("[signUpWithPassword] Refreshed user:", {
            user_metadata: refreshedUser.user_metadata,
            app_metadata: refreshedUser.app_metadata,
          });
          setUser(refreshedUser);
        }
      } catch (refreshErr) {
        console.warn("[signUpWithPassword] Could not refresh user:", refreshErr);
      }
    }
    
    // Return data so caller knows if email confirmation is required
    return data;
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
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

    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      role,
      full_name: fullName,
      phone,
    });

    if (profileError) throw profileError;

    // Also create role-specific record
    if (role === "customer") {
      const { error } = await supabase.from("customers").insert({
        user_id: user.id,
      });
      if (error) throw error;
    } else if (role === "driver") {
      const { error } = await supabase.from("drivers").insert({
        user_id: user.id,
      });
      if (error) throw error;
    } else if (role === "supplier") {
      const { error } = await supabase.from("suppliers").insert({
        owner_id: user.id,
        name: fullName,
      });
      if (error) throw error;
    }

    // Update profile state immediately (optimistic update) for faster redirect
    setProfile({
      id: user.id,
      role,
      fullName,
      phone,
    });

    // Fetch profile and invalidate queries in background (non-blocking)
    Promise.all([
      fetchProfile(user.id),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] }),
    ]).catch((error) => {
      console.error("Error in background profile fetch:", error);
    });
  }

  const refetchProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    signUpWithPassword,
    signInWithOtp,
    signInWithPassword,
    resetPassword,
    updatePassword,
    signOut,
    setUserRole,
    refetchProfile,
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
