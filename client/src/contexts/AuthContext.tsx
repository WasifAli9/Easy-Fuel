import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { clearStoredTokens } from "@/lib/session-tokens";

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

function buildCookieSession(user: AuthUser): AuthSession {
  return {
    access_token: "cookie-session",
    refresh_token: "",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    user,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUserFromApi = useCallback((data: AuthUserResponse) => {
    const { user: u, profile: p } = mapUserPayload(data);
    setUser(u);
    setProfile(p);
    setSession(buildCookieSession(u));
  }, []);

  const fetchCurrentUser = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/auth/user", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) {
      clearStoredTokens();
      setUser(null);
      setProfile(null);
      setSession(null);
      return false;
    }
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as AuthUserResponse;
    applyUserFromApi(data);
    return true;
  }, [applyUserFromApi]);

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
      const res = await fetch("/api/auth/user", {
        credentials: "include",
        headers: { Accept: "application/json" },
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
      const body = (await res.json().catch(() => ({}))) as { message?: string } & Partial<AuthUserResponse>;
      if (!res.ok) {
        throw new Error(body.message || "Invalid email or password");
      }
      if (!body.id) {
        throw new Error("Login response missing user");
      }
      const payload = body as AuthUserResponse;
      applyUserFromApi(payload);
      await fetchProfile(payload.id);
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
      const body = (await res.json().catch(() => ({}))) as { message?: string } & Partial<AuthUserResponse>;
      if (!res.ok) {
        throw new Error(body.message || "Registration failed");
      }
      if (!body.id) {
        throw new Error("Registration response missing user");
      }
      const payload = { ...body, role: (body.role as string | null) ?? role, fullName: body.fullName ?? fullName } as AuthUserResponse;
      applyUserFromApi(payload);
      await fetchProfile(payload.id);
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
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
