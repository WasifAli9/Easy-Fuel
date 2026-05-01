import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";

interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "warning" | "checking";
  message: string;
}

export default function AuthTest() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runHealthChecks = async () => {
    setIsRunning(true);
    const results: HealthCheck[] = [];

    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        results.push({
          name: "Session API",
          status: "pass",
          message: "GET /api/auth/me returned 200 — cookie session is working.",
        });
      } else if (res.status === 401) {
        results.push({
          name: "Session API",
          status: "warning",
          message: "GET /api/auth/me returned 401 — sign in first, or check cookie / proxy settings.",
        });
      } else {
        results.push({
          name: "Session API",
          status: "fail",
          message: `Unexpected status ${res.status} from /api/auth/me`,
        });
      }
    } catch (error: any) {
      results.push({
        name: "Session API",
        status: "fail",
        message: `Request failed: ${error.message}`,
      });
    }
    setChecks([...results]);

    const origin = window.location.origin;
    const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");
    results.push({
      name: "Origin",
      status: isLocalhost ? "pass" : "warning",
      message: isLocalhost
        ? `Developing at ${origin}`
        : `Production origin ${origin} — ensure SESSION_COOKIE_* and HTTPS match your deployment.`,
    });
    setChecks([...results]);

    setIsRunning(false);
  };

  const getIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "fail":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getAlertVariant = (status: string) => {
    switch (status) {
      case "fail":
        return "destructive";
      default:
        return "default";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-background p-4">
      <div className="max-w-3xl mx-auto space-y-6 py-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Authentication Health Check</h1>
          <p className="text-muted-foreground">Verify local session auth against the API</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick checks</CardTitle>
            <CardDescription>Calls your backend with credentials (same-origin cookie).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runHealthChecks} disabled={isRunning} className="w-full">
              {isRunning ? "Running Checks..." : "Run Health Checks"}
            </Button>

            {checks.length > 0 && (
              <div className="space-y-3 mt-6">
                {checks.map((check, index) => (
                  <Alert key={index} variant={getAlertVariant(check.status)}>
                    <div className="flex items-start gap-3">
                      {getIcon(check.status)}
                      <div className="flex-1">
                        <h4 className="font-semibold mb-1">{check.name}</h4>
                        <AlertDescription>{check.message}</AlertDescription>
                      </div>
                    </div>
                  </Alert>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => (window.location.href = "/auth")}>
            Go to Auth Page
          </Button>
        </div>
      </div>
    </div>
  );
}
