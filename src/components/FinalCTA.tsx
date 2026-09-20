import React from 'react';

export const FinalCTA: React.FC = () => {
  return (
    <section
      className="min-h-screen w-full flex flex-col justify-between px-6 lg:px-20 pt-28 pb-12 relative text-center z-10 select-none"
      id="section-final"
    >
      <div className="max-w-4xl mx-auto my-auto space-y-8">
        <div className="font-mono text-xs tracking-widest text-[#00f0ff] uppercase">
          KYOGRE // 2026 OCEAN EMBED · SIH26066
        </div>

        <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-['Space_Grotesk'] font-bold tracking-tighter text-[#dbfcff] drop-shadow-[0_0_40px_rgba(0,240,255,0.45)] uppercase leading-none">
          THE SURFACE IS ONLY THE BEGINNING.
        </h2>

        <p className="text-xl sm:text-2xl font-['Space_Grotesk'] font-light text-[#94a9be] max-w-xl mx-auto">
          Seeing Beneath the Surface
        </p>

        <div className="pt-6 flex flex-wrap items-center justify-center gap-4">
          <a
            href="explore.html"
            className="px-8 py-3.5 rounded-full bg-[#00f0ff] text-[#02060d] font-['Space_Grotesk'] font-semibold tracking-wider text-sm shadow-[0_0_25px_rgba(0,240,255,0.6)] hover:shadow-[0_0_40px_rgba(0,240,255,0.9)] hover:scale-105 transition-all duration-300"
          >
            EXPLORE KYOGRE CONSOLE
          </a>

          <a
            href="#section-prototype"
            className="px-8 py-3.5 rounded-full border border-white/20 text-[#dde2f3] hover:text-[#00f0ff] hover:border-[#00f0ff]/50 text-sm font-['Space_Grotesk'] tracking-wider transition-all duration-200 backdrop-blur-sm bg-black/20"
          >
            WATCH PROTOTYPE VIDEO
          </a>

          <a
            href="argo.html"
            className="px-6 py-3.5 rounded-full border border-white/10 text-[#48627e] hover:text-[#00f0ff] hover:border-[#00f0ff]/30 text-xs font-mono tracking-wider transition-all"
          >
            ARGO VALIDATION
          </a>
        </div>
      </div>

      {/* Institutional Footer */}
      <footer className="w-full border-t border-white/10 pt-8 mt-16 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-[#48627e]">
        <div>
          © 2025–2026 KYOGRE // SIH26066 — Team NeuroTide, Kumaraguru College of Technology.
        </div>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <a className="hover:text-[#00f0ff] transition-colors" href="explore.html">
            Ocean Explorer
          </a>
          <a className="hover:text-[#00f0ff] transition-colors" href="fisheries.html">
            Fisheries PFZ
          </a>
          <a className="hover:text-[#00f0ff] transition-colors" href="marine-ecology.html">
            Marine Ecology
          </a>
          <a className="hover:text-[#00f0ff] transition-colors" href="argo.html">
            Argo Matchups
          </a>
        </div>
      </footer>
    </section>
  );
};
