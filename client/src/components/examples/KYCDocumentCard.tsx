import { KYCDocumentCard } from "../KYCDocumentCard";

export default function KYCDocumentCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-8 max-w-4xl">
      <KYCDocumentCard
        id="1"
        applicantName="John Doe"
        applicantType="driver"
        documentType="Driver's License"
        submittedDate="2025-01-10 14:30"
        status="pending"
        onApprove={() => console.log("Approve KYC 1")}
        onReject={() => console.log("Reject KYC 1")}
        onView={() => console.log("View KYC 1")}
      />
      <KYCDocumentCard
        id="2"
        applicantName="ABC Fuel Suppliers"
        applicantType="supplier"
        documentType="Company Registration"
        submittedDate="2025-01-12 09:15"
        status="approved"
        onView={() => console.log("View KYC 2")}
      />
      <KYCDocumentCard
        id="3"
        applicantName="Jane Smith"
        applicantType="driver"
        documentType="Vehicle Registration"
        submittedDate="2025-01-09 16:45"
        status="rejected"
        notes="Document expired. Please submit current vehicle registration."
        onView={() => console.log("View KYC 3")}
      />
    </div>
  );
}
