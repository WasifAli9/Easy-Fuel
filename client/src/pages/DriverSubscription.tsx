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
import { ArrowLeft, CheckCircle2, XCircle, Loader2, CreditCard, LayoutDashboard, Car, DollarSign, Settings, History, Warehouse, Store, Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  priceZAR: number;
  orderNotifications: string;
  deliveryRadius: string;
  earningsDashboard: string;
  ratingsBoost: boolean;
  support: string;
}

export default function DriverSubscription() {
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
    subscription: { id: string; planCode: string; status: string; nextBillingAt: string | null; plan?: Plan } | null;
    hasActiveSubscription: boolean;
  }>({
    queryKey: ["/api/driver/subscription"],
  });

  const { data: plansData } = useQuery<{ plans: Plan[]; ozowConfigured: boolean; testMode?: boolean }>({
    queryKey: ["/api/driver/subscription/plans"],
  });

  const createPayment = useMutation({
    mutationFn: async (planCode: string) => {
      const res = await apiRequest("POST", "/api/driver/subscription/create-payment", { planCode });
      const json = await res.json();
      if (json.success && !json.redirectUrl) return json;
      if (json.redirectUrl) window.location.href = json.redirectUrl;
      else throw new Error(json.error || "No redirect URL");
    },
    onSuccess: (data: { success?: boolean; redirectUrl?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/subscription"] });
      if (data?.success && !data?.redirectUrl) toast({ title: "Subscribed", description: "Subscription activated (test mode).", variant: "default" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const cancelSub = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/driver/subscription/cancel");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/subscription"] });
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
          <aside className="hidden md:flex flex-col w-60 min-w-[240px] shrink-0 border-r border-border bg-muted/30 min-h-0 z-10" aria-label="Driver navigation">
            <nav className="sticky top-0 flex flex-col p-3 gap-0.5 overflow-y-auto">
              <div className="px-3 py-2 mb-1"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Menu</p></div>
              <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><LayoutDashboard className="h-5 w-5 shrink-0" /> My Jobs</Link>
              <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Car className="h-5 w-5 shrink-0" /> Vehicles</Link>
              <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><DollarSign className="h-5 w-5 shrink-0" /> Pricing</Link>
              <span className={cn("w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-primary/12 text-primary")}><CreditCard className="h-5 w-5 shrink-0" /> Billing</span>
              <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="h-5 w-5 shrink-0" /> Settings</Link>
              <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><History className="h-5 w-5 shrink-0" /> History</Link>
              <Separator className="my-2" />
              <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Warehouse className="h-5 w-5 shrink-0" /> My Depot Orders</Link>
              <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Store className="h-5 w-5 shrink-0" /> Available Depots</Link>
            </nav>
          </aside>
          <div className="flex-1 flex items-center justify-center p-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  const hasActive = subData?.hasActiveSubscription ?? false;
  const subscription = subData?.subscription;
  const plans = plansData?.plans ?? [];
  const ozowConfigured = plansData?.ozowConfigured ?? false;
  const nextBilling = subscription?.nextBillingAt ? new Date(subscription.nextBillingAt) : null;
  const needsRenewal = subscription && !hasActive && (subscription.status === "past_due" || (nextBilling && nextBilling < new Date()));

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      <div className="flex flex-1 min-h-0">
        {/* Side menu - same as DriverDashboard so it stays visible on Billing */}
        <aside className="hidden md:flex flex-col w-60 min-w-[240px] shrink-0 border-r border-border bg-muted/30 min-h-0 z-10" aria-label="Driver navigation">
          <nav className="sticky top-0 flex flex-col p-3 gap-0.5 overflow-y-auto">
            <div className="px-3 py-2 mb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
            </div>
            <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <LayoutDashboard className="h-5 w-5 shrink-0" /> My Jobs
            </Link>
            <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Car className="h-5 w-5 shrink-0" /> Vehicles
            </Link>
            <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <DollarSign className="h-5 w-5 shrink-0" /> Pricing
            </Link>
            <span className={cn("w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-primary/12 text-primary")}>
              <CreditCard className="h-5 w-5 shrink-0" /> Billing
            </span>
            <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Settings className="h-5 w-5 shrink-0" /> Settings
            </Link>
            <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <History className="h-5 w-5 shrink-0" /> History
            </Link>
            <Separator className="my-2" />
            <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Warehouse className="h-5 w-5 shrink-0" /> My Depot Orders
            </Link>
            <Link href="/driver" className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Store className="h-5 w-5 shrink-0" /> Available Depots
            </Link>
          </nav>
        </aside>

        <Button variant="outline" size="icon" className="md:hidden fixed bottom-4 right-4 z-40 rounded-full shadow-lg" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <nav className="flex flex-col h-full py-4">
              <div className="px-4 pb-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Menu</p></div>
              <div className="flex-1 overflow-y-auto space-y-1 px-2">
                <Link href="/driver" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><LayoutDashboard className="h-5 w-5 shrink-0" /> My Jobs</Link>
                <Link href="/driver" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Car className="h-5 w-5 shrink-0" /> Vehicles</Link>
                <Link href="/driver" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><DollarSign className="h-5 w-5 shrink-0" /> Pricing</Link>
                <span className={cn("w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-primary/12 text-primary")}><CreditCard className="h-5 w-5 shrink-0" /> Billing</span>
                <Link href="/driver" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="h-5 w-5 shrink-0" /> Settings</Link>
                <Link href="/driver" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><History className="h-5 w-5 shrink-0" /> History</Link>
                <Separator className="my-2" />
                <Link href="/driver" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Warehouse className="h-5 w-5 shrink-0" /> My Depot Orders</Link>
                <Link href="/driver" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Store className="h-5 w-5 shrink-0" /> Available Depots</Link>
              </div>
            </nav>
          </SheetContent>
        </Sheet>

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="w-full min-w-0 px-5 sm:px-8 lg:px-10 py-4 sm:py-8">
        <Link href="/driver">
          <Button variant="ghost" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <h1 className="text-2xl font-bold mb-2">Driver Subscription</h1>
        <p className="text-muted-foreground mb-6">
          Subscribe to start accepting orders and ordering from suppliers. Choose a plan below.
        </p>

        {urlStatus === "success" && (
          <Alert className="mb-6 border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle>Payment successful</AlertTitle>
            <AlertDescription>Your subscription is now active. You can accept orders and order from suppliers.</AlertDescription>
          </Alert>
        )}
        {urlStatus === "cancelled" && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
            <XCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Payment cancelled</AlertTitle>
            <AlertDescription>You can try again by selecting a plan below.</AlertDescription>
          </Alert>
        )}

        {(hasActive || needsRenewal) && subscription && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {hasActive ? "Current plan" : "Subscription lapsed"}
                <Badge variant={hasActive ? "default" : "secondary"}>{subscription.plan?.name ?? subscription.planCode}</Badge>
              </CardTitle>
              <CardDescription>
                {hasActive
                  ? `Next billing: ${subscription.nextBillingAt ? new Date(subscription.nextBillingAt).toLocaleDateString() : "—"}`
                  : "Renew to continue accepting orders and ordering from suppliers."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {needsRenewal && ozowConfigured && (
                <Button onClick={() => createPayment.mutate(subscription.planCode)} disabled={createPayment.isPending}>
                  {createPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                  Renew now
                </Button>
              )}
              {hasActive && (
                <Button variant="outline" onClick={() => cancelSub.mutate()} disabled={cancelSub.isPending}>
                  {cancelSub.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel subscription"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {!ozowConfigured && !plansData?.testMode && (
          <Alert className="mb-6">
            <AlertTitle>Payment gateway not configured</AlertTitle>
            <AlertDescription>Subscribe button will be available once OZOW is configured.</AlertDescription>
          </Alert>
        )}
        {plansData?.testMode && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
            <AlertTitle>Test mode</AlertTitle>
            <AlertDescription>Subscribing will activate the plan immediately without payment checkout.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-3 items-stretch">
          {plans.map((plan) => (
            <Card key={plan.code} className="flex flex-col h-full">
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  R{plan.priceZAR} <span className="text-muted-foreground">/ month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <ul className="text-sm space-y-2 text-muted-foreground flex-1">
                  <li>Platform Access: ✓</li>
                  <li>Order Notifications: {plan.orderNotifications.replace("_", " ")}</li>
                  <li>Delivery Radius: {plan.deliveryRadius}</li>
                  <li>Earnings Dashboard: {plan.earningsDashboard.replace("_", " + ")}</li>
                  <li>Customer Ratings Boost: {plan.ratingsBoost ? "✓" : "—"}</li>
                  <li>Dedicated Support: {plan.support === "none" ? "—" : plan.support.replace("_", " + ")}</li>
                </ul>
                <Button
                  className="w-full mt-4"
                  disabled={(!ozowConfigured && !plansData?.testMode) || createPayment.isPending || (hasActive && subscription?.planCode === plan.code)}
                  onClick={() => createPayment.mutate(plan.code)}
                >
                  {createPayment.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      {hasActive && subscription?.planCode === plan.code ? "Current plan" : plansData?.testMode ? "Subscribe (test)" : "Subscribe with OZOW"}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      </main>
      </div>
    </div>
  );
}
