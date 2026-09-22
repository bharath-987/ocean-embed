import React from 'react';

export const MinimalNav: React.FC = () => {
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

      {/* Clean, Restrained Links */}
      <nav className="flex items-center gap-4 sm:gap-10 font-mono text-[11px] sm:text-xs tracking-wider">
        <a
          href="/explore.html"
          className="text-[#5B6B74] hover:text-[#0E7C74] transition-colors"
        >
          EXPLORE
        </a>
        <a
          href="/argo.html"
          className="text-[#5B6B74] hover:text-[#0E7C74] transition-colors"
        >
          ARGO
        </a>
        <a
          href="#about"
          onClick={(e) => {
            e.preventDefault();
            const target = document.getElementById('problem');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
          }}
          className="text-[#5B6B74] hover:text-[#0E7C74] transition-colors"
        >
          ABOUT
        </a>
      </nav>
    </header>
  );
};
