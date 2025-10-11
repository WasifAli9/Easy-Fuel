import { JobCard } from "../JobCard";

export default function JobCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-8 max-w-4xl">
      <JobCard
        id="1"
        fuelType="Diesel"
        litres={500}
        pickupLocation="Shell Depot, 45 Industrial Ave"
        dropLocation="123 Construction Site, Sandton"
        distance={15.2}
        earnings={450.00}
        expiresIn={120}
        isPremium={true}
        onAccept={() => console.log("Accept job 1")}
        onReject={() => console.log("Reject job 1")}
      />
      <JobCard
        id="2"
        fuelType="Petrol 95"
        litres={200}
        pickupLocation="BP Depot, Main Rd"
        dropLocation="89 Office Park, Rosebank"
        distance={8.5}
        earnings={280.00}
        expiresIn={90}
        onAccept={() => console.log("Accept job 2")}
        onReject={() => console.log("Reject job 2")}
      />
      <JobCard
        id="3"
        fuelType="Paraffin"
        litres={100}
        pickupLocation="Total Depot, 12 Farm Rd"
        dropLocation="456 Residential, Centurion"
        distance={22.0}
        earnings={320.00}
        onAccept={() => console.log("Accept job 3")}
        onReject={() => console.log("Reject job 3")}
      />
    </div>
  );
}
