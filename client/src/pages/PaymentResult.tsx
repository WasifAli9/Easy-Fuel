import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const context = params.get("context") || "order";
  const id = params.get("id") || "";

  useEffect(() => {
    const timer = setTimeout(() => {
      if (context === "depot_order") {
        setLocation("/driver");
      } else {
        setLocation("/customer");
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [context, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-2" />
          <CardTitle>Payment processing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-muted-foreground">
          <p>
            Thank you. If your payment was successful, your order will update shortly.
          </p>
          <Button
            onClick={() =>
              setLocation(context === "depot_order" ? "/driver" : "/customer")
            }
          >
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function PaymentCancelPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const context = params.get("context") || "order";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
          <CardTitle>Payment cancelled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-muted-foreground">
          <p>You can try again from your order when ready.</p>
          <Button
            variant="outline"
            onClick={() =>
              setLocation(context === "depot_order" ? "/driver" : "/customer")
            }
          >
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
