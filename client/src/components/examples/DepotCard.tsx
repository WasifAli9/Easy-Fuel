import { DepotCard } from "../DepotCard";

export default function DepotCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-8">
      <DepotCard
        id="1"
        name="Shell Industrial Depot"
        location="45 Industrial Ave, Johannesburg"
        openHours="Mon-Fri: 6AM-6PM"
        fuelPrices={[
          { type: "Diesel", pricePerLitre: 21.50 },
          { type: "Petrol 95", pricePerLitre: 23.20 },
          { type: "Petrol 93", pricePerLitre: 22.80 },
        ]}
        isActive={true}
        onEdit={() => console.log("Edit depot 1")}
      />
      <DepotCard
        id="2"
        name="BP Main Road Depot"
        location="12 Main Rd, Cape Town"
        openHours="24/7"
        fuelPrices={[
          { type: "Diesel", pricePerLitre: 21.80 },
          { type: "Paraffin", pricePerLitre: 18.50 },
        ]}
        isActive={true}
        onEdit={() => console.log("Edit depot 2")}
      />
      <DepotCard
        id="3"
        name="Total Farm Depot"
        location="78 Farm Rd, Pretoria"
        openHours="Mon-Sat: 7AM-5PM"
        fuelPrices={[
          { type: "Diesel", pricePerLitre: 21.30 },
          { type: "Petrol 93", pricePerLitre: 22.50 },
        ]}
        isActive={false}
        onEdit={() => console.log("Edit depot 3")}
      />
    </div>
  );
}
