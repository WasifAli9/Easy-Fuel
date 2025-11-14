import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Mail, KeyRound, Eye, EyeOff } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { user, profile, loading: authLoading, signInWithOtp, signInWithPassword, resetPassword } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (!authLoading && user) {
      if (profile) {
        // Redirect to role-specific dashboard
        const dashboardPath = profile.role === 'customer' ? '/customer' :
                             profile.role === 'driver' ? '/driver' :
                             profile.role === 'supplier' ? '/supplier' :
                             profile.role === 'admin' ? '/admin' : '/';
        setLocation(dashboardPath);
      } else {
        // No profile yet, redirect to setup
        setLocation('/setup');
      }
    }
  }, [user, profile, authLoading, setLocation]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await signInWithOtp(email);
      setOtpSent(true);
      toast({
        title: "Check your email",
        description: "We've sent you a magic link to sign in.",
      });
    } catch (error: any) {
      console.error("Sign in error:", error);
      toast({
        title: "Authentication Error",
        description: error.message || "Failed to send magic link. Please check Supabase configuration.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await signInWithPassword(email, password);
      toast({
        title: "Success!",
        description: "Signed in successfully",
      });
    } catch (error: any) {
      console.error("Sign in error:", error);
      toast({
        title: "Authentication Error",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await resetPassword(email);
      setResetEmailSent(true);
      toast({
        title: "Check your email",
        description: "We've sent you a password reset link",
      });
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <div>
            <CardTitle className="text-2xl">Welcome to Easy Fuel</CardTitle>
            <CardDescription>
              {otpSent
                ? "Check your email for the magic link"
                : "Sign in to access your account"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="password" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password" data-testid="tab-password">
                <KeyRound className="h-4 w-4 mr-2" />
                Password
              </TabsTrigger>
              <TabsTrigger value="magic-link" data-testid="tab-magic-link">
                <Mail className="h-4 w-4 mr-2" />
                Magic Link
              </TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="mt-4">
              {!showForgotPassword ? (
                <form onSubmit={handlePasswordSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email-pass" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email-pass"
                      type="email"
                      placeholder="customer@easyfuel.ai"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      data-testid="input-email-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-xs text-primary hover:underline"
                        data-testid="button-forgot-password"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        data-testid="input-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        data-testid="toggle-password-visibility"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                    data-testid="button-signin-password"
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Use this for @easyfuel.ai test accounts
                  </p>
                </form>
              ) : (
                <div className="space-y-4">
                  {!resetEmailSent ? (
                    <>
                      <div className="text-center space-y-2">
                        <h3 className="text-lg font-semibold">Reset Password</h3>
                        <p className="text-sm text-muted-foreground">
                          Enter your email and we'll send you a reset link
                        </p>
                      </div>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="space-y-2">
                          <label htmlFor="email-reset" className="text-sm font-medium">
                            Email
                          </label>
                          <Input
                            id="email-reset"
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            data-testid="input-email-reset"
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={loading}
                          data-testid="button-send-reset"
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          {loading ? "Sending..." : "Send Reset Link"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowForgotPassword(false)}
                          className="w-full"
                          data-testid="button-back-to-signin"
                        >
                          Back to Sign In
                        </Button>
                      </form>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="p-6 bg-primary/10 rounded-lg">
                        <Mail className="h-12 w-12 text-primary mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Password reset link sent to <strong>{email}</strong>
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowForgotPassword(false);
                          setResetEmailSent(false);
                        }}
                        className="w-full"
                        data-testid="button-back-signin"
                      >
                        Back to Sign In
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="magic-link" className="mt-4">
              {!otpSent ? (
                <form onSubmit={handleMagicLink} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email-magic" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email-magic"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      data-testid="input-email-magic"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                    data-testid="button-magic-link"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {loading ? "Sending..." : "Send Magic Link"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    We'll send you a secure link to sign in
                  </p>
                </form>
              ) : (
                <div className="text-center space-y-4">
                  <div className="p-6 bg-primary/10 rounded-lg">
                    <Mail className="h-12 w-12 text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      We've sent a magic link to <strong>{email}</strong>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setOtpSent(false)}
                    className="w-full"
                    data-testid="button-back"
                  >
                    Use different email
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
