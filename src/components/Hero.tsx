import React from 'react';

interface HeroProps {
  onExplore?: () => void;
  onViewPrototype?: () => void;
  onScrollDown?: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExplore, onViewPrototype, onScrollDown }) => {
  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      className="min-h-screen w-full flex flex-col justify-center items-center px-6 lg:px-12 relative text-center py-16 select-none"
      id="hero"
    >
      <div className="max-w-4xl mx-auto space-y-7 z-10">
        {/* Metadata chip */}
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-xs font-mono text-[#00dbe9] tracking-widest uppercase bg-black/40 backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-ping"></span>
          <span>SIH26066 · OCEAN EMBED · NEUROTIDE</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-['Space_Grotesk'] font-bold tracking-tighter uppercase text-[#dbfcff] leading-none drop-shadow-[0_0_45px_rgba(0,240,255,0.4)]">
          KYOGRE
        </h1>

        {/* Tagline */}
        <p className="text-xl sm:text-2xl md:text-3xl font-['Space_Grotesk'] font-light text-[#00f0ff] tracking-wide">
          Seeing Beneath the Surface
        </p>

        {/* Description */}
        <p className="text-base sm:text-lg text-[#94a9be] font-light max-w-xl mx-auto leading-relaxed">
          AI-powered reconstruction of subsurface ocean temperature fields using multimodal satellite observations.
        </p>

        {/* Action Buttons */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-5">
          <a
            href="explore.html"
            className="px-8 py-3.5 rounded-full bg-[#00f0ff] text-[#02060d] font-['Space_Grotesk'] font-semibold tracking-wider text-sm shadow-[0_0_25px_rgba(0,240,255,0.4)] hover:shadow-[0_0_35px_rgba(0,240,255,0.8)] hover:scale-[1.02] transition-all duration-300 flex items-center gap-2"
          >
            <span>EXPLORE KYOGRE</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>

          <a
            href="#section-prototype"
            onClick={(e) => {
              e.preventDefault();
              if (onViewPrototype) onViewPrototype();
              else handleScrollTo('section-prototype');
            }}
            className="px-8 py-3.5 rounded-full border border-white/20 text-[#dde2f3] hover:text-[#00f0ff] hover:border-[#00f0ff]/50 text-sm font-['Space_Grotesk'] tracking-wider transition-all duration-300 backdrop-blur-sm bg-black/20"
          >
            VIEW PROTOTYPE
          </a>
        </div>
      </div>

      {/* Scroll indicator prompt */}
      <a
        href="#section-surface"
        onClick={(e) => {
          e.preventDefault();
          if (onScrollDown) onScrollDown();
          else handleScrollTo('section-surface');
        }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#94a9be] hover:text-[#00f0ff] transition-colors cursor-pointer group z-10"
      >
        <span className="font-mono text-[10px] tracking-widest uppercase opacity-75 group-hover:opacity-100">
          SCROLL TO DESCEND
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#00f0ff"
          strokeWidth="2"
          className="animate-bounce"
        >
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </a>
    </section>
  );
};
