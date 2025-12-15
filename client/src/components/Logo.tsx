import { useState } from "react";
import { Fuel } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  variant?: "default" | "light";
}

export function Logo({ size = "md", showText = true, variant = "default" }: LogoProps) {
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

  // Try to load logo image, fallback to icon if not found
  const logoSrc = "/logo.png";
  const [logoError, setLogoError] = useState(false);

  const isLight = variant === "light";
  const bgClass = isLight ? "bg-slate-50/15 backdrop-blur-sm" : "bg-primary";
  const textClass = isLight ? "text-slate-50" : "";
  const iconClass = isLight ? "text-slate-50" : "text-primary-foreground";

  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-lg ${bgClass} p-1.5 flex items-center justify-center`}>
        {!logoError ? (
          <img
            src={logoSrc}
            alt="Easy Fuel Logo"
            className={sizeClasses[size]}
            onError={() => setLogoError(true)}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <Fuel className={`${sizeClasses[size]} ${iconClass}`} />
        )}
      </div>
      {showText && (
        <span className={`${textSizeClasses[size]} font-bold tracking-tight ${textClass}`}>
          Easy Fuel
        </span>
      )}
    </div>
  );
}
