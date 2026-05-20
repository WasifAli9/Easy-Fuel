import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Phone, Calendar, User, CheckCircle2, XCircle, Clock, Mail, Truck } from "lucide-react";
import { normalizeProfilePhotoUrl } from "@/lib/utils";

interface FleetCompanyCardProps {
  id: string;
  companyName: string;
  ownerName: string;
  email?: string;
  phone?: string;
  status: string;
  vehicleCount: number;
  pendingVehicleCount: number;
  registeredDate: string;
  profilePhotoUrl?: string;
  onView: () => void;
}

export function FleetCompanyCard({
  companyName,
  ownerName,
  email,
  phone,
  status,
  vehicleCount,
  pendingVehicleCount,
  registeredDate,
  profilePhotoUrl,
  onView,
}: FleetCompanyCardProps) {
  const statusConfig = {
    active: { label: "Active", variant: "default" as const, icon: CheckCircle2 },
    pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
    rejected: { label: "Inactive", variant: "destructive" as const, icon: XCircle },
  };

  const statusKey = (status || "active").toLowerCase();
  const statusUi =
    statusConfig[statusKey as keyof typeof statusConfig] || statusConfig.active;
  const StatusIcon = statusUi.icon;

  return (
    <Card
      className="hover-elevate cursor-pointer"
      data-testid="card-fleet-company"
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView();
        }
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={normalizeProfilePhotoUrl(profilePhotoUrl) || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {companyName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg mb-1">{companyName}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{ownerName}</span>
              </div>
            </div>
          </div>
          <Badge variant={statusUi.variant} className="flex-shrink-0 gap-1">
            <StatusIcon className="h-3 w-3" />
            {statusUi.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          {email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{email}</span>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Truck className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {vehicleCount} fleet {vehicleCount === 1 ? "vehicle" : "vehicles"}
              {pendingVehicleCount > 0 ? ` · ${pendingVehicleCount} pending review` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Fleet company account</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Registered {registeredDate}</span>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}
