import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationPermissionBanner } from "@/components/NotificationPermissionBanner";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { AutoLogoutHandler } from "@/components/AutoLogoutHandler";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import AuthTest from "@/pages/AuthTest";
import ResetPassword from "@/pages/ResetPassword";
import Signup from "@/pages/Signup";
import CustomerDashboard from "@/pages/CustomerDashboard";
import SavedAddresses from "@/pages/SavedAddresses";
import PaymentMethods from "@/pages/PaymentMethods";
import CustomerProfile from "@/pages/CustomerProfile";
import DriverDashboard from "@/pages/DriverDashboard";
import DriverProfile from "@/pages/DriverProfile";
import DriverSubscription from "@/pages/DriverSubscription";
import SupplierDashboard from "@/pages/SupplierDashboard";
import SupplierProfile from "@/pages/SupplierProfile";
import SupplierSubscription from "@/pages/SupplierSubscription";
import AdminDashboard from "@/pages/AdminDashboard";
import CompanyDashboard from "@/pages/CompanyDashboard";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ 
  component: Component, 
  role,
  allowWithoutProfile = false
}: { 
  component: React.ComponentType; 
  role?: "customer" | "driver" | "supplier" | "admin" | "company";
  allowWithoutProfile?: boolean;
}) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  // Allow access without profile for role setup
  if (!profile && !allowWithoutProfile) {
    return <Redirect to="/auth" />;
  }

  // Redirect to role-specific dashboard if profile exists and accessing setup
  if (profile && allowWithoutProfile) {
    return <Redirect to={`/${profile.role}`} />;
  }

  if (role && profile && profile.role !== role) {
    return <Redirect to={`/${profile.role}`} />;
  }

  return <Component />;
}

function Router() {
  const { user, profile } = useAuth();
  
  // Set up global real-time updates via WebSocket
  useRealtimeUpdates();

  return (
    <>
      <PwaInstallPrompt />
      {user && <NotificationPermissionBanner />}
      <Switch>
      <Route path="/">
        {user ? (
          profile ? <Redirect to={`/${profile.role}`} /> : <Redirect to="/auth" />
        ) : (
          <Landing />
        )}
      </Route>
      <Route path="/auth" component={Auth} />
      <Route path="/auth-test" component={AuthTest} />
      <Route path="/signup" component={Signup} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/customer">
        {() => <ProtectedRoute component={CustomerDashboard} role="customer" />}
      </Route>
      <Route path="/customer/addresses">
        {() => <ProtectedRoute component={SavedAddresses} role="customer" />}
      </Route>
      <Route path="/customer/payment-methods">
        {() => <ProtectedRoute component={PaymentMethods} role="customer" />}
      </Route>
      <Route path="/customer/profile">
        {() => <ProtectedRoute component={CustomerProfile} role="customer" />}
      </Route>
      <Route path="/driver">
        {() => <ProtectedRoute component={DriverDashboard} role="driver" />}
      </Route>
      <Route path="/driver/profile">
        {() => <ProtectedRoute component={DriverProfile} role="driver" />}
      </Route>
      <Route path="/driver/subscription">
        {() => <ProtectedRoute component={DriverSubscription} role="driver" />}
      </Route>
      <Route path="/supplier">
        {() => <ProtectedRoute component={SupplierDashboard} role="supplier" />}
      </Route>
      <Route path="/supplier/profile">
        {() => <ProtectedRoute component={SupplierProfile} role="supplier" />}
      </Route>
      <Route path="/supplier/subscription">
        {() => <ProtectedRoute component={SupplierSubscription} role="supplier" />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
      </Route>
      <Route path="/company">
        {() => <ProtectedRoute component={CompanyDashboard} role="company" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <AutoLogoutHandler />
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
