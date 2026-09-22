import React, { useId, useState, useRef, useEffect } from 'react';

export interface DatePicker3Props {
  label?: string;
  initialDate?: Date;
  onSelect?: (date: Date) => void;
  className?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const formatSelectedDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
};

export const DatePicker3: React.FC<DatePicker3Props> = ({
  label = 'Date with icon',
  initialDate,
  onSelect,
  className = '',
}) => {
  const id = useId();
  const [open, setOpen] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [viewDate, setViewDate] = useState<Date>(initialDate || new Date());
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside click to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (open && e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const chosen = new Date(year, month, day);
    setSelectedDate(chosen);
    if (onSelect) onSelect(chosen);
    setOpen(false);
  };

  // Calendar calculations
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const trailingDays = (7 - ((firstDayOfWeek + daysInMonth) % 7)) % 7;

  return (
    <div ref={wrapRef} className={`relative w-full max-w-xs space-y-2 select-none ${className}`}>
      {label && (
        <label htmlFor={id} className="block px-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {label}
        </label>
      )}

      {/* Trigger Button per Watermelon UI */}
      <button
        id={id}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-neutral-200/80 dark:border-neutral-700/60 bg-white dark:bg-neutral-900 px-3.5 text-sm font-normal shadow-xs outline-none transition-all hover:bg-neutral-50 dark:hover:bg-neutral-800/60 focus-visible:ring-[3px] focus-visible:ring-blue-500/30"
      >
        <span className={`flex items-center gap-2 ${selectedDate ? 'text-neutral-900 dark:text-neutral-100 font-medium' : 'text-neutral-500'}`}>
          <svg className="size-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {selectedDate ? formatSelectedDate(selectedDate) : 'Pick a date'}
        </span>
        <svg
          className={`size-4 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Popover Calendar with Smooth Sliding Reveal */}
      <div
        className={`absolute left-0 top-full mt-2 w-72 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-xl z-50 transition-all ${
          open
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto visible'
            : 'opacity-0 -translate-y-2 scale-95 pointer-events-none invisible'
        }`}
        style={{
          transitionDuration: '240ms',
          transitionTimingFunction: 'cubic-bezier(0.25, 1.25, 0.5, 1)',
        }}
      >
        {/* Month Header */}
        <div className="flex items-center justify-between pb-3 px-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="flex size-7 items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="flex size-7 items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-xs font-medium text-neutral-400 py-1">
              {wd}
            </div>
          ))}
        </div>

        {/* Days grid with rounded-full circular buttons */}
        <div className="grid grid-cols-7 gap-1">
          {/* Previous month trailing days */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div
              key={`prev-${i}`}
              className="flex size-8 items-center justify-center text-xs text-neutral-300 dark:text-neutral-600 select-none"
            >
              {daysInPrevMonth - firstDayOfWeek + 1 + i}
            </div>
          ))}

          {/* Current month days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isSelected =
              selectedDate &&
              selectedDate.getFullYear() === year &&
              selectedDate.getMonth() === month &&
              selectedDate.getDate() === day;

            return (
              <button
                key={`day-${day}`}
                type="button"
                onClick={() => handleDayClick(day)}
                className={`flex size-8 items-center justify-center rounded-full text-xs transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-semibold shadow-xs'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:rounded-full'
                }`}
              >
                {day}
              </button>
            );
          })}

          {/* Next month leading days */}
          {Array.from({ length: trailingDays }).map((_, i) => (
            <div
              key={`next-${i}`}
              className="flex size-8 items-center justify-center text-xs text-neutral-300 dark:text-neutral-600 select-none"
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DatePicker3;
