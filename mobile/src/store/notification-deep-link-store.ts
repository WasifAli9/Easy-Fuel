import { create } from "zustand";

export type NotificationDeepLink = {
  orderId?: string;
  openChat?: boolean;
  notificationId?: string;
};

type NotificationDeepLinkState = {
  pending: NotificationDeepLink | null;
  setPending: (link: NotificationDeepLink) => void;
  consume: () => NotificationDeepLink | null;
};

export const useNotificationDeepLinkStore = create<NotificationDeepLinkState>((set, get) => ({
  pending: null,
  setPending: (link) => set({ pending: link }),
  consume: () => {
    const pending = get().pending;
    if (!pending) return null;
    set({ pending: null });
    return pending;
  },
}));
