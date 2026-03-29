import { create } from "zustand";
import { UserRole } from "@/navigation/types";

type SessionState = {
  accessToken: string | null;
  refreshToken: string | null;
  role: UserRole | null;
  hydrated: boolean;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    role: UserRole;
  }) => void;
  clearSession: () => void;
  markHydrated: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  refreshToken: null,
  role: null,
  hydrated: false,
  setSession: ({ accessToken, refreshToken, role }) =>
    set({ accessToken, refreshToken, role }),
  clearSession: () => set({ accessToken: null, refreshToken: null, role: null }),
  markHydrated: () => set({ hydrated: true }),
}));
