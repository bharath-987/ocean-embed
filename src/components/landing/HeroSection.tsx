import React, { useState, useEffect } from 'react';
import { OceanScene } from '../../3d/OceanScene';

interface HeroSectionProps {
  onExploreClick?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onExploreClick }) => {
  const [screenState, setScreenState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('screen') === '2') return 2;
    }
    return 1;
  });

  const handleSetScreen = (screen: number) => {
    setScreenState(screen);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('screen', screen.toString());
      window.history.replaceState({}, '', url.toString());
      if ((window as any).setKyogreScreenState) {
        (window as any).setKyogreScreenState(screen);
      }
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).setKyogreScreen = handleSetScreen;
    }
  }, []);

  const handleScrollToNext = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onExploreClick) {
      onExploreClick();
    } else {
      const target = document.getElementById('problem');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <section className="relative w-full min-h-screen flex items-center justify-between overflow-hidden bg-[#FAFAFA] pt-28 pb-16 lg:py-0">
      <div className="relative z-20 w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-14 min-h-[calc(100vh-6rem)]">
        {/* Left Column: Hero Editorial Content */}
        <div className="w-full lg:w-[48%] max-w-xl flex flex-col justify-center">
          {/* Large Editorial Headline — First element per Requirement 5 */}
          <h1 className="font-['Space_Grotesk'] text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#0B1420] leading-[1.05] sm:leading-[1.02] mb-5 sm:mb-6">
            SEE WHAT&apos;S <br />
            <span className="text-[#0E7C74]">HIDDEN</span>
            <span className="block mt-1 sm:mt-2 text-[#5B6B74] font-light">
              BENEATH <br />
              <span className="text-[#0B1420] font-bold">THE OCEAN.</span>
            </span>
          </h1>

          {/* Supporting Copy */}
          <p className="font-['Inter'] text-sm sm:text-base lg:text-lg text-[#5B6B74] font-normal leading-relaxed mb-6 sm:mb-8">
            Satellite inputs; network trained on the GLORYS reanalysis, then on real Argo floats across 5°N–30°N, 45°E–105°E.
          </p>

          {/* Premium Product Interaction CTA */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-5 pointer-events-auto">
            <a
              href="#problem"
              onClick={handleScrollToNext}
              className="group relative inline-flex items-center gap-3 px-5 sm:px-6 py-3 sm:py-3.5 bg-[#0E7C74] hover:bg-[#09605a] border border-[#0E7C74] text-white font-mono text-xs tracking-[0.15em] transition-all duration-300 rounded shadow-[0_4px_16px_rgba(14,124,116,0.25)] hover:shadow-[0_6px_24px_rgba(14,124,116,0.35)]"
            >
              <span className="text-white font-medium">EXPLORE THE OCEAN</span>
              <span className="text-[#cbfaf6] transform transition-transform duration-300 group-hover:translate-y-0.5">
                ↓
              </span>
            </a>

            <a
              href="/explore.html"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-3.5 text-[#5B6B74] hover:text-[#0B1420] font-mono text-xs tracking-wider border border-[rgba(11,20,32,0.12)] hover:border-[rgba(11,20,32,0.3)] bg-white/80 hover:bg-white transition-all duration-200 rounded shadow-sm"
            >
              <span>OPEN DASHBOARD</span>
              <span className="text-[10px] text-[#0E7C74]">↗</span>
            </a>
          </div>

          {/* Scientific Screen State Switcher (Screen 1 vs Screen 2) */}
          <div className="mt-8 inline-flex items-center p-1 rounded-lg bg-white/90 border border-[rgba(11,20,32,0.1)] shadow-sm backdrop-blur-md font-mono text-[10px] sm:text-[11px] pointer-events-auto w-fit">
            <button
              type="button"
              onClick={() => handleSetScreen(1)}
              className={`px-3 py-1.5 rounded transition-all duration-200 flex items-center gap-2 ${
                screenState === 1
                  ? 'bg-[#0E7C74]/10 text-[#0E7C74] border border-[#0E7C74]/30 shadow-xs font-semibold'
                  : 'text-[#5B6B74] hover:text-[#0B1420] border border-transparent'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${screenState === 1 ? 'bg-[#0E7C74]' : 'bg-[#94a9be]'}`}></span>
              <span>SCREEN 1: IDLE DOMAIN</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetScreen(2)}
              className={`px-3 py-1.5 rounded transition-all duration-200 flex items-center gap-2 ${
                screenState === 2
                  ? 'bg-[#0E7C74]/10 text-[#0E7C74] border border-[#0E7C74]/30 shadow-xs font-semibold'
                  : 'text-[#5B6B74] hover:text-[#0B1420] border border-transparent'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${screenState === 2 ? 'bg-[#0E7C74] animate-pulse' : 'bg-[#94a9be]'}`}></span>
              <span>SCREEN 2: SPARSE ARGO GAPS</span>
            </button>
          </div>

          {/* Restrained Scientific Telemetry Indicators */}
          <div className="mt-8 pt-6 border-t border-[rgba(11,20,32,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 font-mono text-[10px] sm:text-[11px] text-[#5B6B74]">
            <div className="flex items-center gap-2">
              <span className="text-[#0E7C74] font-semibold">SYS:</span>
              <span>HYBRID EMBEDDING PIPELINE</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#0E7C74] font-semibold">GRID:</span>
              <span>0.25° NORTH INDIAN OCEAN</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#0E7C74] font-semibold">VALIDATION:</span>
              <span>41 BASIN ARGO PROFILES</span>
            </div>
          </div>
        </div>

        {/* Right Column: Intentional Ocean Viewport Card */}
        <div className="w-full lg:w-[52%] max-w-2xl">
          <div className="relative w-full h-[340px] sm:h-[460px] lg:h-[560px] rounded-2xl sm:rounded-3xl bg-[#030914] border border-[rgba(11,20,32,0.12)] shadow-[0_20px_50px_rgba(11,20,32,0.10)] overflow-hidden flex flex-col">
            {/* Viewport Top Header Badge */}
            <div className="px-4 sm:px-5 py-3 sm:py-3.5 bg-[#030914]/85 backdrop-blur-md border-b border-white/5 flex items-center justify-between text-[10px] sm:text-[11px] font-mono pointer-events-none z-10">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[#dbfcff] font-medium tracking-wider">REGIONAL MODEL VIEWPORT</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-[#94a9be]">
                <span className="text-[#00f0ff] font-semibold">
                  {screenState === 1 ? 'IDLE DOMAIN' : 'SPARSE GAPS'}
                </span>
                <span className="text-white/20">|</span>
                <span>5°N–30°N, 45°E–105°E</span>
              </div>
            </div>

            {/* Centered 3D Ocean Scene inside Viewport */}
            <div className="relative w-full h-full">
              <OceanScene
                screenState={screenState}
                onScreenChange={setScreenState}
                isContained={true}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
