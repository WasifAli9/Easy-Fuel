import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { FileText, Download, CheckCircle, XCircle } from "lucide-react";

interface KYCDocumentCardProps {
  id: string;
  applicantName: string;
  applicantType: "driver" | "supplier";
  documentType: string;
  submittedDate: string;
  status: "pending" | "approved" | "rejected";
  notes?: string;
  onApprove?: () => void;
  onReject?: () => void;
  onView?: () => void;
}

export function KYCDocumentCard({
  id,
  applicantName,
  applicantType,
  documentType,
  submittedDate,
  status,
  notes,
  onApprove,
  onReject,
  onView
}: KYCDocumentCardProps) {
  return (
    <Card className="hover-elevate" data-testid={`card-kyc-${id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold" data-testid={`text-applicant-${id}`}>{applicantName}</h3>
            <p className="text-sm text-muted-foreground capitalize">{applicantType}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Document Type</p>
          <p className="font-medium" data-testid={`text-doc-type-${id}`}>{documentType}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Submitted</p>
          <p className="text-sm">{submittedDate}</p>
        </div>
        {notes && (
          <div className="space-y-1 pt-2 border-t">
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="text-sm">{notes}</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2 pt-0">
        {onView && (
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onView}
            data-testid={`button-view-${id}`}
          >
            <Download className="h-4 w-4 mr-1" />
            View
          </Button>
        )}
        {status === "pending" && onReject && (
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onReject}
            data-testid={`button-reject-${id}`}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject
          </Button>
        )}
        {status === "pending" && onApprove && (
          <Button 
            className="flex-1"
            onClick={onApprove}
            data-testid={`button-approve-${id}`}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Approve
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
