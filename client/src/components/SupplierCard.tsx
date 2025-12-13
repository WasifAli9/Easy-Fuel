import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Phone, Calendar, User, CheckCircle2, XCircle, Clock, Mail } from "lucide-react";
import { normalizeProfilePhotoUrl } from "@/lib/utils";

interface SupplierCardProps {
  id: string;
  name: string;
  companyName: string;
  email?: string;
  kybStatus: string;
  cipcNumber?: string;
  phone?: string;
  registeredDate: string;
  profilePhotoUrl?: string;
  onView: () => void;
}

export function SupplierCard({
  name,
  companyName,
  email,
  kybStatus,
  cipcNumber,
  phone,
  registeredDate,
  profilePhotoUrl,
  onView,
}: SupplierCardProps) {
  const statusConfig = {
    approved: { label: "Approved", variant: "default" as const, icon: CheckCircle2 },
    pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
    rejected: { label: "Rejected", variant: "destructive" as const, icon: XCircle },
  };

  const status = statusConfig[kybStatus as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <Card className="hover-elevate" data-testid="card-supplier">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage 
                src={normalizeProfilePhotoUrl(profilePhotoUrl) || undefined}
                onError={() => {
                  // Suppress image load errors
                }}
              />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {companyName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg mb-1">{companyName}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{name}</span>
              </div>
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
          {cipcNumber && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">CIPC: {cipcNumber}</span>
            </div>
          )}
        </div>
        <div className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={onView}
            data-testid="button-view-supplier"
          >
            <Building2 className="h-4 w-4 mr-2" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
