import { create } from "zustand";

type UiOverlayState = {
  hideDriverHeader: boolean;
  setHideDriverHeader: (value: boolean) => void;
};

export const useUiOverlayStore = create<UiOverlayState>((set) => ({
  hideDriverHeader: false,
  setHideDriverHeader: (value) => set({ hideDriverHeader: value }),
}));
