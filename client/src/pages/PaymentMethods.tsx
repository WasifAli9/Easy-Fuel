import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CreditCard, Building2, Plus, Trash2, Star } from "lucide-react";
import { AddPaymentMethodDialog } from "@/components/AddPaymentMethodDialog";

export default function PaymentMethods() {
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const { toast } = useToast();

  const { data: paymentMethods = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/payment-methods"],
  });

  const deletePaymentMethodMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/payment-methods/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({
        title: "Payment method deleted",
        description: "Your payment method has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment method",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this payment method?")) {
      deletePaymentMethodMutation.mutate(id);
    }
  };

  const getPaymentMethodIcon = (methodType: string) => {
    if (methodType === "bank_account") {
      return <Building2 className="h-5 w-5 text-muted-foreground" />;
    }
    return <CreditCard className="h-5 w-5 text-muted-foreground" />;
  };

  const formatPaymentMethodType = (methodType: string) => {
    const typeMap: Record<string, string> = {
      bank_account: "Bank Account",
      credit_card: "Credit Card",
      debit_card: "Debit Card",
    };
    return typeMap[methodType] || methodType;
  };

  const formatAccountType = (accountType: string) => {
    const typeMap: Record<string, string> = {
      cheque: "Cheque",
      savings: "Savings",
      transmission: "Transmission",
    };
    return typeMap[accountType] || accountType;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-payment-methods">
                Payment Methods
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your saved payment methods for easy checkout
              </p>
            </div>
            <Button onClick={() => setOpenAddDialog(true)} data-testid="button-add-payment-method">
              <Plus className="h-4 w-4 mr-2" />
              Add Payment Method
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading payment methods...
            </div>
          ) : paymentMethods.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No payment methods</h3>
                <p className="text-muted-foreground mb-6">
                  Add a payment method to streamline your orders
                </p>
                <Button onClick={() => setOpenAddDialog(true)} data-testid="button-add-first-payment">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Payment Method
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {paymentMethods.map((method) => (
                <Card key={method.id} className="hover-elevate" data-testid={`card-payment-${method.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getPaymentMethodIcon(method.method_type)}
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {method.label}
                          {method.is_default && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3" />
                              Default
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {formatPaymentMethodType(method.method_type)}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(method.id)}
                      disabled={deletePaymentMethodMutation.isPending}
                      data-testid={`button-delete-payment-${method.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm">
                      {method.method_type === "bank_account" ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bank:</span>
                            <span className="font-medium">{method.bank_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account Holder:</span>
                            <span className="font-medium">{method.account_holder_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account Number:</span>
                            <span className="font-medium">
                              ****{method.account_number?.slice(-4) || "****"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Branch Code:</span>
                            <span className="font-medium">{method.branch_code}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account Type:</span>
                            <span className="font-medium capitalize">
                              {formatAccountType(method.account_type)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Card Brand:</span>
                            <span className="font-medium capitalize">{method.card_brand}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Card Number:</span>
                            <span className="font-medium">****  ****  ****  {method.card_last_four}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Expires:</span>
                            <span className="font-medium">
                              {method.card_expiry_month}/{method.card_expiry_year}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <AddPaymentMethodDialog
        open={openAddDialog}
        onOpenChange={setOpenAddDialog}
      />
    </div>
  );
}
