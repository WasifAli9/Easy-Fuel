import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/lib/usePushNotifications";

export function NotificationPermissionBanner() {
  const { permission, isSubscribed, isLoading, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem("notification-banner-dismissed");
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  if (dismissed || permission === "granted" || permission === "denied" || isSubscribed) {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("notification-banner-dismissed", "true");
  }

  async function handleEnable() {
    const success = await requestPermission();
    if (success) {
      setDismissed(true);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50">
      <div className="bg-card border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" data-testid="icon-notification" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1" data-testid="text-banner-title">
              Enable Notifications
            </h3>
            <p className="text-sm text-muted-foreground mb-3" data-testid="text-banner-description">
              Get instant updates about fuel deliveries, driver assignments, and order status changes
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={isLoading}
                data-testid="button-enable-notifications"
              >
                {isLoading ? "Enabling..." : "Enable"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                data-testid="button-dismiss-notifications"
              >
                Not Now
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            data-testid="button-close-banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
