import { create } from "zustand";

export type DriverMenuScreenKey =
  | "portal"
  | "profile"
  | "kyc"
  | "notifications"
  | "pricing"
  | "history"
  | "settings";

export type DriverTabKey = "DriverOrders" | "DriverVehicles" | "DriverDepot";

type UiOverlayState = {
  hideDriverHeader: boolean;
  setHideDriverHeader: (value: boolean) => void;
  /** One-shot request: open a driver side-menu screen (e.g. notifications). */
  requestedDriverMenuScreen: DriverMenuScreenKey | null;
  requestDriverMenuScreen: (screen: DriverMenuScreenKey) => void;
  consumeDriverMenuScreen: () => DriverMenuScreenKey | null;
  /** One-shot request: jump to a driver portal tab. */
  requestedDriverTab: DriverTabKey | null;
  requestDriverTab: (tab: DriverTabKey) => void;
  consumeDriverTab: () => DriverTabKey | null;
};

export const useUiOverlayStore = create<UiOverlayState>((set, get) => ({
  hideDriverHeader: false,
  setHideDriverHeader: (value) => set({ hideDriverHeader: value }),
  requestedDriverMenuScreen: null,
  requestDriverMenuScreen: (screen) => set({ requestedDriverMenuScreen: screen }),
  consumeDriverMenuScreen: () => {
    const screen = get().requestedDriverMenuScreen;
    if (!screen) return null;
    set({ requestedDriverMenuScreen: null });
    return screen;
  },
  requestedDriverTab: null,
  requestDriverTab: (tab) => set({ requestedDriverTab: tab }),
  consumeDriverTab: () => {
    const tab = get().requestedDriverTab;
    if (!tab) return null;
    set({ requestedDriverTab: null });
    return tab;
  },
}));
