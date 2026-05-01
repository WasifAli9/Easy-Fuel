import { PropsWithChildren } from "react";
import { useAppWebSocket } from "@/services/realtime";

/** Subscribes to the backend WebSocket when a user session exists (same channel as the web app). */
export function RealtimeSync({ children }: PropsWithChildren) {
  useAppWebSocket();
  return <>{children}</>;
}
