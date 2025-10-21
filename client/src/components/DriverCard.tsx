import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Truck, Phone, Calendar, User, CheckCircle2, XCircle, Clock, Mail } from "lucide-react";

interface DriverCardProps {
  id: string;
  name: string;
  email?: string;
  vehicleRegistration?: string;
  kycStatus: string;
  phone?: string;
  registeredDate: string;
  profilePhotoUrl?: string;
  onView: () => void;
}

export function DriverCard({
  name,
  email,
  vehicleRegistration,
  kycStatus,
  phone,
  registeredDate,
  profilePhotoUrl,
  onView,
}: DriverCardProps) {
  const statusConfig = {
    approved: { label: "Approved", variant: "default" as const, icon: CheckCircle2 },
    pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
    rejected: { label: "Rejected", variant: "destructive" as const, icon: XCircle },
  };

  const status = statusConfig[kycStatus as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <Card className="hover-elevate" data-testid="card-driver">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={profilePhotoUrl || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg mb-1">{name}</CardTitle>
              {vehicleRegistration && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Truck className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{vehicleRegistration}</span>
                </div>
              )}
            </div>
          </div>
          <Badge variant={status.variant} className="flex-shrink-0 gap-1">
            <StatusIcon className="h-3 w-3" />
            {status.label}
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
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{registeredDate}</span>
          </div>
        </div>
        <div className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={onView}
            data-testid="button-view-driver"
          >
            <User className="h-4 w-4 mr-2" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
