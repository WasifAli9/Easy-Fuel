import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationPermissionBanner } from "@/components/NotificationPermissionBanner";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import RoleSetup from "@/pages/RoleSetup";
import CustomerDashboard from "@/pages/CustomerDashboard";
import SavedAddresses from "@/pages/SavedAddresses";
import PaymentMethods from "@/pages/PaymentMethods";
import CustomerProfile from "@/pages/CustomerProfile";
import DriverDashboard from "@/pages/DriverDashboard";
import SupplierDashboard from "@/pages/SupplierDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ 
  component: Component, 
  role,
  allowWithoutProfile = false
}: { 
  component: React.ComponentType; 
  role?: "customer" | "driver" | "supplier" | "admin";
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
    return <Redirect to="/setup" />;
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

  return (
    <>
      {user && <NotificationPermissionBanner />}
      <Switch>
      <Route path="/">
        {user ? (
          profile ? <Redirect to={`/${profile.role}`} /> : <Redirect to="/setup" />
        ) : (
          <Landing />
        )}
      </Route>
      <Route path="/auth" component={Auth} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/setup">
        {() => <ProtectedRoute component={RoleSetup} allowWithoutProfile={true} />}
      </Route>
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
      <Route path="/supplier">
        {() => <ProtectedRoute component={SupplierDashboard} role="supplier" />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} role="admin" />}
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
