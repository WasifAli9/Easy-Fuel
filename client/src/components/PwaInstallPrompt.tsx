import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "pwa-install-dismissed";

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(isStandaloneMode());

  useEffect(() => {
    const storedDismissed = localStorage.getItem(DISMISS_KEY);
    if (storedDismissed) {
      setDismissed(true);
    }
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      if (dismissed || installed) {
        return;
      }
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [dismissed, installed]);

  if (!deferredPrompt || dismissed || installed) {
    return null;
  }

  async function handleInstall() {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } catch (error) {
      console.error("PWA install prompt failed:", error);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "true");
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50">
      <div className="bg-card border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Install Easy Fuel App</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Add Easy Fuel to your home screen for a faster, app-like experience. Works offline and launches quickly.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInstall}>
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Close install prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

