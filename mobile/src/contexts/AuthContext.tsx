import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@/types";
import type { UserRole } from "@/navigation/types";
import { authService } from "@/services/authService";
import { clearSecureSession, readSecureSession, saveSecureSession } from "@/services/storage";
import { useSessionStore } from "@/store/session-store";

const USER_STORAGE_KEY = "easy_fuel_user_json";
const LAST_LOGIN_EMAIL_KEY = "easy_fuel_last_login_email";

const MOBILE_APP_ROLES: readonly UserRole[] = ["customer", "driver", "supplier", "company"];

function isMobileAppRole(role: string | null | undefined): role is UserRole {
  if (!role) return false;
  return (MOBILE_APP_ROLES as readonly string[]).includes(role);
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => void;
  changePasswordWithCurrent: (email: string, currentPassword: string, newPassword: string) => Promise<void>;
  storeBiometricCredentials: (email: string, password: string, skipAuth?: boolean) => Promise<void>;
  getBiometricCredentials: (skipAuth?: boolean) => Promise<{ email: string; password: string } | null>;
  clearBiometricCredentials: () => Promise<void>;
  getStoredEmail: () => Promise<string | null>;
  hasBiometricCredentials: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function setStorageItem(key: string, value: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteStorageItem(key: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

function assertPortalUser(u: User): User {
  if (u.role === "admin") {
    throw new Error("Admin accounts are not supported in the mobile app.");
  }
  if (!isMobileAppRole(u.role)) {
    throw new Error("Unable to resolve account role for this user.");
  }
  return { ...u, role: u.role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const qc = useQueryClient();

  const { data: currentUser, isLoading: userQueryLoading, refetch } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        return assertPortalUser(await authService.getCurrentUser());
      } catch {
        return null;
      }
    },
    enabled: false,
    retry: false,
  });

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
      void setStorageItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
    }
  }, [currentUser]);

  const persistSession = useCallback(
    async (u: User, accessToken: string, refreshToken: string, role: UserRole) => {
      const safeUser = assertPortalUser(u);
      await saveSecureSession({
        accessToken,
        refreshToken,
        role,
        userId: safeUser.id,
        email: safeUser.email,
      });
      useSessionStore.getState().setSession({
        accessToken,
        refreshToken,
        role,
        userId: safeUser.id,
        email: safeUser.email,
      });
      setUser(safeUser);
      qc.setQueryData(["/api/auth/user"], safeUser);
    },
    [qc],
  );

  const checkStoredSession = useCallback(async () => {
    try {
      const stored = await getStorageItem(USER_STORAGE_KEY);
      const session = await readSecureSession();

      if (
        session.accessToken &&
        session.refreshToken &&
        session.role &&
        session.userId &&
        session.email &&
        isMobileAppRole(session.role)
      ) {
        let fromDisk: User;
        try {
          fromDisk = stored
            ? assertPortalUser(JSON.parse(stored) as User)
            : {
                id: session.userId,
                email: session.email,
                role: session.role,
              };
        } catch {
          fromDisk = {
            id: session.userId,
            email: session.email,
            role: session.role,
          };
          assertPortalUser(fromDisk);
        }
        setUser(fromDisk);
        useSessionStore.getState().setSession({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          role: session.role as UserRole,
          userId: session.userId,
          email: session.email,
        });
        void refetch().catch(() => {
          setUser(null);
          useSessionStore.getState().clearSession();
          void clearSecureSession();
          void deleteStorageItem(USER_STORAGE_KEY);
        });
      } else if (session.accessToken && !session.userId) {
        await clearSecureSession();
        useSessionStore.getState().clearSession();
      }
    } catch (e) {
      if (__DEV__) {
        console.error("[AuthContext] checkStoredSession", e);
      }
    } finally {
      setBootstrapped(true);
      useSessionStore.getState().markHydrated();
    }
  }, [refetch]);

  useEffect(() => {
    void checkStoredSession();
  }, [checkStoredSession]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const result = await authService.login({ email, password });
      const u = assertPortalUser({
        id: result.user.id,
        email: result.user.email ?? email,
        role: result.user.role,
      });
      return { user: u, accessToken: result.accessToken, refreshToken: result.refreshToken, email };
    },
    onSuccess: async (data) => {
      await persistSession(data.user, data.accessToken, data.refreshToken, data.user.role as UserRole);
      await setStorageItem(LAST_LOGIN_EMAIL_KEY, data.email);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await authService.logout();
      } catch {
        // Inspect360-style: still clear local session
      }
    },
    onSuccess: async () => {
      setUser(null);
      await clearSecureSession();
      useSessionStore.getState().clearSession();
      await deleteStorageItem(USER_STORAGE_KEY);
      qc.cancelQueries();
      qc.clear();
      qc.resetQueries();
    },
  });

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const refetchUser = () => {
    void refetch();
  };

  const changePasswordWithCurrent = async (email: string, currentPassword: string, newPassword: string) => {
    await login(email, currentPassword);
    await authService.changePasswordWithCurrent(currentPassword, newPassword);
  };

  const storeBiometricCredentials = async (_email: string, _password: string, _skipAuth?: boolean) => {
    /* Inspect360 parity — implement when biometric unlock ships. */
  };

  const getBiometricCredentials = async (_skipAuth?: boolean) => null;

  const clearBiometricCredentials = async () => {
    /* no-op */
  };

  const getStoredEmail = async () => {
    return getStorageItem(LAST_LOGIN_EMAIL_KEY);
  };

  const hasBiometricCredentials = async () => false;

  const isLoading =
    !bootstrapped || userQueryLoading || loginMutation.isPending || logoutMutation.isPending;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refetchUser,
        changePasswordWithCurrent,
        storeBiometricCredentials,
        getBiometricCredentials,
        clearBiometricCredentials,
        getStoredEmail,
        hasBiometricCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
