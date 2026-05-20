import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building, Loader2, AlertTriangle } from "lucide-react";

type Membership = {
  workIndependent: boolean;
  membershipStatus: "none" | "pending" | "approved" | "rejected";
  companyId: string | null;
  companyName: string | null;
  isDisabledByCompany: boolean;
  disabledReason: string | null;
  rejectionReason: string | null;
  canUseCompanyFleet: boolean;
  mode?: "independent" | "company";
};

export function DriverFleetCompanySettings() {
  const { toast } = useToast();

  const { data: membership, isLoading: membershipLoading, refetch: refetchMembership } = useQuery<Membership>({
    queryKey: ["/api/driver/company-membership"],
  });

  const [workIndependent, setWorkIndependent] = useState(true);
  const [joinFleet, setJoinFleet] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  useEffect(() => {
    if (!membership) return;
    setWorkIndependent(membership.workIndependent ?? true);
    setJoinFleet(
      membership.membershipStatus === "pending" ||
        membership.membershipStatus === "approved" ||
        !!membership.companyId,
    );
    setSelectedCompanyId(membership.companyId || "");
  }, [membership]);

  const { data: companiesList = [] } = useQuery<Array<{ id: string; name: string; status: string }>>({
    queryKey: ["/api/companies/public-list"],
    enabled: joinFleet,
    queryFn: async () => {
      const r = await fetch(`/api/companies/public-list`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const invalidateFleet = () => {
    refetchMembership();
    queryClient.invalidateQueries({ queryKey: ["/api/driver/company-membership"] });
    queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/driver/company-fleet/available-vehicles"] });
  };

  const preferencesMutation = useMutation({
    mutationFn: async (value: boolean) => {
      await apiRequest("PUT", "/api/driver/company-membership/preferences", { workIndependent: value });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Work preferences updated." });
      invalidateFleet();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Could not save", variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a fleet company");
      await apiRequest("POST", "/api/driver/company-membership/apply", { companyId: selectedCompanyId });
    },
    onSuccess: () => {
      toast({
        title: "Application sent",
        description: "The company will review your request. You can still work independently while waiting.",
      });
      invalidateFleet();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Could not apply", variant: "destructive" });
    },
  });

  const cancelApplyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/driver/company-membership/apply", {});
    },
    onSuccess: () => {
      toast({ title: "Cancelled", description: "Application withdrawn." });
      invalidateFleet();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Could not cancel", variant: "destructive" });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/driver/company-membership/leave", {});
    },
    onSuccess: () => {
      toast({ title: "Left company", description: "Company vehicles have been released." });
      setJoinFleet(false);
      invalidateFleet();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Could not leave", variant: "destructive" });
    },
  });

  const statusBadge = () => {
    const s = membership?.membershipStatus ?? "none";
    if (s === "pending") return <Badge variant="secondary">Pending approval</Badge>;
    if (s === "approved") return <Badge className="bg-primary/20 text-primary">Approved</Badge>;
    if (s === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    return null;
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Fleet company
        </CardTitle>
        <CardDescription>
          You can work independently and join a fleet company. Apply to a company — they must approve before you can use
          their vehicles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {membershipLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {membership?.isDisabledByCompany && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Disabled by your fleet company</AlertTitle>
                <AlertDescription>
                  {membership.disabledReason ||
                    "Your company has disabled fleet access. Use your personal vehicle for independent jobs if enabled."}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-start gap-3 rounded-md border p-4">
              <Checkbox
                id="work-independent"
                checked={workIndependent}
                onCheckedChange={(c) => {
                  const v = c === true;
                  setWorkIndependent(v);
                  preferencesMutation.mutate(v);
                }}
                disabled={preferencesMutation.isPending}
              />
              <div className="flex-1">
                <Label htmlFor="work-independent" className="font-medium cursor-pointer">
                  Work independently
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive customer offers when your active vehicle is your own (personal) vehicle.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border p-4 space-y-3">
              <Checkbox
                id="join-fleet"
                checked={joinFleet}
                onCheckedChange={(c) => setJoinFleet(c === true)}
                disabled={membership?.membershipStatus === "approved"}
              />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="join-fleet" className="font-medium cursor-pointer">
                    Join a fleet company
                  </Label>
                  {statusBadge()}
                </div>
                <p className="text-sm text-muted-foreground">
                  After approval, you can claim company vehicles. Jobs done in a company vehicle count as company orders.
                </p>

                {membership?.membershipStatus === "approved" && membership.companyName && (
                  <p className="text-sm">
                    Linked to: <span className="font-medium">{membership.companyName}</span>
                  </p>
                )}

                {membership?.membershipStatus === "rejected" && membership.rejectionReason && (
                  <p className="text-sm text-destructive">Reason: {membership.rejectionReason}</p>
                )}

                {joinFleet && membership?.membershipStatus !== "approved" && (
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="company-select">Company</Label>
                    <Select
                      value={selectedCompanyId}
                      onValueChange={setSelectedCompanyId}
                      disabled={membership?.membershipStatus === "pending"}
                    >
                      <SelectTrigger id="company-select">
                        <SelectValue placeholder="Select a company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companiesList.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {membership?.membershipStatus === "none" || membership?.membershipStatus === "rejected" ? (
                    joinFleet && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={applyMutation.isPending || !selectedCompanyId}
                        onClick={() => applyMutation.mutate()}
                      >
                        {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply to company"}
                      </Button>
                    )
                  ) : null}
                  {membership?.membershipStatus === "pending" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={cancelApplyMutation.isPending}
                      onClick={() => cancelApplyMutation.mutate()}
                    >
                      Cancel application
                    </Button>
                  )}
                  {membership?.membershipStatus === "approved" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={leaveMutation.isPending}
                      onClick={() => leaveMutation.mutate()}
                    >
                      Leave company
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
