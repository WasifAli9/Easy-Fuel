import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    checkSubscription();
  }, []);

  async function checkSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  }

  async function requestPermission() {
    if (!('Notification' in window)) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in this browser",
        variant: "destructive",
      });
      return false;
    }

    setIsLoading(true);

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        await subscribe();
        return true;
      } else {
        toast({
          title: "Permission Denied",
          description: "You've blocked notifications. Enable them in your browser settings.",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      toast({
        title: "Error",
        description: "Failed to request notification permission",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in this browser",
        variant: "destructive",
      });
      return false;
    }

    setIsLoading(true);

    try {
      // Fetch API endpoints with credentials to send cookies
      const response = await fetch("/api/push/vapid-public-key", {
        credentials: 'include', // Send cookies with request
      });

      if (!response.ok) {
        console.error("Failed to get VAPID public key:", response.status, response.statusText);
        throw new Error("Failed to get VAPID public key");
      }

      const { publicKey } = await response.json();
      
      if (!publicKey) {
        console.error("No public key received from server");
        throw new Error("No VAPID public key received");
      }

      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subscriptionJson = subscription.toJSON();

      const saveResponse = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include', // Send cookies with request
        body: JSON.stringify({
          endpoint: subscriptionJson.endpoint,
          keys: {
            p256dh: subscriptionJson.keys?.p256dh,
            auth: subscriptionJson.keys?.auth,
          },
          userAgent: navigator.userAgent,
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({}));
        console.error("Failed to save subscription:", saveResponse.status, errorData);
        throw new Error(`Failed to save subscription: ${errorData.error || saveResponse.statusText}`);
      }

      setIsSubscribed(true);
      toast({
        title: "Success",
        description: "Push notifications enabled successfully",
      });
      return true;
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to enable push notifications",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function unsubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setIsSubscribed(false);
        return true;
      }

      const subscriptionJson = subscription.toJSON();

      const response = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include', // Send cookies with request
        body: JSON.stringify({
          endpoint: subscriptionJson.endpoint,
        }),
      });

      if (!response.ok) {
        console.error("Failed to unsubscribe:", response.status, response.statusText);
        throw new Error("Failed to unsubscribe");
      }

      await subscription.unsubscribe();
      setIsSubscribed(false);
      toast({
        title: "Success",
        description: "Push notifications disabled",
      });
      return true;
    } catch (error) {
      console.error("Error unsubscribing from push notifications:", error);
      toast({
        title: "Error",
        description: "Failed to disable push notifications",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  return {
    permission,
    isSubscribed,
    isLoading,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}
