import React, { useEffect, useRef } from 'react';
import { Navigation } from './components/Navigation';
import { CinematicVideoDive } from './components/CinematicVideoDive';
import { ResearchConsole } from './components/ResearchConsole';
import { ScientificPipeline } from './components/ScientificPipeline';
import { PrototypeShowcase } from './components/PrototypeShowcase';
import { ApplicationsGrid } from './components/ApplicationsGrid';
import { InstitutionalRoadmap } from './components/InstitutionalRoadmap';
import { FinalCTA } from './components/FinalCTA';

import { MinimalNav } from './components/landing/MinimalNav';
import { HeroSection } from './components/landing/HeroSection';

declare const Lenis: any;
declare const gsap: any;
declare const ScrollTrigger: any;

const DEPTH_PROGRESS_TARGETS: Record<string, number> = {
  hero: 0.0,
  'section-surface': 0.15,
  'section-problem': 0.27,
  'section-gap': 0.39,
  'section-question': 0.51,
  'section-kyogre': 0.64,
  'section-reconstruction': 0.85,
};

export const App: React.FC = () => {
  const lenisRef = useRef<any>(null);
  // Default to the new 3D Cinematic Landing on ui-sample branch; access classic via ?view=classic
  const [isClassicView, setIsClassicView] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('view') === 'classic';
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#problem') {
      const el = document.getElementById('problem');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!isClassicView) return;

    // Initialize Lenis and GSAP only if classic view is requested
    let lenis: any = null;
    if (typeof Lenis !== 'undefined') {
      lenis = new Lenis({
        lerp: 0.08,
        wheelMultiplier: 0.82,
        touchMultiplier: 1.2,
        smoothWheel: true,
      });
      lenisRef.current = lenis;

      function raf(time: number) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    }

    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);

      if (lenis) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time: number) => {
          lenis.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(0);
      }
    }

    return () => {
      if (lenis) lenis.destroy();
    };
  }, [isClassicView]);

  // Smooth, non-jumping programmatic navigation for classic view
  const handleNavigate = (targetId: string) => {
    const lenis = lenisRef.current;

    if (targetId in DEPTH_PROGRESS_TARGETS) {
      const track = document.getElementById('cinematic-track');
      if (track) {
        const targetFraction = DEPTH_PROGRESS_TARGETS[targetId];
        const trackTop = track.offsetTop;
        const trackScrollable = track.offsetHeight - window.innerHeight;
        const targetScrollY = trackTop + targetFraction * trackScrollable;

        if (lenis) {
          lenis.scrollTo(targetScrollY, {
            duration: 1.6,
            easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          });
        } else {
          window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
        }
        return;
      }
    }

    const el = document.getElementById(targetId);
    if (el) {
      if (lenis) {
        lenis.scrollTo(el, {
          duration: 1.6,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        });
      } else {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Milestone 3: Polished 3D Hero Section for Kyogre Landing Page
  if (!isClassicView) {
    return (
      <div className="bg-[#FAFAFA] text-[#0B1420] min-h-screen relative font-['Inter'] selection:bg-[#0E7C74]/20 selection:text-[#0B1420] overflow-x-hidden">
        {/* Minimal Navigation */}
        <MinimalNav />

        {/* 100vh Hero Viewport with persistent 3D Ocean Globe */}
        <main>
          <HeroSection
            onExploreClick={() => {
              const el = document.getElementById('problem');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          {/* Section Anchor for Next Story Section (Section 02 // The Problem) */}
          <section id="problem" className="relative w-full py-24 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[rgba(11,20,32,0.08)] bg-[#FAFAFA]">
            <div className="flex items-center gap-3 text-xs font-mono text-[#0E7C74] uppercase tracking-widest mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0E7C74]"></span>
              <span>SECTION 02 // THE PROBLEM</span>
            </div>
            <h2 className="font-['Space_Grotesk'] text-2xl sm:text-4xl font-bold text-[#0B1420] tracking-tight">
              The Ocean Depth Blindspot
            </h2>
            <p className="mt-4 text-[#5B6B74] font-['Inter'] text-sm sm:text-base max-w-2xl leading-relaxed">
              Satellites observe only the skin of the sea. What lies beneath dictates monsoons, cyclones, and global climate stability.
            </p>

            {/* Problem Comparison Cards */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-xl bg-white border border-[rgba(11,20,32,0.08)] shadow-[0_4px_20px_rgba(11,20,32,0.03)]">
                <div className="text-[11px] font-mono text-[#0E7C74] tracking-wider uppercase mb-2">Observation 01</div>
                <h3 className="font-['Space_Grotesk'] font-bold text-lg text-[#0B1420] mb-2">Surface Skin Trap</h3>
                <p className="text-xs text-[#5B6B74] leading-relaxed">
                  Infrared and microwave radiometers penetrate less than 1 mm into the ocean surface, leaving 99.9% of the water column unobserved.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-white border border-[rgba(11,20,32,0.08)] shadow-[0_4px_20px_rgba(11,20,32,0.03)]">
                <div className="text-[11px] font-mono text-[#0E7C74] tracking-wider uppercase mb-2">Observation 02</div>
                <h3 className="font-['Space_Grotesk'] font-bold text-lg text-[#0B1420] mb-2">Extreme Spatial Gaps</h3>
                <p className="text-xs text-[#5B6B74] leading-relaxed">
                  In-situ ARGO floats drift hundreds of kilometers apart across the basin, leaving immense physical voids where cyclones intensify.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-white border border-[rgba(11,20,32,0.08)] shadow-[0_4px_20px_rgba(11,20,32,0.03)]">
                <div className="text-[11px] font-mono text-[#0E7C74] tracking-wider uppercase mb-2">Observation 03</div>
                <h3 className="font-['Space_Grotesk'] font-bold text-lg text-[#0B1420] mb-2">Thermal Barrier</h3>
                <p className="text-xs text-[#5B6B74] leading-relaxed">
                  Without subsurface profile data down to 1000m, rapid cyclone intensification and marine heatwave warnings fail when they are needed most.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-[#02060d] text-[#dde2f3] min-h-screen relative font-['Inter'] selection:bg-[#00f0ff] selection:text-[#02060d] overflow-x-hidden">
      {/* Return to 3D Preview Pill */}
      <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-[#060d1a]/80 backdrop-blur-md border border-[#00f0ff]/20 px-3.5 py-1.5 rounded-full text-xs font-mono text-[#00f0ff] shadow-[0_0_20px_rgba(0,0,0,0.6)]">
        <span>CLASSIC LANDING VIEW</span>
        <button
          onClick={() => setShow3dPreview(true)}
          className="ml-2 text-[#00f0ff] hover:text-white underline underline-offset-2 font-bold transition-colors cursor-pointer"
        >
          View 3D Ocean Globe
        </button>
      </div>

      {/* Minimal Floating Brand Mark in Top-Left */}
      <Navigation onNavigate={handleNavigate} />

      {/* THE 1000vh PINNED CINEMATIC OCEAN DIVE (THE CAMERA ENGINE) */}
      <div id="cinematic-track" className="relative w-full" style={{ height: '1000vh' }}>
        <CinematicVideoDive
          onExplore={() => handleNavigate('section-console')}
          onViewPrototype={() => handleNavigate('section-prototype')}
          onScrollDown={() => handleNavigate('section-surface')}
          onSelectDepth={handleNavigate}
        />
      </div>

      {/* Post-1000m Product Interface & Institutional Sections with living scroll-linked video backdrop */}
      <main className="relative z-10 w-full bg-gradient-to-b from-transparent via-[#02060d]/70 to-[#02060d]/85">
        {/* 08 // Research Console (The Ocean, Made Computable) */}
        <ResearchConsole />

        {/* 09 // Scientific Pipeline & Validation */}
        <ScientificPipeline />

        {/* 10 // Prototype Showcase & Demo Video */}
        <PrototypeShowcase />

        {/* 11 // National Ocean Applications */}
        <ApplicationsGrid />

        {/* 12 // Institutional Integration Roadmap */}
        <InstitutionalRoadmap />

        {/* 13 // Final CTA & Footer */}
        <FinalCTA />
      </main>
    </div>
  );
};
