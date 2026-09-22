import React, { useState, useRef, useEffect, type ReactNode } from "react";

export interface MacOSSidebarProps {
  items: string[];
  initialSelectedIndex?: number;
  onSelect?: (index: number, item: string) => void;
  children?: ReactNode;
  className?: string;
}

/**
 * MacOSSidebar — macOS-style sidebar with spring sliding hover pill
 * Stripped of '+' create button and collapse/close toggle per user specification.
 */
export function MacOSSidebar({
  items,
  initialSelectedIndex = 0,
  onSelect,
  children,
  className = "",
}: MacOSSidebarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(initialSelectedIndex);
  const [pillStyle, setPillStyle] = useState<React.CSSProperties>({
    opacity: 0,
    transform: "translate3d(0, 0, 0)",
  });
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== selectedIndex) {
      const el = itemRefs.current[hoveredIndex];
      const container = containerRef.current;
      if (el && container) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        setPillStyle({
          top: 0,
          left: 0,
          transform: `translate3d(${Math.round(eRect.left - cRect.left)}px, ${Math.round(eRect.top - cRect.top)}px, 0)`,
          width: Math.round(eRect.width),
          height: Math.round(eRect.height),
          opacity: 1,
        });
      }
    } else {
      setPillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [hoveredIndex, selectedIndex]);

  return (
    <div
      className={`flex bg-neutral-100 dark:bg-neutral-900 rounded-3xl p-3 relative w-full sm:min-w-[480px] overflow-hidden ${className}`}
    >
      <div className="w-60 p-2 rounded-2xl shrink-0 flex flex-col items-start bg-white/70 dark:bg-neutral-800/80 backdrop-blur-sm border border-black/5 dark:border-white/5">
        <div
          ref={containerRef}
          className="flex flex-col gap-1 w-full relative z-10 whitespace-nowrap"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* macOS Spring Sliding Hover Pill */}
          <div
            className="absolute rounded-lg bg-neutral-200/60 dark:bg-neutral-700/50 pointer-events-none z-0"
            style={{
              ...pillStyle,
              transition:
                "transform 0.28s cubic-bezier(0.25, 1.25, 0.5, 1), width 0.28s cubic-bezier(0.25, 1.25, 0.5, 1), height 0.28s cubic-bezier(0.25, 1.25, 0.5, 1), opacity 0.18s ease",
            }}
            aria-hidden="true"
          />

          {items.map((item, index) => {
            const isSelected = selectedIndex === index;
            return (
              <div
                key={item}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className={`relative cursor-pointer rounded-lg px-4 py-2.5 transition-colors select-none ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium"
                    : "text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
                onMouseEnter={() => setHoveredIndex(index)}
                onClick={() => {
                  setSelectedIndex(index);
                  if (onSelect) onSelect(index, item);
                }}
              >
                <p className="relative z-10 text-sm tracking-tight">{item}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 w-full h-full min-h-full overflow-y-auto z-0 pl-4 lg:pl-8">
        {children}
      </div>
    </div>
  );
}
