import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, KeyRound, User as UserIcon, Eye, EyeOff, Fuel, Shield, Clock, Truck, Loader2 } from "lucide-react";

export default function Signup() {
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [role, setRole] = useState<"customer" | "driver" | "supplier" | "admin" | "company">("driver");
	const { user, profile, loading: authLoading, signUpWithPassword, refetchProfile } = useAuth();
	const { toast } = useToast();
	const [, setLocation] = useLocation();

	// If already authenticated and profile exists, route to dashboard.
	useEffect(() => {
		if (!authLoading && user) {
			if (profile) {
				const dashboardPath =
					profile.role === "customer"
						? "/customer"
						: profile.role === "driver"
							? "/driver"
							: profile.role === "supplier"
								? "/supplier"
								: profile.role === "admin"
									? "/admin"
									: profile.role === "company"
										? "/company"
										: "/";
				setLocation(dashboardPath);
			}
		}
	}, [user, profile, authLoading, setLocation]);

	// Register creates profile server-side; refetch if the SPA missed it (e.g. cookie timing).
	useEffect(() => {
		if (authLoading || !user || profile) return;
		void refetchProfile();
	}, [authLoading, user, profile, refetchProfile]);

	async function handleSignup(e: React.FormEvent) {
		e.preventDefault();
		if (password !== confirmPassword) {
			toast({
				title: "Passwords do not match",
				description: "Please make sure your password and confirm password are the same.",
				variant: "destructive",
			});
			return;
		}
		setLoading(true);
		try {
			await signUpWithPassword(email, password, fullName, role);
			toast({
				title: "Account created",
				description: "Taking you to your dashboard…",
			});
			window.location.assign(`/${role}`);
		} catch (error: any) {
			console.error("Sign up error:", error);
			const errorMessage = error.message || "";
			const isNetworkError =
				errorMessage.includes("Failed to fetch") ||
				errorMessage.includes("ERR_NAME_NOT_RESOLVED") ||
				errorMessage.includes("NetworkError") ||
				errorMessage.includes("ENOTFOUND");

			if (isNetworkError) {
				toast({
					title: "Connection Error",
					description: "Cannot reach the server. Check your connection and try again.",
					variant: "destructive",
					duration: 10000,
				});
			} else {
				toast({
					title: "Signup Error",
					description: error.message || "Failed to sign up. Please try again.",
					variant: "destructive",
				});
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen flex">
			<div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 via-background to-background">
				<Card className="w-full max-w-md">
					<CardHeader className="space-y-4">
						<div className="flex justify-center">
							<Logo size="lg" />
						</div>
						<div className="text-center space-y-1">
							<CardTitle className="text-2xl">Create your account</CardTitle>
							<CardDescription>Sign up to Easy Fuel and start your setup</CardDescription>
						</div>
					</CardHeader>
					<CardContent>
						{user && !profile ? (
							<div className="text-center space-y-4 py-8" data-testid="local-signup-finishing">
								<Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
								<p className="text-sm text-muted-foreground">Finishing sign-up…</p>
								<p className="text-sm text-muted-foreground">
									<button
										type="button"
										className="underline"
										onClick={() => setLocation("/auth")}
										data-testid="link-to-signin-local-pending"
									>
										Sign in
									</button>
								</p>
							</div>
						) : (
							<form className="space-y-4" onSubmit={handleSignup}>
								<div className="space-y-2">
									<label htmlFor="fullName" className="text-sm font-medium">
										Full Name
									</label>
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
									<label className="text-sm font-medium">Role</label>
									<Select value={role} onValueChange={(v) => setRole(v as any)}>
										<SelectTrigger data-testid="select-role">
											<SelectValue placeholder="Select role" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="customer">Customer</SelectItem>
											<SelectItem value="driver">Driver</SelectItem>
											<SelectItem value="supplier">Supplier</SelectItem>
											<SelectItem value="company">Fleet company</SelectItem>
											<SelectItem value="admin">Admin</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<label htmlFor="email" className="text-sm font-medium">
										Email
									</label>
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
									<label htmlFor="password" className="text-sm font-medium">
										Password
									</label>
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
								<div className="space-y-2">
									<label htmlFor="confirmPassword" className="text-sm font-medium">
										Confirm Password
									</label>
									<div className="relative">
										<Input
											id="confirmPassword"
											type={showConfirmPassword ? "text" : "password"}
											placeholder="Confirm your password"
											value={confirmPassword}
											onChange={(e) => setConfirmPassword(e.target.value)}
											required
											minLength={6}
											data-testid="input-confirm-password"
											className="pr-10"
										/>
										<button
											type="button"
											onClick={() => setShowConfirmPassword((prev) => !prev)}
											className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
											aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
											data-testid="toggle-confirm-password-visibility"
										>
											{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
						)}
					</CardContent>
				</Card>
			</div>

			<div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary via-primary/95 to-primary/90 p-8 flex-col justify-center relative">
				<div className="absolute inset-0 bg-slate-900/20"></div>
				<div className="max-w-lg mx-auto space-y-8 relative z-10">
					<div className="flex items-center gap-3">
						<Logo size="lg" variant="light" />
					</div>

					<div className="space-y-4">
						<h1 className="text-4xl font-bold leading-tight text-slate-50">Join Easy Fuel Today</h1>
						<p className="text-lg text-slate-100/90 leading-relaxed">
							Become part of South Africa's leading fuel delivery marketplace. Whether you're a customer, driver, or supplier, we have the
							tools you need.
						</p>
					</div>

					<div className="space-y-6 pt-4">
						<div className="flex items-start gap-4">
							<div className="p-2 rounded-lg bg-slate-50/15 backdrop-blur-sm flex-shrink-0">
								<Truck className="h-6 w-6 text-slate-50" />
							</div>
							<div>
								<h3 className="font-semibold text-lg mb-1 text-slate-50">For Drivers</h3>
								<p className="text-slate-100/85 text-sm">
									Accept delivery jobs, track routes, and earn with our intelligent dispatch system.
								</p>
							</div>
						</div>

						<div className="flex items-start gap-4">
							<div className="p-2 rounded-lg bg-slate-50/15 backdrop-blur-sm flex-shrink-0">
								<Fuel className="h-6 w-6 text-slate-50" />
							</div>
							<div>
								<h3 className="font-semibold text-lg mb-1 text-slate-50">For Suppliers</h3>
								<p className="text-slate-100/85 text-sm">Manage depots, set prices, and fulfill orders from verified customers.</p>
							</div>
						</div>

						<div className="flex items-start gap-4">
							<div className="p-2 rounded-lg bg-slate-50/15 backdrop-blur-sm flex-shrink-0">
								<Clock className="h-6 w-6 text-slate-50" />
							</div>
							<div>
								<h3 className="font-semibold text-lg mb-1 text-slate-50">Fast Onboarding</h3>
								<p className="text-slate-100/85 text-sm">Quick KYC verification process to get you started in minutes.</p>
							</div>
						</div>

						<div className="flex items-start gap-4">
							<div className="p-2 rounded-lg bg-slate-50/15 backdrop-blur-sm flex-shrink-0">
								<Shield className="h-6 w-6 text-slate-50" />
							</div>
							<div>
								<h3 className="font-semibold text-lg mb-1 text-slate-50">Secure Platform</h3>
								<p className="text-slate-100/85 text-sm">Bank-level security with encrypted payments and verified users.</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
