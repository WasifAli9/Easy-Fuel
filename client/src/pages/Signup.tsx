import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, KeyRound, User as UserIcon, Eye, EyeOff, Fuel, Shield, MapPin, CheckCircle2, Clock, Truck, Loader2 } from "lucide-react";

const AUTH_PROVIDER = (import.meta.env.VITE_AUTH_PROVIDER || "local").toLowerCase();

export default function Signup() {
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [profileLoading, setProfileLoading] = useState(false);
	const [role, setRole] = useState<"customer" | "driver" | "supplier" | "admin" | "company">("driver");
	const [signupSubmitted, setSignupSubmitted] = useState(false);
	const { user, profile, loading: authLoading, signUpWithPassword, setUserRole } = useAuth();
	const { toast } = useToast();
	const [, setLocation] = useLocation();

	const fullNameFromUser =
		(user as any)?.user_metadata?.full_name ||
		(user as any)?.app_metadata?.full_name ||
		fullName;

	// If already authenticated and profile exists, route to dashboard.
	useEffect(() => {
		if (!authLoading && user) {
			if (profile) {
				const dashboardPath = profile.role === "customer" ? "/customer" :
					profile.role === "driver" ? "/driver" :
					profile.role === "supplier" ? "/supplier" :
					profile.role === "admin" ? "/admin" :
					profile.role === "company" ? "/company" : "/";
				setLocation(dashboardPath);
			}
		}
	}, [user, profile, authLoading, setLocation]);

	// Supabase: auth user exists before profiles row — create profile once session exists.
	// Local auth: register already creates profile + role; skip this path.
	useEffect(() => {
		if (AUTH_PROVIDER === "local") return;
		if (authLoading) return;
		if (!user || profile) return;
		if (!signupSubmitted) return;
		if (profileLoading) return;

		const name = fullNameFromUser ? String(fullNameFromUser).trim() : "";
		if (!name) return;

		setSignupSubmitted(false);
		(async () => {
			setProfileLoading(true);
			try {
				await setUserRole(role, name);
				toast({ title: "Profile created", description: "Your account is all set up!" });
				setLocation(`/${role}`);
			} catch (e: any) {
				toast({ title: "Error", description: e?.message || "Failed to create profile", variant: "destructive" });
			} finally {
				setProfileLoading(false);
			}
		})();
	}, [authLoading, user, profile, signupSubmitted, profileLoading, fullNameFromUser, role, setLocation, setUserRole, toast]);

	async function handleCreateProfile() {
		if (!user) return;
		if (!fullNameFromUser || !String(fullNameFromUser).trim()) {
			toast({ title: "Full name missing", description: "Please provide your full name to finish setup.", variant: "destructive" });
			return;
		}

		setProfileLoading(true);
		try {
			await setUserRole(role, String(fullNameFromUser).trim());
			toast({ title: "Profile created", description: "Your account is all set up!" });
			setLocation(`/${role}`);
		} catch (e: any) {
			toast({ title: "Error", description: e?.message || "Failed to create profile", variant: "destructive" });
		} finally {
			setProfileLoading(false);
		}
	}

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
		setSignupSubmitted(false);
		try {
			await signUpWithPassword(email, password, fullName, role);
			setSignupSubmitted(true);
			// Depending on Supabase settings, the user may need to confirm email before session exists.
			toast({
				title: "Check your email",
				description: "If email verification is required, confirm your email to continue. You'll be redirected to complete setup.",
			});
		} catch (error: any) {
			console.error("Sign up error:", error);
			
			// Check for network/DNS errors
			const errorMessage = error.message || "";
			const isNetworkError = 
				errorMessage.includes("Failed to fetch") ||
				errorMessage.includes("ERR_NAME_NOT_RESOLVED") ||
				errorMessage.includes("NetworkError") ||
				errorMessage.includes("ENOTFOUND");
			
			if (isNetworkError) {
				toast({
					title: "Connection Error",
					description: "Cannot reach Supabase. This usually means your Supabase project is paused. Please visit https://supabase.com/dashboard to wake up your project, or check your internet connection.",
					variant: "destructive",
					duration: 10000, // Show for 10 seconds
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
			{/* Left Side - Signup Form */}
			<div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 via-background to-background">
				<Card className="w-full max-w-md">
					<CardHeader className="space-y-4">
						<div className="flex justify-center">
							<Logo size="lg" />
						</div>
						<div className="text-center space-y-1">
							<CardTitle className="text-2xl">{user && !profile ? "Complete setup" : "Create your account"}</CardTitle>
							<CardDescription>
								{user && !profile
									? "Choose your role to activate your account"
									: "Sign up to Easy Fuel and start your setup"}
							</CardDescription>
						</div>
					</CardHeader>
				<CardContent>
					{user && !profile ? (
						<form
							className="space-y-4"
							onSubmit={(e) => {
								e.preventDefault();
								handleCreateProfile();
							}}
						>
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

							{(!fullNameFromUser || !String(fullNameFromUser).trim()) && (
								<div className="space-y-2">
									<label htmlFor="setupFullName" className="text-sm font-medium">
										Full name
									</label>
									<Input
										id="setupFullName"
										placeholder="Your full name"
										value={fullName}
										onChange={(e) => setFullName(e.target.value)}
										required
										data-testid="input-setup-fullname"
									/>
								</div>
							)}

							<Button type="submit" className="w-full" disabled={profileLoading} data-testid="button-create-profile">
								{profileLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
								{profileLoading ? "Creating profile..." : "Continue"}
							</Button>

							<div className="text-sm text-center text-muted-foreground">
								Already have an account?{" "}
								<button type="button" className="underline" onClick={() => setLocation("/auth")} data-testid="link-to-signin">
									Sign In
								</button>
							</div>
						</form>
					) : (
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
						<div className="space-y-2">
							<label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</label>
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

			{/* Right Side - Features Section */}
			<div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary via-primary/95 to-primary/90 p-8 flex-col justify-center relative">
				<div className="absolute inset-0 bg-slate-900/20"></div>
				<div className="max-w-lg mx-auto space-y-8 relative z-10">
					{/* Logo */}
					<div className="flex items-center gap-3">
						<Logo size="lg" variant="light" />
					</div>

					{/* Main Heading */}
					<div className="space-y-4">
						<h1 className="text-4xl font-bold leading-tight text-slate-50">
							Join Easy Fuel Today
						</h1>
						<p className="text-lg text-slate-100/90 leading-relaxed">
							Become part of South Africa's leading fuel delivery marketplace. Whether you're a customer, driver, or supplier, we have the tools you need.
						</p>
					</div>

					{/* Features List */}
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
								<p className="text-slate-100/85 text-sm">
									Manage depots, set prices, and fulfill orders from verified customers.
								</p>
							</div>
						</div>

						<div className="flex items-start gap-4">
							<div className="p-2 rounded-lg bg-slate-50/15 backdrop-blur-sm flex-shrink-0">
								<Clock className="h-6 w-6 text-slate-50" />
							</div>
							<div>
								<h3 className="font-semibold text-lg mb-1 text-slate-50">Fast Onboarding</h3>
								<p className="text-slate-100/85 text-sm">
									Quick KYC verification process to get you started in minutes.
								</p>
							</div>
						</div>

						<div className="flex items-start gap-4">
							<div className="p-2 rounded-lg bg-slate-50/15 backdrop-blur-sm flex-shrink-0">
								<Shield className="h-6 w-6 text-slate-50" />
							</div>
							<div>
								<h3 className="font-semibold text-lg mb-1 text-slate-50">Secure Platform</h3>
								<p className="text-slate-100/85 text-sm">
									Bank-level security with encrypted payments and verified users.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}


