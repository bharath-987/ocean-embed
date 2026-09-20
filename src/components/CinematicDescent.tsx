import React from 'react';
import { SatelliteInput } from '../types';

interface CinematicDescentProps {
  progress: number; // 0.0 to 1.0 across the 700vh descent track
  onExplore?: () => void;
  onViewPrototype?: () => void;
  onScrollDown?: () => void;
}

const SATELLITE_INPUTS: SatelliteInput[] = [
  { id: 'sst', symbol: 'SST', name: 'Sea Surface Temperature', source: 'GHRSST / MODIS', description: 'Thermal infrared and microwave skin temperature' },
  { id: 'sss', symbol: 'SSS', name: 'Sea Surface Salinity', source: 'SMAP / SMOS', description: 'Halosteric density and freshwater flux tracking' },
  { id: 'ssh', symbol: 'SSH / SLA', name: 'Sea Level Anomaly', source: 'Altimetry (SWOT/Jason)', description: 'Baroclinic steric expansion and thermocline slope' },
  { id: 'wind', symbol: 'WINDS', name: 'Scatterometer Vectors', source: 'ASCAT / ECMWF', description: 'Wind-stress curl driving Ekman pumping' },
  { id: 'curr', symbol: 'CURRENTS', name: 'Geostrophic Advection', source: 'OSCAR', description: 'Horizontal thermal flux transport' },
];

/**
 * Continuous smooth interpolation calculation for text reveals:
 * Returns opacity [0..1], y offset [px], and blur [px] based on exact scroll position.
 */
function interpolatePhase(p: number, enterStart: number, enterPeak: number, exitStart: number, exitEnd: number) {
  if (p <= enterStart || p >= exitEnd) {
    return { opacity: 0, y: 35, blur: 8, pointerEvents: 'none' as const };
  }

  let progressFactor = 0;
  if (p < enterPeak) {
    progressFactor = (p - enterStart) / (enterPeak - enterStart); // 0 -> 1
  } else if (p <= exitStart) {
    progressFactor = 1; // Hold steady
  } else {
    progressFactor = (exitEnd - p) / (exitEnd - exitStart); // 1 -> 0
  }

  // Smoothstep easing for silky acceleration and deceleration
  const factor = Math.max(0, Math.min(1, progressFactor));
  const smooth = factor * factor * (3 - 2 * factor);

  const opacity = smooth;
  const y = (1 - smooth) * 35; // 35px -> 0px
  const blur = (1 - smooth) * 8; // 8px -> 0px
  const pointerEvents = opacity > 0.6 ? ('auto' as const) : ('none' as const);

  return { opacity, y, blur, pointerEvents };
}

export const CinematicDescent: React.FC<CinematicDescentProps> = ({
  progress,
  onExplore,
  onViewPrototype,
  onScrollDown,
}) => {
  // Phase 0: Hero (0.00 to 0.15)
  const heroOpacity = Math.max(0, Math.min(1, 1 - progress / 0.12));
  const heroY = -progress * 120;
  const heroBlur = Math.min(8, progress * 40);
  const heroPointer = heroOpacity > 0.5 ? 'auto' : 'none';

  // Phase 1: 0m Surface Break (15% to 30%)
  const p1 = interpolatePhase(progress, 0.14, 0.19, 0.26, 0.30);

  // Phase 2: 100m Volumetric Ocean & Argo (30% to 45%)
  const p2 = interpolatePhase(progress, 0.29, 0.34, 0.41, 0.45);

  // Phase 3: 250m The Observational Void (45% to 60%)
  const p3 = interpolatePhase(progress, 0.44, 0.49, 0.56, 0.60);

  // Phase 4: 500m The Turning Point Question (60% to 75%)
  const p4 = interpolatePhase(progress, 0.59, 0.64, 0.71, 0.75);

  // Phase 5: 750m Meet Kyogre & Multimodal Inputs (75% to 90%)
  const p5 = interpolatePhase(progress, 0.74, 0.79, 0.85, 0.89);

  // Phase 6: 1000m The Reconstruction Climax (90% to 100%)
  const p6Factor = Math.max(0, Math.min(1, (progress - 0.88) / 0.08));
  const p6Smooth = p6Factor * p6Factor * (3 - 2 * p6Factor);
  const p6 = {
    opacity: p6Smooth,
    y: (1 - p6Smooth) * 35,
    blur: (1 - p6Smooth) * 8,
    pointerEvents: (p6Smooth > 0.5 ? 'auto' : 'none') as 'auto' | 'none',
  };

  return (
    <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center pointer-events-none select-none z-10 px-6 sm:px-12 lg:px-20">
      {/* ─────────────────────────────────────────────────────────────
          01 // HERO — HIGH ALTITUDE AERIAL OCEAN
          ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex flex-col justify-center items-center text-center px-6 lg:px-12 transition-none"
        style={{
          opacity: heroOpacity,
          transform: `translateY(${heroY}px)`,
          filter: heroBlur > 0.5 ? `blur(${heroBlur}px)` : 'none',
          pointerEvents: heroPointer,
        }}
      >
        <div className="max-w-4xl mx-auto space-y-7">
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
            <button
              type="button"
              onClick={onExplore}
              className="px-8 py-3.5 rounded-full bg-[#00f0ff] text-[#02060d] font-['Space_Grotesk'] font-semibold tracking-wider text-sm shadow-[0_0_25px_rgba(0,240,255,0.4)] hover:shadow-[0_0_35px_rgba(0,240,255,0.8)] hover:scale-[1.02] transition-all duration-300 flex items-center gap-2 cursor-pointer"
            >
              <span>EXPLORE KYOGRE</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onViewPrototype}
              className="px-8 py-3.5 rounded-full border border-white/20 text-[#dde2f3] hover:text-[#00f0ff] hover:border-[#00f0ff]/50 text-sm font-['Space_Grotesk'] tracking-wider transition-all duration-300 backdrop-blur-sm bg-black/20 cursor-pointer"
            >
              VIEW PROTOTYPE
            </button>
          </div>
        </div>

        {/* Scroll indicator prompt (fades out first) */}
        <div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#94a9be] transition-opacity duration-300 cursor-pointer"
          style={{ opacity: Math.max(0, 1 - progress / 0.05) }}
          onClick={onScrollDown}
        >
          <span className="font-mono text-[10px] tracking-widest uppercase opacity-75">
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
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          02 // 0m — THE SURFACE (Breaking the Waterline)
          ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute max-w-4xl space-y-6 text-left"
        style={{
          opacity: p1.opacity,
          transform: `translateY(${p1.y}px)`,
          filter: p1.blur > 0.5 ? `blur(${p1.blur}px)` : 'none',
          pointerEvents: p1.pointerEvents,
        }}
      >
        <div className="font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]"></span>
          <span>0.0 METERS // EPILIMNION WATERLINE</span>
        </div>

        <h2 className="text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff] leading-tight">
          WE CAN SEE THE SURFACE.<br />
          <span className="text-[#94a9be] font-light">BUT NOT EVERYTHING BENEATH IT.</span>
        </h2>

        <p className="text-base sm:text-lg text-[#94a9be] font-light max-w-2xl leading-relaxed">
          Satellite radar altimeters and radiometers blanket millions of square kilometers daily, providing Sea Surface Temperature, Salinity, and Sea Level Anomalies. Yet optical and infrared wavelengths cannot penetrate beyond the skin layer of the oceanic column.
        </p>

        <div className="pt-4 flex flex-wrap gap-8 text-xs font-mono text-[#48627e] border-t border-white/10 max-w-xl">
          <div>
            <span className="text-[#00dbe9] font-bold">PENETRATION DEPTH:</span> &lt; 1.0 mm (Infrared/Microwave)
          </div>
          <div>
            <span className="text-[#00dbe9] font-bold">SATELLITE SWATH:</span> Sentinel-3, Jason-3, SWOT
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          03 // 100m — THE PROBLEM (The Volumetric Ocean & Argo Sparsity)
          ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute max-w-5xl space-y-10 text-left"
        style={{
          opacity: p2.opacity,
          transform: `translateY(${p2.y}px)`,
          filter: p2.blur > 0.5 ? `blur(${p2.blur}px)` : 'none',
          pointerEvents: p2.pointerEvents,
        }}
      >
        <div className="space-y-4">
          <div className="font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]"></span>
            <span>100 METERS // THERMOCLINE BOUNDARY</span>
          </div>

          <h2 className="text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff] leading-tight">
            THE OCEAN IS VOLUMETRIC.<br />
            <span className="text-[#94a9be] font-light">OUR OBSERVATIONS ARE NOT.</span>
          </h2>

          <p className="text-base sm:text-lg text-[#94a9be] font-light max-w-2xl leading-relaxed">
            Physical in-situ profiling relies primarily on the autonomous ARGO buoy array. Each float drifts with deep currents and surfaces only once every 10 days, leaving vast oceanic basins temporally disconnected.
          </p>
        </div>

        {/* Telemetry Counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-4 border-t border-white/10 max-w-3xl">
          <div className="space-y-1">
            <div className="text-3xl sm:text-4xl font-['Space_Grotesk'] font-light text-[#dbfcff] font-mono">
              ~300 km
            </div>
            <div className="text-xs font-mono text-[#00f0ff] tracking-wider uppercase">Spatial Sparsity</div>
            <p className="text-xs text-[#94a9be] font-light">
              Average lateral distance between physical profiling buoys across the Indian Ocean basin.
            </p>
          </div>

          <div className="space-y-1">
            <div className="text-3xl sm:text-4xl font-['Space_Grotesk'] font-light text-[#dbfcff] font-mono">
              10 Days
            </div>
            <div className="text-xs font-mono text-[#00f0ff] tracking-wider uppercase">Temporal Gap</div>
            <p className="text-xs text-[#94a9be] font-light">
              Descent to 1000m parking depth and ascent cycle, missing transient cyclones and eddies.
            </p>
          </div>

          <div className="space-y-1">
            <div className="text-3xl sm:text-4xl font-['Space_Grotesk'] font-light text-[#dbfcff] font-mono">
              Δ 16.5°C
            </div>
            <div className="text-xs font-mono text-[#00f0ff] tracking-wider uppercase">Thermocline Gradient</div>
            <p className="text-xs text-[#94a9be] font-light">
              Steep thermal drop within upper 150m controlling tropical cyclone heat potential.
            </p>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          04 // 250m — THE GAP (The Observational Vacuum)
          ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute max-w-2xl space-y-6 text-right ml-auto"
        style={{
          opacity: p3.opacity,
          transform: `translateY(${p3.y}px)`,
          filter: p3.blur > 0.5 ? `blur(${p3.blur}px)` : 'none',
          pointerEvents: p3.pointerEvents,
          right: '5%',
        }}
      >
        <div className="font-mono text-xs tracking-widest text-[#00f0ff] inline-flex items-center gap-2">
          <span>250 METERS // MESOPELAGIC TWILIGHT</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]"></span>
        </div>

        <h2 className="text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff] leading-tight">
          BETWEEN THE OBSERVATIONS<br />
          <span className="text-[#94a9be] font-light">LIES THE UNKNOWN.</span>
        </h2>

        <p className="text-base sm:text-lg text-[#94a9be] font-light leading-relaxed">
          When marine heatwaves ignite or cyclone eddies churn the subsurface waters, our physical buoy arrays are hundreds of nautical miles away. Without high-resolution continuous subsurface fields, numerical models are forced to rely on historical climatology.
        </p>

        <div className="font-mono text-xs text-[#48627e] tracking-wider pt-2">
          [ ARGO VOLUMETRIC COVERAGE DENSITY: &lt; 0.000004% OF WATER COLUMN ]
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          05 // 500m — THE QUESTION (Dramatic Turning Point)
          ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute max-w-4xl space-y-8 text-center"
        style={{
          opacity: p4.opacity,
          transform: `translateY(${p4.y}px)`,
          filter: p4.blur > 0.5 ? `blur(${p4.blur}px)` : 'none',
          pointerEvents: p4.pointerEvents,
        }}
      >
        <div className="font-mono text-xs tracking-widest text-[#00f0ff] uppercase">
          500 METERS // INTERMEDIATE DEPTH
        </div>

        <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-['Space_Grotesk'] font-bold tracking-tight text-[#dbfcff] drop-shadow-[0_0_35px_rgba(0,240,255,0.4)] leading-tight">
          HOW DO WE RECONSTRUCT WHAT WE CANNOT DIRECTLY OBSERVE?
        </h2>

        <p className="text-lg sm:text-xl text-[#dde2f3] font-light max-w-2xl mx-auto leading-relaxed">
          Can surface ocean signatures be transformed into an accurate, continuous volumetric representation of subsurface temperature?
        </p>

        <div className="text-xs font-mono text-[#00dbe9] tracking-widest uppercase pt-6">
          BY MAPPING BAROCLINIC DYNAMICS THROUGH SPATIO-TEMPORAL DEEP LEARNING
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          06 // 750m — MEET KYOGRE (Architecture Inscriptions)
          ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute max-w-5xl space-y-10 text-left"
        style={{
          opacity: p5.opacity,
          transform: `translateY(${p5.y}px)`,
          filter: p5.blur > 0.5 ? `blur(${p5.blur}px)` : 'none',
          pointerEvents: p5.pointerEvents,
        }}
      >
        <div className="space-y-4">
          <div className="font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]"></span>
            <span>750 METERS // DEEP THERMOCLINE</span>
          </div>

          <h2 className="text-4xl sm:text-6xl md:text-7xl font-['Space_Grotesk'] font-bold tracking-tight text-[#dbfcff] uppercase leading-tight">
            MEET KYOGRE.
          </h2>

          <p className="text-lg sm:text-xl text-[#94a9be] font-light max-w-2xl leading-relaxed">
            AI-powered reconstruction of subsurface ocean temperature fields from satellite remote sensing observations alone.
          </p>
        </div>

        {/* Satellite Input Chips */}
        <div className="space-y-3">
          <div className="text-xs font-mono text-[#48627e] tracking-widest uppercase mb-4">
            [ MULTIMODAL SATELLITE SURFACE EMBEDDINGS ]
          </div>

          <div className="flex flex-wrap gap-3 max-w-3xl">
            {SATELLITE_INPUTS.map((inp) => (
              <div
                key={inp.id}
                className="px-4 py-2.5 rounded-full border border-[#00f0ff]/30 bg-black/40 backdrop-blur-sm text-xs font-mono text-[#dbfcff] hover:border-[#00f0ff] transition-colors"
              >
                <span className="text-[#00dbe9] font-bold mr-2">{inp.symbol}</span>
                <span>{inp.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs font-mono text-[#00dbe9] tracking-wide max-w-2xl border-l-2 border-[#00f0ff]/60 pl-4 py-1.5 bg-black/20 rounded-r">
          Spatial CNN filters extract meso-scale eddy structures, while bi-directional LSTM units learn planetary wave propagation delays and vertical heat diffusion.
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          07 // 1000m — THE RECONSTRUCTION (The Visual Climax)
          ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute max-w-4xl space-y-6 text-left"
        style={{
          opacity: p6.opacity,
          transform: `translateY(${p6.y}px)`,
          filter: p6.blur > 0.5 ? `blur(${p6.blur}px)` : 'none',
          pointerEvents: p6.pointerEvents,
        }}
      >
        <div className="font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-ping"></span>
          <span>1000 METERS // BATHYPELAGIC REALM</span>
        </div>

        <h2 className="text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-bold tracking-tight text-[#dbfcff] leading-tight">
          FROM SURFACE SIGNALS<br />
          <span className="text-[#00dbe9] font-light">TO SUBSURFACE INTELLIGENCE.</span>
        </h2>

        <p className="text-base sm:text-lg text-[#94a9be] font-light max-w-2xl leading-relaxed">
          Kyogre reconstructs full volumetric thermal strata across standard depths from 0m down to 1000m. The invisible internal wave dynamics, thermocline depths, and oceanic heat reservoirs are rendered computable.
        </p>

        <div className="flex flex-wrap gap-8 pt-4 text-xs font-mono text-[#48627e] border-t border-white/10 max-w-xl">
          <div>
            <span className="text-[#dbfcff] font-bold">GRID RESOLUTION:</span> 0.25° × 0.25°
          </div>
          <div>
            <span className="text-[#dbfcff] font-bold">VERTICAL LEVELS:</span> 36 Standard Depths
          </div>
          <div>
            <span className="text-[#dbfcff] font-bold">INFERENCE:</span> &lt; 140ms / Basin Cell
          </div>
        </div>
      </div>
    </div>
  );
};
