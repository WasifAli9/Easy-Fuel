import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, KeyRound, User as UserIcon, Eye, EyeOff } from "lucide-react";

export default function Signup() {
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const { user, profile, loading: authLoading, signUpWithPassword } = useAuth();
	const { toast } = useToast();
	const [, setLocation] = useLocation();

	// If already authenticated, route to dashboard or setup
	useEffect(() => {
		if (!authLoading && user) {
			if (profile) {
				const dashboardPath = profile.role === "customer" ? "/customer" :
					profile.role === "driver" ? "/driver" :
					profile.role === "supplier" ? "/supplier" :
					profile.role === "admin" ? "/admin" : "/";
				setLocation(dashboardPath);
			} else {
				setLocation("/setup");
			}
		}
	}, [user, profile, authLoading, setLocation]);

	async function handleSignup(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		try {
			await signUpWithPassword(email, password, fullName);
			// Depending on Supabase settings, the user may need to confirm email before session exists.
			toast({
				title: "Check your email",
				description: "If email verification is required, confirm your email to continue. You'll be redirected to complete setup.",
			});
		} catch (error: any) {
			console.error("Sign up error:", error);
			toast({
				title: "Signup Error",
				description: error.message || "Failed to sign up",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-1">
					<CardTitle className="text-2xl">Create your account</CardTitle>
					<CardDescription>Sign up to Easy Fuel and start your setup</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" onSubmit={handleSignup}>
						<div className="space-y-2">
							<label htmlFor="fullName" className="text-sm font-medium">Full Name</label>
							<div className="relative">
								<Input
									id="fullName"
									placeholder="Jane Doe"
									value={fullName}
									onChange={(e) => setFullName(e.target.value)}
									required
									data-testid="input-fullname"
								/>
								<UserIcon className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
							</div>
						</div>
						<div className="space-y-2">
							<label htmlFor="email" className="text-sm font-medium">Email</label>
							<div className="relative">
								<Input
									id="email"
									type="email"
									placeholder="you@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									data-testid="input-email"
								/>
								<Mail className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
							</div>
						</div>
						<div className="space-y-2">
							<label htmlFor="password" className="text-sm font-medium">Password</label>
							<div className="relative">
								<Input
									id="password"
									type={showPassword ? "text" : "password"}
									placeholder="Create a password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									minLength={6}
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
						<Button type="submit" className="w-full" disabled={loading} data-testid="button-signup">
							<KeyRound className="h-4 w-4 mr-2" />
							{loading ? "Creating account..." : "Sign Up"}
						</Button>
						<div className="text-sm text-center text-muted-foreground">
							Already have an account?{" "}
							<button type="button" className="underline" onClick={() => setLocation("/auth")} data-testid="link-to-signin">
								Sign In
							</button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}


