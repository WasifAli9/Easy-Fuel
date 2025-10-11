import { PriceBreakdown } from "../PriceBreakdown";

export default function PriceBreakdownExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-8 max-w-2xl">
      <PriceBreakdown
        fuelPrice={10750.00}
        deliveryFee={350.00}
        serviceFee={220.50}
        total={11320.50}
        litres={500}
      />
      <PriceBreakdown
        fuelPrice={4640.00}
        deliveryFee={280.00}
        serviceFee={98.40}
        total={5018.40}
        litres={200}
      />
    </div>
  );
}
