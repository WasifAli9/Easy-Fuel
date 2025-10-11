import { FuelTypeIcon } from "../FuelTypeIcon";

export default function FuelTypeIconExample() {
  return (
    <div className="space-y-6 p-8">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Fuel Types</h3>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <FuelTypeIcon fuelType="diesel" />
            <span className="text-sm">Diesel</span>
          </div>
          <div className="flex items-center gap-2">
            <FuelTypeIcon fuelType="petrol_95" />
            <span className="text-sm">Petrol 95</span>
          </div>
          <div className="flex items-center gap-2">
            <FuelTypeIcon fuelType="petrol_93" />
            <span className="text-sm">Petrol 93</span>
          </div>
          <div className="flex items-center gap-2">
            <FuelTypeIcon fuelType="paraffin" />
            <span className="text-sm">Paraffin</span>
          </div>
        </div>
      </div>
    </div>
  );
}
