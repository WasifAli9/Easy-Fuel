import { OrderCard } from "../OrderCard";

export default function OrderCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-8 max-w-4xl">
      <OrderCard
        id="1"
        fuelType="Diesel"
        litres={500}
        location="123 Industrial Rd, Johannesburg"
        date="2025-01-15 14:30"
        totalAmount={8250.00}
        status="delivered"
        onView={() => console.log("View order 1")}
      />
      <OrderCard
        id="2"
        fuelType="Petrol 95"
        litres={200}
        location="45 Main St, Cape Town"
        date="2025-01-15 10:00"
        totalAmount={4500.00}
        status="en_route"
        onView={() => console.log("View order 2")}
      />
      <OrderCard
        id="3"
        fuelType="Paraffin"
        litres={100}
        location="78 Farm Rd, Pretoria"
        date="2025-01-14 16:00"
        totalAmount={1200.00}
        status="awaiting_payment"
        onView={() => console.log("View order 3")}
      />
    </div>
  );
}
