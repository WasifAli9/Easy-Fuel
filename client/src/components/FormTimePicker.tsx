import { useEffect, useRef } from "react";
import { useMemo, useState } from "react";
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
  const minute = Number(m[2]);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) {
    return { hour12: 6, minute: 0, period: "pm" };
  }
  hour24 = ((hour24 % 24) + 24) % 24;
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
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

type FormTimePickerProps = {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "data-testid"?: string;
  className?: string;
};

/**
 * 12h time picker (hour / minute / am|pm). Closes automatically after AM/PM is chosen
 * (or when hour+minute already set and period is clicked).
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
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          <TimeColumn
            ariaLabel="Hour"
            items={HOURS.map((h) => ({
              key: String(h),
              label: String(h).padStart(2, "0"),
              active: draft.hour12 === h,
            }))}
            onSelect={(key) => {
              const hour12 = Number(key);
              setDraft((d) => ({ ...d, hour12 }));
            }}
          />
          <TimeColumn
            ariaLabel="Minute"
            items={MINUTES.map((m) => ({
              key: String(m),
              label: String(m).padStart(2, "0"),
              active: draft.minute === m,
            }))}
            onSelect={(key) => {
              const minute = Number(key);
              setDraft((d) => ({ ...d, minute }));
            }}
          />
          <TimeColumn
            ariaLabel="AM/PM"
            items={[
              { key: "am", label: "am", active: draft.period === "am" },
              { key: "pm", label: "pm", active: draft.period === "pm" },
            ]}
            onSelect={(key) => {
              const period = key as "am" | "pm";
              commitAndClose({ ...draft, period });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
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
    activeRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className="h-40 w-14 overflow-y-auto rounded-md border border-border/60 bg-background"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected={item.active}
          ref={item.active ? activeRef : undefined}
          className={cn(
            "flex w-full items-center justify-center px-1 py-1.5 text-sm tabular-nums",
            item.active
              ? "bg-primary text-primary-foreground font-semibold"
              : "hover:bg-muted text-foreground",
          )}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
