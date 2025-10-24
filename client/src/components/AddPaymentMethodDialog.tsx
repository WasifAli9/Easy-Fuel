import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CreditCard, Building2 } from "lucide-react";

const paymentMethodSchema = z.object({
  methodType: z.enum(["bank_account", "credit_card", "debit_card"]),
  label: z.string().min(1, "Label is required"),
  
  // Bank account fields
  bankName: z.string().optional(),
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
  branchCode: z.string().optional(),
  accountType: z.enum(["cheque", "savings", "transmission"]).optional(),
  
  // Card fields
  cardLastFour: z.string().optional(),
  cardBrand: z.string().optional(),
  cardExpiryMonth: z.string().optional(),
  cardExpiryYear: z.string().optional(),
  
  isDefault: z.boolean().default(false),
}).refine(
  (data) => {
    if (data.methodType === "bank_account") {
      return !!(data.bankName && data.accountHolderName && data.accountNumber && data.branchCode && data.accountType);
    }
    if (data.methodType === "credit_card" || data.methodType === "debit_card") {
      return !!(data.cardLastFour && data.cardBrand && data.cardExpiryMonth && data.cardExpiryYear);
    }
    return true;
  },
  {
    message: "Please fill in all required fields for the selected payment method type",
    path: ["methodType"],
  }
);

type PaymentMethodFormData = z.infer<typeof paymentMethodSchema>;

interface AddPaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (paymentMethod: any) => void;
}

export function AddPaymentMethodDialog({ open, onOpenChange, onSuccess }: AddPaymentMethodDialogProps) {
  const { toast } = useToast();
  const [methodType, setMethodType] = useState<"bank_account" | "credit_card" | "debit_card">("bank_account");

  const form = useForm<PaymentMethodFormData>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: {
      methodType: "bank_account",
      label: "",
      bankName: "",
      accountHolderName: "",
      accountNumber: "",
      branchCode: "",
      accountType: "cheque",
      cardLastFour: "",
      cardBrand: "",
      cardExpiryMonth: "",
      cardExpiryYear: "",
      isDefault: false,
    },
  });

  const createPaymentMethodMutation = useMutation({
    mutationFn: async (values: PaymentMethodFormData) => {
      const response = await apiRequest("POST", "/api/payment-methods", values);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({
        title: "Payment method added",
        description: "Your payment method has been saved successfully",
      });
      form.reset();
      onOpenChange(false);
      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add payment method",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: PaymentMethodFormData) => {
    createPaymentMethodMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>
            Add a new payment method for your orders
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Business Account, Personal Card"
                      {...field}
                      data-testid="input-payment-label"
                    />
                  </FormControl>
                  <FormDescription>
                    Give this payment method a name you'll recognize
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Tabs 
              defaultValue="bank_account" 
              onValueChange={(value) => {
                setMethodType(value as "bank_account" | "credit_card" | "debit_card");
                form.setValue("methodType", value as "bank_account" | "credit_card" | "debit_card");
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="bank_account" data-testid="tab-bank-account">
                  <Building2 className="h-4 w-4 mr-2" />
                  Bank Account
                </TabsTrigger>
                <TabsTrigger value="credit_card" data-testid="tab-card">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Card
                </TabsTrigger>
              </TabsList>

              <TabsContent value="bank_account" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="methodType"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <input type="hidden" {...field} value="bank_account" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Standard Bank, FNB, ABSA"
                          {...field}
                          data-testid="input-bank-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountHolderName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Holder Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Full name on account"
                          {...field}
                          data-testid="input-account-holder"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="accountNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="1234567890"
                            {...field}
                            data-testid="input-account-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="branchCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123456"
                            {...field}
                            data-testid="input-branch-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="accountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-account-type">
                            <SelectValue placeholder="Select account type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cheque">Cheque Account</SelectItem>
                          <SelectItem value="savings">Savings Account</SelectItem>
                          <SelectItem value="transmission">Transmission Account</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="credit_card" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="methodType"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value === "bank_account" ? "credit_card" : field.value}
                        >
                          <SelectTrigger data-testid="select-card-type">
                            <SelectValue placeholder="Select card type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="credit_card">Credit Card</SelectItem>
                            <SelectItem value="debit_card">Debit Card</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormLabel>Card Type</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cardBrand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Card Brand</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-card-brand">
                            <SelectValue placeholder="Select card brand" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="visa">Visa</SelectItem>
                          <SelectItem value="mastercard">Mastercard</SelectItem>
                          <SelectItem value="amex">American Express</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cardLastFour"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last 4 Digits</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="1234"
                          maxLength={4}
                          {...field}
                          data-testid="input-card-last-four"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the last 4 digits of your card number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cardExpiryMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiry Month</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-expiry-month">
                              <SelectValue placeholder="MM" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                              <SelectItem key={month} value={month.toString().padStart(2, "0")}>
                                {month.toString().padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cardExpiryYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiry Year</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-expiry-year">
                              <SelectValue placeholder="YYYY" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map((year) => (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-default-payment"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Set as default payment method
                    </FormLabel>
                    <FormDescription>
                      This payment method will be selected by default for new orders
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createPaymentMethodMutation.isPending}
                data-testid="button-save-payment"
              >
                {createPaymentMethodMutation.isPending ? "Saving..." : "Save Payment Method"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
