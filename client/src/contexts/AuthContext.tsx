import { createContext, useContext, useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  role: "customer" | "driver" | "supplier" | "admin" | "company";
  fullName: string;
  phone?: string;
  profilePhotoUrl?: string;
}

interface AuthContextType {
  user: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null;
  profile: Profile | null;
  session: { access_token: string; refresh_token?: string; expires_at?: number; user?: any } | null;
  loading: boolean;
  signUpWithPassword: (
    email: string,
    password: string,
    fullName?: string,
    role?: "customer" | "driver" | "supplier" | "admin" | "company",
  ) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUserRole: (role: "customer" | "driver" | "supplier" | "admin" | "company", fullName: string, phone?: string) => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_PROVIDER = (import.meta.env.VITE_AUTH_PROVIDER || "local").toLowerCase();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthContextType["user"]>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<AuthContextType["session"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (AUTH_PROVIDER === "local") {
      fetch("/api/auth/me", {
        credentials: "include",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Session expired");
          return res.json();
        })
        .then((payload) => {
          const p = payload.profile;
          const fullNameRaw = p?.full_name ?? (p as any)?.fullName;
          const u = payload.user;
          setUser(
            u
              ? {
                  ...u,
                  user_metadata: {
                    full_name: (u as any).full_name ?? fullNameRaw,
                  },
                }
              : null,
          );
          setSession(u ? { access_token: "cookie-session", user: u } : null);
          setProfile(
            p
              ? {
                  id: p.id,
                  role: p.role,
                  fullName: fullNameRaw,
                  phone: p.phone ?? (p as any).phone,
                  profilePhotoUrl: (p.profile_photo_url ?? (p as any).profilePhotoUrl) || undefined,
                }
              : null,
          );
        })
        .catch(() => {
          setSession(null);
          setUser(null);
          setProfile(null);
        })
        .finally(() => setLoading(false));
      return;
    }

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
      if (AUTH_PROVIDER === "local") {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (!response.ok) {
          setProfile(null);
          return;
        }
        const payload = await response.json();
        const data = payload.profile;
        const fullNameRaw = data?.full_name ?? (data as any)?.fullName;
        const profileData = data
          ? {
              id: data.id,
              role: data.role,
              fullName: fullNameRaw,
              phone: data.phone ?? (data as any).phone,
              profilePhotoUrl: (data.profile_photo_url ?? (data as any).profilePhotoUrl) || undefined,
            }
          : null;
        const u = payload.user;
        setUser(
          u
            ? {
                ...u,
                user_metadata: {
                  full_name: (u as any).full_name ?? fullNameRaw,
                },
              }
            : null,
        );
        setProfile(profileData);
        setLoading(false);
        return;
      }
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
        await queryClient.invalidateQueries({ queryKey: ["/api/company/overview"] });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithOtp(email: string) {
    if (AUTH_PROVIDER === "local") {
      throw new Error("Magic link is disabled in local auth mode. Use password sign-in.");
    }
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
    if (AUTH_PROVIDER === "local") {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Invalid email or password");
      }
      const data = await res.json();
      const localSession = { access_token: "cookie-session", user: data.user };
      setSession(localSession as AuthContextType["session"]);
      setUser(data.user);
      await fetchProfile(data.user.id);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  }

  async function signUpWithPassword(
    email: string,
    password: string,
    fullName?: string,
    role: "customer" | "driver" | "supplier" | "admin" | "company" = "customer",
  ) {
    if (AUTH_PROVIDER === "local") {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName: fullName || email.split("@")[0], role }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sign up failed");
      }
      const data = await res.json();
      const p = data.profile as { id: string; role: Profile["role"]; full_name?: string } | undefined;
      // Server already creates profile + role on register; hydrate immediately so we skip the extra "Complete setup" step.
      if (p?.id && p?.role) {
        setProfile({
          id: p.id,
          role: p.role,
          fullName: p.full_name ?? fullName ?? String(email).split("@")[0],
        });
      }
      const localSession = { access_token: "cookie-session", user: data.user };
      setSession(localSession as AuthContextType["session"]);
      setUser({
        id: data.user.id,
        email: data.user.email ?? email,
        user_metadata: { full_name: p?.full_name ?? fullName },
      });
      await fetchProfile(data.user.id);
      return data;
    }
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
    if (AUTH_PROVIDER === "local") {
      // Placeholder endpoint behavior while production email service is wired.
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        throw new Error("Failed to send reset email");
      }
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  }

  async function updatePassword(newPassword: string) {
    if (AUTH_PROVIDER === "local") {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword: "", newPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update password");
      }
      return;
    }
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  }

  async function signOut() {
    if (AUTH_PROVIDER === "local") {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }).catch(() => undefined);
      setSession(null);
      setUser(null);
      setProfile(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  }

  async function setUserRole(
    role: "customer" | "driver" | "supplier" | "admin" | "company",
    fullName: string,
    phone?: string
  ) {
    if (!user) throw new Error("No user logged in");
    if (AUTH_PROVIDER === "local") {
      const response = await fetch("/api/auth/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role, fullName, phone }),
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to set role");
      }
      await fetchProfile(user.id);
      return;
    }

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
    } else if (role === "company") {
      const { error } = await supabase.from("companies").insert({
        owner_user_id: user.id,
        name: fullName,
        status: "active",
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
