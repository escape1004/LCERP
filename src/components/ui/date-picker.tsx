"use client"

import * as React from "react"
import { format, isValid } from "date-fns"
import { ko } from "date-fns/locale"

import { cn } from "../../lib/utils"
import { Calendar } from "./calendar"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { DEFAULT_DATE_PARSE_FORMATS, parseFlexibleDateValue } from "../../lib/dateParse"

export { DEFAULT_DATE_PARSE_FORMATS, parseFlexibleDateValue }

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function DatePicker({ value, onChange, className, placeholder }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [customDateFormats, setCustomDateFormats] = React.useState<string[]>([]);

  const date = React.useMemo(() => {
    if (!value) return undefined;
    const parsedDate = new Date(value);
    return isValid(parsedDate) ? parsedDate : undefined;
  }, [value]);

  React.useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getConfig?.()
      .then((config) => {
        if (!cancelled) {
          setCustomDateFormats(Array.isArray(config?.dateParseFormats) ? config.dateParseFormats : []);
        }
      })
      .catch(() => null);

    const handleConfigUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ dateParseFormats?: string[] }>).detail;
      if (Array.isArray(detail?.dateParseFormats)) {
        setCustomDateFormats(detail.dateParseFormats);
      }
    };

    window.addEventListener("config:updated", handleConfigUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("config:updated", handleConfigUpdate);
    };
  }, []);

  const handleInputChange = React.useCallback((inputValue: string) => {
    const normalizedValue = parseFlexibleDateValue(inputValue, customDateFormats);

    if (normalizedValue !== null) {
      onChange(normalizedValue);
      return;
    }

    onChange(inputValue);
  }, [customDateFormats, onChange]);

  React.useEffect(() => {
    if (!open) return;

    const handleGlobalPaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData("text");
      if (!pastedText) return;

      event.preventDefault();
      handleInputChange(pastedText);
    };

    document.addEventListener("paste", handleGlobalPaste);
    return () => {
      document.removeEventListener("paste", handleGlobalPaste);
    };
  }, [handleInputChange, open]);

  const handleDaySelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange(format(selectedDate, "yyyy-MM-dd"));
    } else {
      onChange("");
    }
    setOpen(false);
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText) return;

    handleInputChange(pastedText);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onPaste={handlePaste}
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground", className)}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-discord-sidebar border-gray-600 shadow-lg" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDaySelect}
          initialFocus
          locale={ko}
          className="bg-discord-sidebar text-discord-text"
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center bg-discord-sidebar text-discord-text",
            caption_label: "text-sm font-medium text-discord-text",
            nav: "space-x-1 flex items-center",
            nav_button: cn(
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-discord-text hover:bg-discord-hover"
            ),
            nav_button_previous: "absolute left-1",
            nav_button_next: "absolute right-1",
            table: "w-full border-collapse space-y-1",
            head_row: "flex",
            head_cell: "text-discord-muted rounded-md w-8 font-normal text-[0.8rem]",
            row: "flex w-full mt-2",
            cell: cn(
              "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-discord-hover",
              "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            ),
            day: cn(
              "h-8 w-8 p-0 font-normal aria-selected:opacity-100 text-discord-text hover:bg-discord-hover hover:text-discord-text",
              "focus:bg-discord-accent focus:text-white focus:rounded-md"
            ),
            day_selected: "bg-discord-accent text-white hover:bg-blue-600 hover:text-white focus:bg-discord-accent focus:text-white rounded-md",
            day_today: "bg-discord-hover text-discord-text rounded-md",
            day_outside: "text-discord-muted opacity-50",
            day_disabled: "text-discord-muted opacity-50",
            day_range_middle: "aria-selected:bg-discord-hover aria-selected:text-discord-text",
            day_hidden: "invisible",
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
