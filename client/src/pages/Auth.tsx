import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowRight } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const { signInWithOtp } = useAuth();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
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
          {!otpSent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="button-signin"
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
        </CardContent>
      </Card>
    </div>
  );
}
