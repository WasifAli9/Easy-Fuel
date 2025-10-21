import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Edit, Trash2, Star } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddAddressDialog } from "@/components/AddAddressDialog";
import { EditAddressDialog } from "@/components/EditAddressDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeliveryAddress = {
  id: string;
  label: string;
  address_street: string;
  address_city: string;
  address_province: string;
  address_postal_code: string;
  address_country: string;
  lat: number;
  lng: number;
  access_instructions: string | null;
  verification_status: string;
  is_default: boolean;
  created_at: string;
};

export default function SavedAddresses() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<DeliveryAddress | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);

  const { data: addresses = [], isLoading } = useQuery<DeliveryAddress[]>({
    queryKey: ["/api/addresses"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return apiRequest("DELETE", `/api/addresses/${addressId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses"] });
      toast({
        title: "Success",
        description: "Address deleted successfully",
      });
      setDeleteDialogOpen(false);
      setAddressToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete address",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader notificationCount={2} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Saved Addresses</h1>
            <p className="text-muted-foreground">Manage your delivery locations</p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-address">
            <Plus className="h-4 w-4 mr-2" />
            Add Address
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading addresses...</div>
        ) : addresses.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No saved addresses</h3>
              <p className="text-muted-foreground mb-4">
                Add your first delivery address to get started
              </p>
              <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-first-address">
                <Plus className="h-4 w-4 mr-2" />
                Add Address
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {addresses.map((address) => (
              <Card key={address.id} className="hover-elevate" data-testid={`card-address-${address.id}`}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">{address.label}</h3>
                  </div>
                  {address.is_default && (
                    <Badge variant="default" data-testid="badge-default">
                      <Star className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {address.address_street}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {address.address_city}, {address.address_province}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {address.address_postal_code}
                  </p>
                  {address.access_instructions && (
                    <p className="text-sm text-muted-foreground italic">
                      Note: {address.access_instructions}
                    </p>
                  )}
                  <Badge 
                    variant={address.verification_status === "verified" ? "default" : "secondary"}
                    data-testid="badge-verification-status"
                  >
                    {address.verification_status}
                  </Badge>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedAddress(address);
                      setEditDialogOpen(true);
                    }}
                    data-testid="button-edit-address"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAddressToDelete(address.id);
                      setDeleteDialogOpen(true);
                    }}
                    data-testid="button-delete-address"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Add Address Dialog */}
      <AddAddressDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />

      {/* Edit Address Dialog */}
      {selectedAddress && (
        <EditAddressDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          address={selectedAddress}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Address</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this address? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => addressToDelete && deleteMutation.mutate(addressToDelete)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
