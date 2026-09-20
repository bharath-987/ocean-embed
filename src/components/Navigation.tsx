import React, { useEffect, useRef } from 'react';

interface NavigationProps {
  onNavigate?: (sectionId: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ onNavigate }) => {
  const labelRef = useRef<HTMLAnchorElement>(null);

  // Scroll-driven "focus-pull" reveal:
  // Starts hidden at opacity 0, scale 0.92, blur 4px.
  // Fades IN with scale-up + blur-to-sharp as the large hero heading scrolls out of view.
  // Fades back OUT (scale-down + re-blur) when scrolling back to top.
  useEffect(() => {
    const updateState = () => {
      if (!labelRef.current) return;
      const scrollY = window.scrollY;
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      const pFull = totalScroll > 0 ? Math.max(0, Math.min(1, scrollY / totalScroll)) : 0;

      const fadeStart = 0.04;
      const fadeEnd = 0.10;

      let t = 0;
      if (pFull <= fadeStart) {
        t = 0;
      } else if (pFull >= fadeEnd) {
        t = 1;
      } else {
        const raw = (pFull - fadeStart) / (fadeEnd - fadeStart);
        // smoothstep
        t = raw * raw * (3 - 2 * raw);
      }

      const opacity = t;
      const scale = 0.92 + t * 0.08;   // 0.92 → 1.0
      const blur  = (1 - t) * 4;        // 4px → 0px

      labelRef.current.style.opacity   = `${opacity}`;
      labelRef.current.style.transform = `scale(${scale})`;
      labelRef.current.style.filter    = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : 'none';
    };

    updateState();
    window.addEventListener('scroll', updateState, { passive: true });
    return () => window.removeEventListener('scroll', updateState);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate('hero');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed top-7 left-6 sm:left-10 z-50 pointer-events-auto select-none">
      <a
        ref={labelRef}
        href="#hero"
        onClick={handleClick}
        className="text-sm sm:text-base font-['Space_Grotesk'] font-medium tracking-[0.26em] text-[#dde2f3]/90 hover:text-white uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
        style={{
          opacity: 0,
          transform: 'scale(0.92)',
          filter: 'blur(4px)',
          transition: 'opacity 350ms ease, transform 350ms ease, filter 350ms ease',
          transformOrigin: 'left center',
        }}
      >
        KYOGRE
      </a>
    </div>
  );
};
