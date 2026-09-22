import React from 'react';

export const FinalCTA: React.FC = () => {
  return (
    <section
      className="min-h-screen w-full flex flex-col justify-between px-6 lg:px-20 pt-28 pb-12 relative text-center z-10 select-none"
      id="section-final"
    >
      <div className="max-w-4xl mx-auto my-auto space-y-8">
        <div className="font-mono text-xs tracking-widest text-[#0E7C74] uppercase">
          KYOGRE // 2026 OCEAN EMBED · SIH26066
        </div>

        <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-['Space_Grotesk'] font-bold tracking-tighter text-[#0B1420] uppercase leading-none">
          THE SURFACE IS ONLY THE BEGINNING.
        </h2>

        <p className="text-xl sm:text-2xl font-['Space_Grotesk'] font-light text-[#5B6B74] max-w-xl mx-auto">
          Seeing Beneath the Surface
        </p>

        <div className="pt-6 flex flex-wrap items-center justify-center gap-4">
          <a
            href="explore.html"
            className="px-8 py-3.5 rounded-full bg-[#0E7C74] text-white font-['Space_Grotesk'] font-semibold tracking-wider text-sm shadow-[0_4px_16px_rgba(14,124,116,0.25)] hover:shadow-[0_6px_24px_rgba(14,124,116,0.35)] hover:scale-105 transition-all duration-300"
          >
            EXPLORE KYOGRE CONSOLE
          </a>

          <a
            href="#section-prototype"
            className="px-8 py-3.5 rounded-full border border-[rgba(11,20,32,0.15)] text-[#0B1420] hover:text-[#0E7C74] hover:border-[#0E7C74]/50 text-sm font-['Space_Grotesk'] tracking-wider transition-all duration-200 backdrop-blur-sm bg-white shadow-sm"
          >
            WATCH PROTOTYPE VIDEO
          </a>

          <a
            href="argo.html"
            className="px-6 py-3.5 rounded-full border border-[rgba(11,20,32,0.12)] text-[#5B6B74] hover:text-[#0E7C74] hover:border-[#0E7C74]/30 text-xs font-mono tracking-wider transition-all bg-white shadow-sm"
          >
            ARGO VALIDATION
          </a>
        </div>
      </div>

      {/* Institutional Footer */}
      <footer className="w-full border-t border-[rgba(11,20,32,0.08)] pt-8 mt-16 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-[#5B6B74]">
        <div>
          © 2025–2026 KYOGRE // SIH26066 — Team NeuroTide, Kumaraguru College of Technology.
        </div>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <a className="hover:text-[#0E7C74] transition-colors" href="explore.html">
            Ocean Explorer
          </a>
          <a className="hover:text-[#0E7C74] transition-colors" href="fisheries.html">
            Fisheries PFZ
          </a>
          <a className="hover:text-[#0E7C74] transition-colors" href="marine-ecology.html">
            Marine Ecology
          </a>
          <a className="hover:text-[#0E7C74] transition-colors" href="argo.html">
            Argo Matchups
          </a>
        </div>
      </footer>
    </section>
  );
};
