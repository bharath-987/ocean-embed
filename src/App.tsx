import React, { useEffect, useRef } from 'react';
import { Navigation } from './components/Navigation';
import { CinematicVideoDive } from './components/CinematicVideoDive';
import { ResearchConsole } from './components/ResearchConsole';
import { ScientificPipeline } from './components/ScientificPipeline';
import { PrototypeShowcase } from './components/PrototypeShowcase';
import { ApplicationsGrid } from './components/ApplicationsGrid';
import { InstitutionalRoadmap } from './components/InstitutionalRoadmap';
import { FinalCTA } from './components/FinalCTA';

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

  useEffect(() => {
    // 1. Initialize Lenis for a velvety, controlled, gradual scroll
    let lenis: any = null;
    if (typeof Lenis !== 'undefined') {
      lenis = new Lenis({
        lerp: 0.08,             // smooth, continuous cinematic damping
        wheelMultiplier: 0.82,  // slow, controlled response to mouse wheel
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

    // 2. Setup GSAP ScrollTrigger ticker synchronization & scrub: 1.0 integration
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);

      if (lenis) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time: number) => {
          lenis.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(0);
      }
      // Pinned cinematic descent scrub configuration (scrub: 1.0 for velvety inertia tracking)
    }

    return () => {
      if (lenis) lenis.destroy();
    };
  }, []);

  // Smooth, non-jumping programmatic navigation
  const handleNavigate = (targetId: string) => {
    const lenis = lenisRef.current;

    // Check if target is inside the pinned cinematic track
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

    // Target is a section below the track (e.g. section-console, section-prototype)
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

  return (
    <div className="bg-[#02060d] text-[#dde2f3] min-h-screen relative font-['Inter'] selection:bg-[#00f0ff] selection:text-[#02060d] overflow-x-hidden">
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
