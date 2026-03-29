import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
}

export function StatsCard({ title, value, description, icon: Icon, trend, onClick }: StatsCardProps) {
  const testSlug = title.toLowerCase().replace(/\s+/g, "-");
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/60 bg-card/80 backdrop-blur-sm shadow-md transition-all duration-300",
        "hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5",
        onClick && "cursor-pointer active:scale-[0.99]"
      )}
      data-testid={`card-stats-${testSlug}`}
      onClick={onClick}
    >
      <CardContent className="p-0">
        <div className="flex items-start gap-4 p-5">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
              "bg-primary/15 text-primary ring-1 ring-primary/20 shadow-inner"
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            <div
              className="text-2xl font-bold tracking-tight text-foreground"
              data-testid={`text-value-${testSlug}`}
            >
              {value}
            </div>
            {description && <p className="text-xs text-muted-foreground leading-snug">{description}</p>}
            {trend && (
              <p
                className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}
              >
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}% from last month
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
