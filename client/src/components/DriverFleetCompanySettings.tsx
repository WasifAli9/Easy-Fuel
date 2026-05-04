import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building, Loader2, AlertTriangle } from "lucide-react";

export function DriverFleetCompanySettings() {
  const { toast } = useToast();

  const { data: membership, isLoading: membershipLoading, refetch: refetchMembership } = useQuery<{
    mode: "independent" | "company";
    companyId: string | null;
    companyName: string | null;
    isDisabledByCompany: boolean;
    disabledReason: string | null;
  }>({
    queryKey: ["/api/driver/company-membership"],
  });

  const [workMode, setWorkMode] = useState<"independent" | "company">("independent");
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  useEffect(() => {
    if (!membership) return;
    if (membership.mode === "independent") {
      setWorkMode("independent");
      setSelectedCompanyId("");
    } else {
      setWorkMode("company");
      setSelectedCompanyId(membership.companyId || "");
    }
  }, [membership]);

  const { data: companiesList = [] } = useQuery<Array<{ id: string; name: string; status: string }>>({
    queryKey: ["/api/companies/public-list", companySearch],
    enabled: workMode === "company",
    queryFn: async () => {
      const qs = companySearch.trim() ? `?q=${encodeURIComponent(companySearch.trim())}` : "";
      const r = await fetch(`/api/companies/public-list${qs}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const saveMembershipMutation = useMutation({
    mutationFn: async () => {
      const companyId = workMode === "independent" ? null : selectedCompanyId || null;
      if (workMode === "company" && !companyId) {
        throw new Error("Select a fleet company");
      }
      await apiRequest("PUT", "/api/driver/company-membership", { companyId });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Fleet company settings updated." });
      refetchMembership();
      queryClient.invalidateQueries({ queryKey: ["/api/driver/company-membership"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/company-fleet/available-vehicles"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Could not save", variant: "destructive" });
    },
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Fleet company
        </CardTitle>
        <CardDescription>
          Work independently on the platform or link to one fleet company. You can change this anytime.
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
                    "Your company has disabled you for fleet operations. You will not receive dispatch offers until they re-enable you or you switch to independent."}
                </AlertDescription>
              </Alert>
            )}
            <RadioGroup
              value={workMode}
              onValueChange={(v) => setWorkMode(v as "independent" | "company")}
              className="space-y-3"
            >
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                <RadioGroupItem value="independent" id="fleet-independent" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="fleet-independent" className="font-medium cursor-pointer">
                    Work independently
                  </Label>
                  <p className="text-sm text-muted-foreground">Take platform jobs without a fleet company link.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                <RadioGroupItem value="company" id="fleet-company" className="mt-1" />
                <div className="flex-1 space-y-3">
                  <Label htmlFor="fleet-company" className="font-medium cursor-pointer">
                    Work under a fleet company
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Link your driver account to one company. They can view your deliveries and disable fleet access (without
                    closing your account).
                  </p>
                  {workMode === "company" && (
                    <div className="space-y-2 max-w-md">
                      <Label htmlFor="company-search">Search companies</Label>
                      <Input
                        id="company-search"
                        placeholder="Type to filter…"
                        value={companySearch}
                        onChange={(e) => setCompanySearch(e.target.value)}
                      />
                      <Label htmlFor="company-select">Company</Label>
                      <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
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
                      {companiesList.length === 0 && (
                        <p className="text-xs text-muted-foreground">No companies match your search.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </RadioGroup>
            <Button type="button" disabled={saveMembershipMutation.isPending} onClick={() => saveMembershipMutation.mutate()}>
              {saveMembershipMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                "Save fleet settings"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
