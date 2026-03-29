import { type LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export function DashboardSidebarAside({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 min-h-0 self-stretch z-10 w-[288px] min-w-[288px]",
        "border-r border-sidebar-border/80 bg-sidebar/90 backdrop-blur-xl",
        "shadow-[inset_-1px_0_0_hsl(var(--border)/0.35),4px_0_32px_-16px_hsl(var(--foreground)/0.06)]",
        className
      )}
      aria-label={ariaLabel}
    >
      {children}
    </aside>
  );
}

export function DashboardSidebarInner({
  label,
  tagline = "Easy Fuel",
  children,
}: {
  label: string;
  tagline?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div
        className="h-1 w-full shrink-0 bg-gradient-to-r from-transparent via-primary to-transparent opacity-90"
        aria-hidden
      />
      <div className="px-4 pt-4 pb-3 border-b border-border/50 bg-gradient-to-b from-primary/[0.07] to-transparent shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{label}</p>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{tagline}</p>
      </div>
      <nav className="flex flex-col gap-1 p-2 flex-1 min-h-0 overflow-y-auto scrollbar-hide">{children}</nav>
    </div>
  );
}

export function DashboardNavSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {title ? (
        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/85">
          {title}
        </p>
      ) : null}
      {children}
    </div>
  );
}

const navItemBase =
  "group relative w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

const navInactive =
  "text-muted-foreground hover:bg-sidebar-accent/90 hover:text-sidebar-accent-foreground border border-transparent hover:border-border/40 hover:shadow-sm";

const navActive =
  "bg-primary/[0.14] text-primary border border-primary/25 shadow-sm";

export function DashboardNavButton({
  active,
  icon: Icon,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      className={cn(navItemBase, active ? navActive : navInactive, className)}
      {...props}
    >
      {active ? (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
          active
            ? "bg-primary/20 text-primary"
            : "bg-muted/50 text-muted-foreground group-hover:bg-primary/12 group-hover:text-primary"
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="truncate flex-1">{children}</span>
    </button>
  );
}

export function DashboardNavLink({
  href,
  icon: Icon,
  children,
  className,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      className={cn(navItemBase, navInactive, "no-underline", className)}
      onClick={onNavigate}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground transition-colors duration-200 group-hover:bg-primary/12 group-hover:text-primary">
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="truncate flex-1">{children}</span>
    </Link>
  );
}

export function DashboardNavRouteLink({
  href,
  active,
  icon: Icon,
  children,
  className,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      className={cn(navItemBase, active ? navActive : navInactive, "no-underline", className)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
    >
      {active ? (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
          active
            ? "bg-primary/20 text-primary"
            : "bg-muted/50 text-muted-foreground group-hover:bg-primary/12 group-hover:text-primary"
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="truncate flex-1">{children}</span>
    </Link>
  );
}

export function DashboardSidebarDivider() {
  return <Separator className="my-2 mx-2 bg-border/50" />;
}
