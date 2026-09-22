import React, { useState, useRef } from 'react';

export const MinimalNav: React.FC = () => {
  const [, setHoveredIdx] = useState<number | null>(null);
  const [pillStyle, setPillStyle] = useState<React.CSSProperties>({
    opacity: 0,
    transform: 'translate3d(0, 0, 0)',
  });
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const navRef = useRef<HTMLElement | null>(null);

  const handleMouseEnter = (index: number) => {
    setHoveredIdx(index);
    const link = linkRefs.current[index];
    const nav = navRef.current;
    if (link && nav) {
      const nRect = nav.getBoundingClientRect();
      const lRect = link.getBoundingClientRect();
      setPillStyle({
        transform: `translate3d(${Math.round(lRect.left - nRect.left)}px, ${Math.round(lRect.top - nRect.top)}px, 0)`,
        width: Math.round(lRect.width),
        height: Math.round(lRect.height),
        opacity: 1,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
    setPillStyle((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-6 sm:px-12 py-5 flex items-center justify-between pointer-events-auto bg-[#FAFAFA]/80 backdrop-blur-md border-b border-[rgba(11,20,32,0.06)]">
      {/* Brand Identity — Wordmark Only, No Dot */}
      <a
        href="/"
        className="flex items-center text-[#0B1420] hover:text-[#0E7C74] transition-colors group"
      >
        <span className="font-['Space_Grotesk'] text-sm sm:text-base font-bold tracking-[0.25em] text-[#0B1420] group-hover:text-[#0E7C74] transition-colors">
          KYOGRE
        </span>
      </a>

      {/* Clean, Restrained Links with Sliding Pill */}
      <nav
        ref={navRef}
        onMouseLeave={handleMouseLeave}
        className="relative flex items-center gap-1 sm:gap-3 font-mono text-[11px] sm:text-xs tracking-wider p-1"
      >
        {/* macOS Sliding Hover Pill */}
        <div
          className="absolute top-0 left-0 rounded-lg bg-[rgba(14,124,116,0.09)] pointer-events-none z-0"
          style={{
            ...pillStyle,
            transition:
              'transform 0.26s cubic-bezier(0.25, 1.25, 0.5, 1), width 0.26s cubic-bezier(0.25, 1.25, 0.5, 1), height 0.26s cubic-bezier(0.25, 1.25, 0.5, 1), opacity 0.18s ease',
          }}
          aria-hidden="true"
        />

        <a
          ref={(el) => { linkRefs.current[0] = el; }}
          onMouseEnter={() => handleMouseEnter(0)}
          href="/explore.html"
          className="relative z-10 px-3 py-1.5 rounded-lg text-[#5B6B74] hover:text-[#0E7C74] transition-colors"
        >
          EXPLORE
        </a>
        <a
          ref={(el) => { linkRefs.current[1] = el; }}
          onMouseEnter={() => handleMouseEnter(1)}
          href="/argo.html"
          className="relative z-10 px-3 py-1.5 rounded-lg text-[#5B6B74] hover:text-[#0E7C74] transition-colors"
        >
          ARGO
        </a>
        <a
          ref={(el) => { linkRefs.current[2] = el; }}
          onMouseEnter={() => handleMouseEnter(2)}
          href="#about"
          onClick={(e) => {
            e.preventDefault();
            const target = document.getElementById('problem');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
          }}
          className="relative z-10 px-3 py-1.5 rounded-lg text-[#5B6B74] hover:text-[#0E7C74] transition-colors"
        >
          ABOUT
        </a>
      </nav>
    </header>
  );
};
