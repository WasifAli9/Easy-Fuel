import { OrderTimeline } from "../OrderTimeline";

export default function OrderTimelineExample() {
  const steps = [
    { label: "Order Placed", timestamp: "2025-01-15 10:30", status: "completed" as const },
    { label: "Payment Confirmed", timestamp: "2025-01-15 10:32", status: "completed" as const },
    { label: "Driver Assigned", timestamp: "2025-01-15 10:35", status: "completed" as const },
    { label: "Fuel Picked Up", timestamp: "2025-01-15 11:00", status: "completed" as const },
    { label: "En Route to Delivery", status: "current" as const },
    { label: "Delivered", status: "pending" as const },
  ];

  return (
    <div className="max-w-md p-8">
      <h3 className="font-semibold text-lg mb-6">Order Status</h3>
      <OrderTimeline steps={steps} />
    </div>
  );
}
