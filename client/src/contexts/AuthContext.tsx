import { createContext, useContext, useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthContextType["user"]>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<AuthContextType["session"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        if (u && !p) {
          void fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }).catch(() => undefined);
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }
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
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (!response.ok) {
        setSession(null);
        setUser(null);
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
      if (u && !data) {
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

      if (profileData) {
        await queryClient.invalidateQueries({ queryKey: ["/api/customer/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/company/overview"] });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setSession(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithOtp(_email: string) {
    throw new Error("Magic link sign-in is not available.");
  }

  async function signInWithPassword(email: string, password: string) {
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
    // Do not setUser before fetchProfile: React may commit user+!profile and Auth page calls signOut().
    setLoading(true);
    await fetchProfile(data.user.id);
  }

  async function signUpWithPassword(
    email: string,
    password: string,
    fullName?: string,
    role: "customer" | "driver" | "supplier" | "admin" | "company" = "customer",
  ) {
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
    const localSession = { access_token: "cookie-session", user: data.user };
    setSession(localSession as AuthContextType["session"]);
    setLoading(true);
    await fetchProfile(data.user.id);
  }

  async function resetPassword(email: string) {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      throw new Error("Failed to send reset email");
    }
  }

  async function updatePassword(newPassword: string) {
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
  }

  async function signOut() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    }).catch(() => undefined);
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  async function setUserRole(
    role: "customer" | "driver" | "supplier" | "admin" | "company",
    fullName: string,
    phone?: string,
  ) {
    if (!user) throw new Error("No user logged in");
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
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
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
