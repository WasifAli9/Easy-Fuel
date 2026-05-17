import { useEffect, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Calendar as CalendarIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function parseLocalYmd(ymd: string | undefined): Date | undefined {
  if (!ymd?.trim()) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function dateValueToYmd(date: Date | string | null | undefined): string {
  if (!date) return "";
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.slice(0, 10);
  }
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return formatLocalYmd(d);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

type NativeFormDatePickerProps = {
  id?: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  "data-testid"?: string;
};

/** Calendar picker for uncontrolled HTML forms (hidden input + FormData). */
export function NativeFormDatePicker({
  id,
  name,
  label,
  defaultValue = "",
  placeholder = "Pick a date",
  minDate,
  maxDate,
  "data-testid": dataTestId,
}: NativeFormDatePickerProps) {
  const [value, setValue] = useState(defaultValue);
  const min = minDate ? startOfDay(minDate) : undefined;
  const max = maxDate ? startOfDay(maxDate) : undefined;

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const selected = parseLocalYmd(value);

  return (
    <>
      <Label htmlFor={id ?? name}>{label}</Label>
      <input type="hidden" name={name} value={value} readOnly />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            data-testid={dataTestId}
            className={cn(
              "w-full pl-3 text-left font-normal h-9",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            {selected
              ? selected.toLocaleDateString("en-ZA", { dateStyle: "medium" })
              : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => setValue(d ? formatLocalYmd(d) : "")}
            disabled={(date) => {
              const day = startOfDay(date);
              if (min && day < min) return true;
              if (max && day > max) return true;
              return false;
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

type FormDatePickerProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  placeholder?: string;
  /** Earliest selectable day (inclusive). */
  minDate?: Date;
  /** Latest selectable day (inclusive). */
  maxDate?: Date;
  "data-testid"?: string;
};

export function FormDatePicker<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder = "Pick a date",
  minDate,
  maxDate,
  "data-testid": dataTestId,
}: FormDatePickerProps<T>) {
  const min = minDate ? startOfDay(minDate) : undefined;
  const max = maxDate ? startOfDay(maxDate) : undefined;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected = parseLocalYmd(field.value);
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid={dataTestId}
                    className={cn(
                      "w-full pl-3 text-left font-normal h-9",
                      !field.value && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                    {selected
                      ? selected.toLocaleDateString("en-ZA", { dateStyle: "medium" })
                      : placeholder}
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selected}
                  onSelect={(d) => field.onChange(d ? formatLocalYmd(d) : "")}
                  disabled={(date) => {
                    const day = startOfDay(date);
                    if (min && day < min) return true;
                    if (max && day > max) return true;
                    return false;
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
