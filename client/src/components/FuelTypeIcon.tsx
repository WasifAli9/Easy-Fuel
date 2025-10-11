import { Droplet, Flame, Zap } from "lucide-react";

interface FuelTypeIconProps {
  fuelType: string;
  className?: string;
}

export function FuelTypeIcon({ fuelType, className = "h-5 w-5" }: FuelTypeIconProps) {
  const normalizedType = fuelType.toLowerCase();
  
  if (normalizedType.includes("diesel")) {
    return <Droplet className={className} />;
  }
  
  if (normalizedType.includes("petrol") || normalizedType.includes("95") || normalizedType.includes("93")) {
    return <Zap className={className} />;
  }
  
  if (normalizedType.includes("paraffin")) {
    return <Flame className={className} />;
  }
  
  return <Droplet className={className} />;
}
