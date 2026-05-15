import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { normalizeFilePath } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Eye, FileText, Loader2, XCircle } from "lucide-react";

type ReviewDocument = {
  id: string;
  doc_type: string;
  title: string;
  file_path: string;
  mime_type?: string | null;
  verification_status: string;
  created_at: string;
  document_rejection_reason?: string | null;
};

const DOC_LABELS: Record<string, string> = {
  za_id: "South African ID",
  passport: "Passport",
  drivers_license: "Driver's License",
  prdp: "PrDP",
  banking_proof: "Banking Proof",
  criminal_check: "Criminal Clearance",
  proof_of_address: "Proof of Address",
  dangerous_goods_training: "Dangerous Goods Training",
  cipc_certificate: "CIPC Certificate",
  vat_certificate: "VAT Certificate",
  tax_clearance: "Tax Clearance",
};

function docLabel(docType: string) {
  return DOC_LABELS[docType] || docType.replace(/_/g, " ");
}

function isAwaitingReview(status: string) {
  const s = (status || "").toLowerCase();
  return s === "pending" || s === "pending_review" || s === "draft";
}

export function ComplianceReviewDocuments({
  ownerType,
  ownerId,
}: {
  ownerType: "driver" | "supplier";
  ownerId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["/api/admin/compliance", ownerType, ownerId, "review-documents"];

  const { data: documents = [], isLoading } = useQuery<ReviewDocument[]>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/compliance/${ownerType}/${ownerId}/review-documents`,
      );
      return res.json();
    },
    enabled: !!ownerId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      documentId,
      status,
      rejectionReason,
    }: {
      documentId: string;
      status: string;
      rejectionReason?: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/documents/${documentId}/status`, {
        status,
        rejectionReason,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update document");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/compliance", ownerType, ownerId, "checklist"],
      });
      toast({ title: "Success", description: "Document status updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update document",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!documents.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No documents awaiting review for this {ownerType}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg"
        >
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="font-medium text-sm truncate">{doc.title || docLabel(doc.doc_type)}</p>
              <Badge variant="outline" className="text-xs">
                {docLabel(doc.doc_type)}
              </Badge>
              <Badge variant="secondary" className="text-xs capitalize">
                {doc.verification_status === "draft" ? "Awaiting review" : doc.verification_status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Uploaded {new Date(doc.created_at).toLocaleString()}
            </p>
            {doc.document_rejection_reason && (
              <p className="text-xs text-destructive mt-1">{doc.document_rejection_reason}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = normalizeFilePath(doc.file_path);
                if (url) window.open(url, "_blank");
                else
                  toast({
                    title: "Error",
                    description: "Invalid document path",
                    variant: "destructive",
                  });
              }}
            >
              <Eye className="h-3 w-3 mr-1" />
              View
            </Button>
            {isAwaitingReview(doc.verification_status) && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ documentId: doc.id, status: "approved" })}
                >
                  {updateStatus.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Approve
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={updateStatus.isPending}
                  onClick={() => {
                    const reason = prompt("Rejection reason:");
                    if (reason?.trim()) {
                      updateStatus.mutate({
                        documentId: doc.id,
                        status: "rejected",
                        rejectionReason: reason.trim(),
                      });
                    }
                  }}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
