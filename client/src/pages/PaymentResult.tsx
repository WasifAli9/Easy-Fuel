import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

function dashboardForContext(context: string): string {
  if (context === "depot_order") return "/driver";
  return "/customer";
}

function readReturnParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    context: params.get("context") || "order",
    id: params.get("id") || "",
    status: params.get("status") || "",
    ref: params.get("ref") || "",
  };
}

export function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const { context, status, ref } = readReturnParams();
  const dashboard = dashboardForContext(context);
  const statusLower = status.toLowerCase();
  const looksComplete =
    !status ||
    statusLower === "complete" ||
    statusLower === "completed" ||
    statusLower === "success";

  useEffect(() => {
    const timer = setTimeout(() => setLocation(dashboard), 3500);
    return () => clearTimeout(timer);
  }, [dashboard, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-2" />
          <CardTitle>
            {looksComplete ? "Payment received" : "Payment submitted"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-muted-foreground">
          <p>
            {looksComplete
              ? "Ozow redirected you back to EasyFuel. Your order will update shortly once the payment is confirmed."
              : `Ozow returned status “${status}”. Your order will update when the payment is confirmed.`}
          </p>
          {ref ? <p className="text-xs">Reference: {ref}</p> : null}
          <p className="text-xs">Taking you back to your dashboard…</p>
          <Button onClick={() => setLocation(dashboard)}>Back to dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function PaymentCancelPage() {
  const [, setLocation] = useLocation();
  const { context, status } = readReturnParams();
  const dashboard = dashboardForContext(context);
  const title =
    status.toLowerCase() === "error" || status.toLowerCase() === "failed"
      ? "Payment failed"
      : "Payment cancelled";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-muted-foreground">
          <p>You can try again from your order when ready.</p>
          <Button variant="outline" onClick={() => setLocation(dashboard)}>
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function PaymentProcessingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
