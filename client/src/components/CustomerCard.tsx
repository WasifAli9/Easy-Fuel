import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Phone, Calendar, User } from "lucide-react";

interface CustomerCardProps {
  id: string;
  name: string;
  companyName?: string;
  vatNumber?: string;
  phone?: string;
  registeredDate: string;
  onView: () => void;
}

export function CustomerCard({
  name,
  companyName,
  vatNumber,
  phone,
  registeredDate,
  onView,
}: CustomerCardProps) {
  return (
    <Card className="hover-elevate" data-testid="card-customer">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg mb-1">{name}</CardTitle>
            {companyName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{companyName}</span>
              </div>
            )}
          </div>
          <Badge variant="secondary" className="flex-shrink-0">Customer</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          {vatNumber && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium min-w-20">VAT:</span>
              <span>{vatNumber}</span>
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
