import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Phone, Calendar, User, Mail } from "lucide-react";

interface CustomerCardProps {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  vatNumber?: string;
  phone?: string;
  registeredDate: string;
  profilePhotoUrl?: string;
  onView: () => void;
}

export function CustomerCard({
  name,
  companyName,
  email,
  vatNumber,
  phone,
  registeredDate,
  profilePhotoUrl,
  onView,
}: CustomerCardProps) {
  return (
    <Card className="hover-elevate" data-testid="card-customer">
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
              <CardTitle className="text-lg mb-1">{companyName || name}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{name}</span>
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="flex-shrink-0">Customer</Badge>
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
          {vatNumber && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">VAT: {vatNumber}</span>
            </div>
          )}
        </div>
        <div className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={onView}
            data-testid="button-view-customer"
          >
            <User className="h-4 w-4 mr-2" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
