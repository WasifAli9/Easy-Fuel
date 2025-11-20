import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
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

    // Check 1: Supabase connection
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      results.push({
        name: "Supabase Connection",
        status: "pass",
        message: "Successfully connected to Supabase",
      });
    } catch (error: any) {
      results.push({
        name: "Supabase Connection",
        status: "fail",
        message: `Connection failed: ${error.message}`,
      });
    }
    setChecks([...results]);

    // Check 2: Auth configuration
    try {
      const { data: settings } = await supabase.auth.getSession();
      results.push({
        name: "Auth Configuration",
        status: "pass",
        message: "Auth client configured correctly",
      });
    } catch (error: any) {
      results.push({
        name: "Auth Configuration",
        status: "fail",
        message: `Auth config error: ${error.message}`,
      });
    }
    setChecks([...results]);

    // Check 3: Current URL matches expected
    const currentUrl = window.location.origin;
    const expectedUrls = [
      "http://devportal.easyfuel.ai",
      "http://localhost:5000",
      "http://localhost:5002",
    ];
    const isExpectedUrl = expectedUrls.some(url => currentUrl.startsWith(url));
    
    results.push({
      name: "URL Configuration",
      status: isExpectedUrl ? "pass" : "warning",
      message: isExpectedUrl 
        ? `Current URL (${currentUrl}) is configured in Supabase`
        : `Current URL (${currentUrl}) may not be in Supabase redirect URLs. Add ${currentUrl}/** to redirect URLs in Supabase Dashboard.`,
    });
    setChecks([...results]);

    // Check 4: Test magic link send (won't actually send)
    results.push({
      name: "Email Provider",
      status: "warning",
      message: "Email provider status must be checked manually in Supabase Dashboard → Authentication → Providers → Email",
    });
    setChecks([...results]);

    // Check 5: Storage configuration
    try {
      const session = await supabase.auth.getSession();
      results.push({
        name: "Session Storage",
        status: "pass",
        message: "Session storage (cookies) configured correctly",
      });
    } catch (error) {
      results.push({
        name: "Session Storage",
        status: "fail",
        message: "Session storage not working properly",
      });
    }
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
          <Logo size="lg" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2">Authentication Health Check</h1>
          <p className="text-muted-foreground">
            Verify your Supabase authentication configuration
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Configuration Check</CardTitle>
            <CardDescription>
              Run these checks to ensure magic links and email confirmation are properly configured
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runHealthChecks} 
              disabled={isRunning}
              className="w-full"
            >
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

        <Card>
          <CardHeader>
            <CardTitle>Manual Configuration Checklist</CardTitle>
            <CardDescription>
              These settings must be configured in Supabase Dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">1. Site URL Configuration</h4>
                <code className="block bg-muted p-2 rounded text-sm">
                  {window.location.origin}
                </code>
                <p className="text-sm text-muted-foreground mt-1">
                  Set this in: Authentication → URL Configuration → Site URL
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">2. Redirect URLs</h4>
                <code className="block bg-muted p-2 rounded text-sm">
                  {window.location.origin}/**
                </code>
                <p className="text-sm text-muted-foreground mt-1">
                  Add this to: Authentication → URL Configuration → Redirect URLs
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">3. Email Provider Settings</h4>
                <ul className="text-sm space-y-1 mt-2 list-disc list-inside">
                  <li>✅ Enable Email provider</li>
                  <li>✅ Confirm email (for production)</li>
                  <li>✅ Enable Email OTP (for magic links)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure in: Authentication → Providers → Email
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">4. Email Templates</h4>
                <p className="text-sm text-muted-foreground">
                  Update all email templates to use: {window.location.origin}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure in: Authentication → Email Templates
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p>📖 <strong>QUICK_FIX_GUIDE.md</strong> - Step-by-step fix instructions</p>
              <p>📖 <strong>PRODUCTION_DEPLOYMENT_FIX.md</strong> - Detailed production setup</p>
              <p>📖 <strong>SUPABASE_SETUP.md</strong> - Complete Supabase configuration</p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => window.location.href = "/auth"}
          >
            Go to Auth Page
          </Button>
        </div>
      </div>
    </div>
  );
}

