import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import {
  clearStoredTokens,
  getJwtExpSeconds,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokens,
  refreshSessionTokens,
} from "@/lib/session-tokens";
import { getAuthHeaders } from "@/lib/auth-headers";

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
};

type AppRole = "customer" | "driver" | "supplier" | "admin" | "company";

interface Profile {
  id: string;
  role: AppRole;
  fullName: string;
  phone?: string;
  profilePhotoUrl?: string;
}

type AuthUserResponse = {
  id: string;
  email: string;
  role: string | null;
  fullName?: string | null;
  phone?: string | null;
  profilePhotoUrl?: string | null;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email?: string; role?: string | null };
};

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  session: AuthSession | null;
  loading: boolean;
  signUpWithPassword: (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
  ) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUserRole: (role: AppRole, fullName: string, phone?: string) => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapUserPayload(data: AuthUserResponse): { user: AuthUser; profile: Profile | null } {
  const user: AuthUser = { id: data.id, email: data.email ?? "" };
  if (!data.role || !["customer", "driver", "supplier", "admin", "company"].includes(data.role)) {
    return { user, profile: null };
  }
  const profile: Profile = {
    id: data.id,
    role: data.role as AppRole,
    fullName: data.fullName ?? "",
    phone: data.phone ?? undefined,
    profilePhotoUrl: data.profilePhotoUrl ?? undefined,
  };
  return { user, profile };
}

function buildSession(access: string, refresh: string, user: AuthUser): AuthSession {
  const exp = getJwtExpSeconds(access);
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: exp ?? Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuthPayload = useCallback((access: string, refresh: string, payload: AuthUserResponse) => {
    setStoredTokens(access, refresh);
    const { user: u, profile: p } = mapUserPayload(payload);
    setUser(u);
    setProfile(p);
    setSession(buildSession(access, refresh, u));
  }, []);

  const fetchCurrentUser = useCallback(async (): Promise<boolean> => {
    let access = getStoredAccessToken();
    if (!access) {
      return false;
    }
    const exp = getJwtExpSeconds(access);
    if (exp && exp * 1000 < Date.now() + 45_000) {
      const refreshed = await refreshSessionTokens();
      access = refreshed?.accessToken ?? access;
    }
    if (!access) return false;

    const res = await fetch("/api/auth/user", {
      headers: { Authorization: `Bearer ${access}`, Accept: "application/json" },
      credentials: "include",
    });
    if (!res.ok) {
      clearStoredTokens();
      setUser(null);
      setProfile(null);
      setSession(null);
      return false;
    }
    const data = (await res.json()) as AuthUserResponse;
    const refresh = getStoredRefreshToken();
    if (!refresh) {
      clearStoredTokens();
      setUser(null);
      setProfile(null);
      setSession(null);
      return false;
    }
    applyAuthPayload(access, refresh, data);
    return true;
  }, [applyAuthPayload]);

  useEffect(() => {
    void (async () => {
      try {
        await fetchCurrentUser();
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchCurrentUser]);

  async function fetchProfile(userId: string) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/auth/user", {
        headers: { ...headers, Accept: "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load profile");
      const data = (await res.json()) as AuthUserResponse;
      if (data.id !== userId) throw new Error("Profile mismatch");
      const { profile: p } = mapUserPayload(data);
      setProfile(p);
      if (p) {
        await queryClient.invalidateQueries({ queryKey: ["/api/customer/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/company/overview"] });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    }
  }

  async function signInWithOtp(_email: string) {
    throw new Error("Email magic-link sign-in is not enabled. Please use password sign-in.");
  }

  async function signInWithPassword(email: string, password: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string } & Partial<LoginResponse>;
      if (!res.ok) {
        throw new Error(body.message || "Invalid email or password");
      }
      if (!body.accessToken || !body.refreshToken || !body.user?.id) {
        throw new Error("Login response missing tokens");
      }
      const payload: AuthUserResponse = {
        id: body.user.id,
        email: body.user.email ?? email,
        role: body.user.role ?? null,
      };
      applyAuthPayload(body.accessToken, body.refreshToken, payload);
      await fetchProfile(body.user.id);
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithPassword(email: string, password: string, fullName: string, role: AppRole) {
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, fullName, role }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string } & Partial<LoginResponse>;
      if (!res.ok) {
        throw new Error(body.message || "Registration failed");
      }
      if (!body.accessToken || !body.refreshToken || !body.user?.id) {
        throw new Error("Registration response missing tokens");
      }
      const payload: AuthUserResponse = {
        id: body.user.id,
        email: body.user.email ?? email,
        role: (body.user.role as string | null) ?? role,
        fullName,
      };
      applyAuthPayload(body.accessToken, body.refreshToken, payload);
      await fetchProfile(body.user.id);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(_email: string) {
    throw new Error(
      "Self-service email password reset is not configured. Sign in if you know your password, or contact support.",
    );
  }

  async function updatePassword(newPassword: string, currentPassword?: string) {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        currentPassword: currentPassword ?? "",
        newPassword,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      throw new Error(body.message || "Password update failed");
    }
  }

  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    clearStoredTokens();
    setUser(null);
    setProfile(null);
    setSession(null);
    queryClient.clear();
  }

  async function setUserRole(_role: AppRole, _fullName: string, _phone?: string) {
    throw new Error("Account role is set at registration. Create a new account to choose a different role.");
  }

  const refetchProfile = async () => {
    if (user) {
      setLoading(true);
      try {
        await fetchProfile(user.id);
      } finally {
        setLoading(false);
      }
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
