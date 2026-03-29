import { create } from "zustand";

export type UiThemeMode = "light" | "dark";

type UiThemeState = {
  mode: UiThemeMode;
  hydrated: boolean;
  setMode: (mode: UiThemeMode) => void;
  markHydrated: () => void;
};

export const useUiThemeStore = create<UiThemeState>((set) => ({
  mode: "light",
  hydrated: false,
  setMode: (mode) => set({ mode }),
  markHydrated: () => set({ hydrated: true }),
}));
