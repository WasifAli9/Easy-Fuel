import { create } from "zustand";
import { UserRole } from "@/navigation/types";

type SessionState = {
  accessToken: string | null;
  refreshToken: string | null;
  role: UserRole | null;
  userId: string | null;
  email: string | null;
  hydrated: boolean;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    role: UserRole;
    userId: string;
    email: string;
  }) => void;
  clearSession: () => void;
  markHydrated: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  refreshToken: null,
  role: null,
  userId: null,
  email: null,
  hydrated: false,
  setSession: ({ accessToken, refreshToken, role, userId, email }) =>
    set({ accessToken, refreshToken, role, userId, email }),
  clearSession: () =>
    set({ accessToken: null, refreshToken: null, role: null, userId: null, email: null }),
  markHydrated: () => set({ hydrated: true }),
}));
