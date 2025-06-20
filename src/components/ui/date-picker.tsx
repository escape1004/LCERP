"use client"

import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { ko } from "date-fns/locale";

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Input } from "./input"

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function DatePicker({ value, onChange, className, placeholder }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  
  const date = React.useMemo(() => {
    if (!value) return undefined;
    const parsedDate = new Date(value);
    return isValid(parsedDate) ? parsedDate : undefined;
  }, [value]);

  // 캘린더가 열려있을 때 전역 붙여넣기 이벤트 처리
  React.useEffect(() => {
    if (!open) return;

    const handleGlobalPaste = async (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData("text");
      if (!pastedText) return;

      // handleInputChange 함수를 사용하여 동일한 로직 적용
      const originalValue = value;
      handleInputChange(pastedText);
      
      // 값이 변경되었으면 캘린더 닫기
      if (value !== originalValue) {
        setOpen(false);
      }
    };

    document.addEventListener("paste", handleGlobalPaste);
    return () => {
      document.removeEventListener("paste", handleGlobalPaste);
    };
  }, [open, onChange, value]);

  const handleDaySelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange(format(selectedDate, "yyyy-MM-dd"));
    } else {
      onChange("");
    }
    setOpen(false);
  }

  const handleInputChange = (inputValue: string) => {
    // 빈 값이면 그대로 설정
    if (!inputValue.trim()) {
      onChange("");
      return;
    }

    // YY-MM-DD 형식을 먼저 수동으로 처리
    const yyMmDdMatch = inputValue.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
    if (yyMmDdMatch) {
      const [, yearStr, monthStr, dayStr] = yyMmDdMatch;
      const year = parseInt(`20${yearStr}`, 10);
      const month = parseInt(monthStr, 10) - 1;
      const day = parseInt(dayStr, 10);
      const d = new Date(year, month, day);
      if (isValid(d)) {
        onChange(format(d, "yyyy-MM-dd"));
        return;
      }
    }

    // YY.MM.DD 형식 처리
    const yyMmDdDotMatch = inputValue.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/);
    if (yyMmDdDotMatch) {
      const [, yearStr, monthStr, dayStr] = yyMmDdDotMatch;
      const year = parseInt(`20${yearStr}`, 10);
      const month = parseInt(monthStr, 10) - 1;
      const day = parseInt(dayStr, 10);
      const d = new Date(year, month, day);
      if (isValid(d)) {
        onChange(format(d, "yyyy-MM-dd"));
        return;
      }
    }

    // YY/MM/DD 형식 처리
    const yyMmDdSlashMatch = inputValue.match(/^(\d{2})\/(\d{1,2})\/(\d{1,2})$/);
    if (yyMmDdSlashMatch) {
      const [, yearStr, monthStr, dayStr] = yyMmDdSlashMatch;
      const year = parseInt(`20${yearStr}`, 10);
      const month = parseInt(monthStr, 10) - 1;
      const day = parseInt(dayStr, 10);
      const d = new Date(year, month, day);
      if (isValid(d)) {
        onChange(format(d, "yyyy-MM-dd"));
        return;
      }
    }

    // 여러 형식의 날짜를 파싱 시도 (YYYY 형식들)
    const formats = ["yyyy-MM-dd", "yyyy.MM.dd", "yyyy/MM/dd", "MM/dd/yyyy", "MM-dd-yyyy"];
    let parsedDate: Date | null = null;
    
    for (const fmt of formats) {
        const d = parse(inputValue, fmt, new Date());
        if(isValid(d)) {
            parsedDate = d;
            break;
        }
    }
    
    // YYYYMMDD 또는 YYMMDD 형식 처리
    if (!parsedDate && /^\d{6,8}$/.test(inputValue)) {
      const year = inputValue.length === 8 ? parseInt(inputValue.substring(0, 4), 10) : parseInt(`20${inputValue.substring(0, 2)}`, 10);
      const month = parseInt(inputValue.substring(inputValue.length - 4, inputValue.length - 2), 10) - 1;
      const day = parseInt(inputValue.substring(inputValue.length - 2), 10);
      const d = new Date(year, month, day);
      if (isValid(d)) {
        parsedDate = d;
      }
    }

    // 유효한 날짜가 파싱되면 yyyy-MM-dd 형식으로 변환
    if (parsedDate) {
      onChange(format(parsedDate, "yyyy-MM-dd"));
    } else {
      // 파싱되지 않으면 원본 값 그대로 설정 (사용자가 입력 중일 수 있음)
      onChange(inputValue);
    }
  };

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