import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, CreditCard, Mail, Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DashboardSidebarAside } from "@/components/dashboard/DashboardSidebar";
import { SupplierWorkspaceSidebar } from "@/components/dashboard/SupplierWorkspaceSidebar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SupplierPlan {
  code: string;
  name: string;
  priceCents: number | null;
  priceZAR: number | null;
  isCustomPricing: boolean;
  platformListing: boolean;
  orderManagementDashboard: boolean;
  orderManagementMultiBranch: boolean;
  driverAccess: string;
  analyticsLevel: string;
  invoicing: boolean;
  invoicingCustomTemplates: boolean;
  settlementSpeed: string;
  accountManager: boolean;
}

export default function SupplierSubscription() {
  const search = useSearch();
  const { toast } = useToast();
  const [urlStatus, setUrlStatus] = useState<"success" | "cancelled" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("success") === "true") setUrlStatus("success");
    else if (params.get("cancelled") === "true") setUrlStatus("cancelled");
  }, [search]);

  const { data: subData, isLoading: subLoading } = useQuery<{
    subscription: { id: string; plan_code: string; status: string; isActive?: boolean; next_billing_at?: string | null } | null;
    subscriptionTier: string | null;
  }>({
    queryKey: ["/api/supplier/subscription"],
  });

  const { data: plansData } = useQuery<{ plans: SupplierPlan[]; ozowConfigured: boolean }>({
    queryKey: ["/api/supplier/subscription/plans"],
  });

  const createPayment = useMutation({
    mutationFn: async (planCode: string) => {
      const res = await apiRequest("POST", "/api/supplier/subscription/create-payment", { planCode });
      const json = await res.json();
      if (json.redirectUrl) window.location.href = json.redirectUrl;
      else throw new Error(json.error || "No redirect URL");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/subscription"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const cancelSub = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/supplier/subscription/cancel");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/subscription"] });
      toast({ title: "Subscription cancelled", description: "Your subscription will end at the current period." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (subLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <div className="flex flex-1 min-h-0">
          <DashboardSidebarAside aria-label="Supplier navigation">
            <SupplierWorkspaceSidebar active="billing" />
          </DashboardSidebarAside>
          <div className="flex-1 flex items-center justify-center p-4 dashboard-main-area">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  const subscription = subData?.subscription ?? null;
  const subscriptionTier = subData?.subscriptionTier ?? null;
  const hasActive = subscription?.isActive ?? (!!subscriptionTier && subscription?.status === "active");
  const plans = plansData?.plans ?? [];
  const ozowConfigured = plansData?.ozowConfigured ?? false;
  const nextBilling = subscription?.next_billing_at ? new Date(subscription.next_billing_at) : null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      <div className="flex flex-1 min-h-0">
        <DashboardSidebarAside aria-label="Supplier navigation">
          <SupplierWorkspaceSidebar active="billing" />
        </DashboardSidebarAside>

        <Button
          variant="outline"
          size="icon"
          className="md:hidden fixed bottom-4 right-4 z-40 rounded-full shadow-lg"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="w-[min(100vw-2rem,288px)] p-0 overflow-hidden flex flex-col bg-sidebar border-r border-sidebar-border"
          >
            <div className="flex flex-col h-full min-h-0">
              <SupplierWorkspaceSidebar
                active="billing"
                onNavigate={() => setSidebarOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

      <main className="flex-1 min-w-0 overflow-auto dashboard-main-area">
        <div className="w-full min-w-0 px-5 sm:px-8 lg:px-10 py-4 sm:py-8">
        <Link href="/supplier">
          <Button variant="ghost" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <h1 className="text-2xl font-bold mb-2">Supplier Subscription</h1>
        <p className="text-muted-foreground mb-6">
          Subscribe to list on the platform and receive driver depot orders. Choose a plan below.
        </p>

        {urlStatus === "success" && (
          <Alert className="mb-6 border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle>Payment successful</AlertTitle>
            <AlertDescription>Your subscription is now active. Your depots are listed and you can receive orders.</AlertDescription>
          </Alert>
        )}
        {urlStatus === "cancelled" && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
            <XCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Payment cancelled</AlertTitle>
            <AlertDescription>You can try again by selecting Standard below.</AlertDescription>
          </Alert>
        )}

        {hasActive && subscription && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Current plan
                <Badge variant="default">{subscription.plan_code === "enterprise" ? "Enterprise" : "Standard"}</Badge>
              </CardTitle>
              <CardDescription>
                {subscription.plan_code === "standard" && nextBilling
                  ? `Next billing: ${nextBilling.toLocaleDateString()}`
                  : subscription.plan_code === "enterprise"
                    ? "Custom pricing – contact your account manager for billing."
                    : "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {subscription.plan_code === "standard" && (
                <Button variant="outline" onClick={() => cancelSub.mutate()} disabled={cancelSub.isPending}>
                  {cancelSub.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel subscription"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {plans.map((plan) => (
            <Card key={plan.code} className="flex flex-col">
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  {plan.isCustomPricing ? "Custom pricing" : `R${plan.priceZAR} / month`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li>Platform listing: ✓</li>
                  <li>Order management: {plan.orderManagementMultiBranch ? "Multi-branch" : "Yes"}</li>
                  <li>Driver access: {plan.driverAccess.replace("_", " + ")}</li>
                  <li>Analytics: {plan.analyticsLevel.replace("_", " + ")}</li>
                  <li>Invoicing: {plan.invoicingCustomTemplates ? "Yes + custom templates" : "Yes"}</li>
                  <li>Settlement: {plan.settlementSpeed.replace("_", "-")}</li>
                  <li>Account manager: {plan.accountManager ? "Yes (dedicated)" : "No"}</li>
                </ul>
                {plan.code === "standard" ? (
                  <Button
                    className="w-full mt-4"
                    disabled={!ozowConfigured || createPayment.isPending || (hasActive && subscriptionTier === "standard")}
                    onClick={() => createPayment.mutate("standard")}
                  >
                    {createPayment.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        {hasActive && subscriptionTier === "standard" ? "Current plan" : "Subscribe with OZOW"}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="w-full mt-4"
                    variant="outline"
                    disabled={hasActive && subscriptionTier === "enterprise"}
                    asChild
                  >
                    <a href="mailto:sales@easyfuel.co.za?subject=Enterprise%20plan%20inquiry">
                      <Mail className="h-4 w-4 mr-2" />
                      {hasActive && subscriptionTier === "enterprise" ? "Current plan" : "Contact sales"}
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {!ozowConfigured && (
          <Alert className="mt-6">
            <AlertTitle>Payment gateway not configured</AlertTitle>
            <AlertDescription>Standard plan subscribe button will be available once OZOW is configured.</AlertDescription>
          </Alert>
        )}
      </div>
      </main>
      </div>
    </div>
  );
}
