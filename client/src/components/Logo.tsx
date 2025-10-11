import { Fuel } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-4xl",
  };

  return (
    <div className="flex items-center gap-2">
      <div className="rounded-lg bg-primary p-1.5">
        <Fuel className={`${sizeClasses[size]} text-primary-foreground`} />
      </div>
      {showText && (
        <span className={`${textSizeClasses[size]} font-bold tracking-tight`}>
          Easy Fuel
        </span>
      )}
    </div>
  );
}
