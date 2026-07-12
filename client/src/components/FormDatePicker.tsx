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
import { FormTimePicker } from "@/components/FormTimePicker";

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

/** `YYYY-MM-DDTHH:mm` for datetime-local compatibility */
export function formatLocalDateTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatLocalYmd(d)}T${h}:${min}`;
}

export function parseLocalDateTime(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
    );
  }
  return parseLocalYmd(value.slice(0, 10));
}

type DateTimePickerFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDateTime?: Date;
  placeholder?: string;
  "data-testid"?: string;
};

/** Calendar + time input; value is `YYYY-MM-DDTHH:mm`. */
export function DateTimePickerField({
  id,
  label,
  value,
  onChange,
  minDateTime,
  placeholder = "Pick date and time",
  "data-testid": dataTestId,
}: DateTimePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const datePart = value.length >= 10 ? value.slice(0, 10) : "";
  const timePart = value.length >= 16 ? value.slice(11, 16) : "";
  const selected = parseLocalYmd(datePart);
  const selectedDateTime = parseLocalDateTime(value);
  const min = minDateTime ? startOfDay(minDateTime) : startOfDay(new Date());

  const setDate = (d: Date | undefined) => {
    if (!d) {
      onChange("");
      setOpen(false);
      return;
    }
    const ymd = formatLocalYmd(d);
    const time = timePart || "09:00";
    onChange(`${ymd}T${time}`);
    setOpen(false);
  };

  const setTime = (time: string) => {
    const ymd = datePart || formatLocalYmd(new Date());
    onChange(time ? `${ymd}T${time}` : datePart ? `${datePart}T00:00` : "");
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              data-testid={dataTestId}
              className={cn(
                "w-full pl-3 text-left font-normal h-9",
                !selectedDateTime && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
              {selectedDateTime
                ? selectedDateTime.toLocaleString("en-ZA", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : placeholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setDate}
              disabled={(date) => startOfDay(date) < min}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <FormTimePicker
          value={timePart}
          onChange={setTime}
          className="h-9 w-full sm:w-[160px]"
        />
      </div>
    </div>
  );
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
  const [open, setOpen] = useState(false);
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
      <Popover open={open} onOpenChange={setOpen}>
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
            onSelect={(d) => {
              setValue(d ? formatLocalYmd(d) : "");
              setOpen(false);
            }}
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
          <FormDatePickerItem
            label={label}
            description={description}
            placeholder={placeholder}
            dataTestId={dataTestId}
            selected={selected}
            value={field.value}
            onChange={field.onChange}
            min={min}
            max={max}
          />
        );
      }}
    />
  );
}

function FormDatePickerItem({
  label,
  description,
  placeholder,
  dataTestId,
  selected,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  description?: string;
  placeholder: string;
  dataTestId?: string;
  selected: Date | undefined;
  value: string | undefined;
  onChange: (value: string) => void;
  min?: Date;
  max?: Date;
}) {
  const [open, setOpen] = useState(false);

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <FormControl>
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
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              onChange(d ? formatLocalYmd(d) : "");
              setOpen(false);
            }}
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
}
