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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar } from "lucide-react";

const acceptOfferSchema = z.object({
  confirmedDeliveryTime: z.string().min(1, "Please select a delivery date and time"),
});

type AcceptOfferValues = z.infer<typeof acceptOfferSchema>;

interface AcceptOfferDialogProps {
  offerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AcceptOfferDialog({
  offerId,
  open,
  onOpenChange,
}: AcceptOfferDialogProps) {
  const { toast } = useToast();

  // Set default time to 2 hours from now
  const defaultTime = new Date(Date.now() + 2 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  const form = useForm<AcceptOfferValues>({
    resolver: zodResolver(acceptOfferSchema),
    defaultValues: {
      confirmedDeliveryTime: defaultTime,
    },
  });

  const acceptOfferMutation = useMutation({
    mutationFn: async (values: AcceptOfferValues) => {
      const response = await apiRequest("POST", `/api/driver/offers/${offerId}/accept`, {
        confirmedDeliveryTime: values.confirmedDeliveryTime,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
      toast({
        title: "Offer accepted!",
        description: "You have accepted this delivery. The customer has been notified.",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept offer",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: AcceptOfferValues) => {
    acceptOfferMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-accept-offer">
        <DialogHeader>
          <DialogTitle>Accept Delivery Offer</DialogTitle>
          <DialogDescription>
            Please confirm the delivery date and time. The customer will be notified via email.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="confirmedDeliveryTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmed Delivery Date & Time</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="datetime-local"
                        {...field}
                        className="pl-10"
                        data-testid="input-confirmed-delivery-time"
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                By accepting this offer, you commit to delivering the fuel at the confirmed time. 
                The customer will receive an email with your contact information and the delivery details.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={acceptOfferMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={acceptOfferMutation.isPending}
                data-testid="button-confirm-accept"
              >
                {acceptOfferMutation.isPending ? "Accepting..." : "Confirm & Accept"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
