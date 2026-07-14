import { useEffect, useRef, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Parse `HH:mm` (24h) into 12h parts. */
function parseTime24(value: string | undefined): {
  hour12: number;
  minute: number;
  period: "am" | "pm";
} {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!m) return { hour12: 6, minute: 0, period: "pm" };
  let hour24 = Number(m[1]);
  let minute = Number(m[2]);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) {
    return { hour12: 6, minute: 0, period: "pm" };
  }
  hour24 = ((hour24 % 24) + 24) % 24;
  // Snap to nearest 5 minutes for the picker UI
  minute = Math.min(55, Math.round(minute / 5) * 5);
  const period: "am" | "pm" = hour24 >= 12 ? "pm" : "am";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, period };
}

function toTime24(hour12: number, minute: number, period: "am" | "pm"): string {
  let hour24 = hour12 % 12;
  if (period === "pm") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDisplay(value: string | undefined): string {
  if (!value?.trim()) return "Select time";
  const { hour12, minute, period } = parseTime24(value);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period.toUpperCase()}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

type FormTimePickerProps = {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "data-testid"?: string;
  className?: string;
};

/**
 * Compact 12h time picker (hour / minute / AM·PM).
 * Closes automatically after AM/PM is chosen.
 */
export function FormTimePicker({
  value,
  onChange,
  placeholder = "Select time",
  "data-testid": dataTestId,
  className,
}: FormTimePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseTime24(value), [value]);
  const [draft, setDraft] = useState(parsed);

  const openPicker = (next: boolean) => {
    if (next) setDraft(parseTime24(value));
    setOpen(next);
  };

  const commitAndClose = (next: typeof draft) => {
    onChange(toTime24(next.hour12, next.minute, next.period));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openPicker}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-testid={dataTestId}
          className={cn(
            "w-full justify-between pl-3 text-left font-normal h-9",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span>{value ? formatDisplay(value) : placeholder}</span>
          <Clock className="h-4 w-4 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto border-border/80 p-3 shadow-md"
        align="start"
        sideOffset={6}
      >
        <div className="mb-2 grid grid-cols-3 gap-2 px-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Hour</span>
          <span>Min</span>
          <span>Period</span>
        </div>
        <div className="flex items-stretch gap-2">
          <ScrollColumn
            ariaLabel="Hour"
            items={HOURS.map((h) => ({
              key: String(h),
              label: String(h),
              active: draft.hour12 === h,
            }))}
            onSelect={(key) => setDraft((d) => ({ ...d, hour12: Number(key) }))}
          />
          <ScrollColumn
            ariaLabel="Minute"
            items={MINUTES.map((m) => ({
              key: String(m),
              label: String(m).padStart(2, "0"),
              active: draft.minute === m,
            }))}
            onSelect={(key) => setDraft((d) => ({ ...d, minute: Number(key) }))}
          />
          <div
            role="listbox"
            aria-label="AM/PM"
            className="flex w-[4.25rem] flex-col justify-center gap-1.5"
          >
            {(["am", "pm"] as const).map((period) => (
              <button
                key={period}
                type="button"
                role="option"
                aria-selected={draft.period === period}
                className={cn(
                  "rounded-lg px-2 py-2.5 text-sm font-medium uppercase transition-colors",
                  draft.period === period
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => commitAndClose({ ...draft, period })}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ScrollColumn({
  ariaLabel,
  items,
  onSelect,
}: {
  ariaLabel: string;
  items: { key: string; label: string; active: boolean }[];
  onSelect: (key: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  }, []);

  return (
    <div className="relative">
      <div
        role="listbox"
        aria-label={ariaLabel}
        className={cn(
          "h-[9.5rem] w-14 overflow-y-auto overscroll-contain rounded-lg bg-muted/40 py-1",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={item.active}
            ref={item.active ? activeRef : undefined}
            className={cn(
              "mx-1 flex w-[calc(100%-0.5rem)] items-center justify-center rounded-md py-1.5 text-sm tabular-nums transition-colors",
              item.active
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "text-foreground/80 hover:bg-background/80",
            )}
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-5 rounded-t-lg bg-gradient-to-b from-background to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-5 rounded-b-lg bg-gradient-to-t from-background to-transparent"
        aria-hidden
      />
    </div>
  );
}
