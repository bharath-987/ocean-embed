import React from 'react';
import { SatelliteInput } from '../types';

const SATELLITE_INPUTS: SatelliteInput[] = [
  { id: 'sst', symbol: 'SST', name: 'Sea Surface Temperature', source: 'GHRSST / MODIS', description: 'Thermal infrared and microwave skin temperature' },
  { id: 'sss', symbol: 'SSS', name: 'Sea Surface Salinity', source: 'SMAP / SMOS', description: 'Halosteric density and freshwater flux tracking' },
  { id: 'ssh', symbol: 'SSH / SLA', name: 'Sea Level Anomaly', source: 'Altimetry (SWOT/Jason)', description: 'Baroclinic steric expansion and thermocline slope' },
  { id: 'wind', symbol: 'WINDS', name: 'Scatterometer Vectors', source: 'ASCAT / ECMWF', description: 'Wind-stress curl driving Ekman pumping' },
  { id: 'curr', symbol: 'CURRENTS', name: 'Geostrophic Advection', source: 'OSCAR', description: 'Horizontal thermal flux transport' },
];

export const DescentNarrative: React.FC = () => {
  return (
    <div className="relative z-10 w-full">
      {/* ─────────────────────────────────────────────────────────────
          02 // 0m — THE SURFACE (Breaking the Waterline)
          ───────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen w-full flex items-center px-6 lg:px-20 py-24 relative"
        id="section-surface"
      >
        <div className="max-w-4xl space-y-6">
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
      </section>

      {/* ─────────────────────────────────────────────────────────────
          03 // 100m — THE PROBLEM (The Volumetric Ocean & Argo Sparsity)
          ───────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen w-full flex items-center px-6 lg:px-20 py-24 relative"
        id="section-problem"
      >
        <div className="max-w-5xl space-y-12">
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

          {/* Scientific Telemetry Counters */}
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
      </section>

      {/* ─────────────────────────────────────────────────────────────
          04 // 250m — THE GAP (The Observational Vacuum)
          ───────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen w-full flex items-center justify-end px-6 lg:px-24 py-24 relative text-right"
        id="section-gap"
      >
        <div className="max-w-2xl space-y-6">
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
      </section>

      {/* ─────────────────────────────────────────────────────────────
          05 // 500m — THE QUESTION (Dramatic Turning Point)
          ───────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen w-full flex items-center justify-center px-6 lg:px-12 py-24 relative text-center"
        id="section-question"
      >
        <div className="max-w-4xl space-y-8">
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
      </section>

      {/* ─────────────────────────────────────────────────────────────
          06 // 750m — MEET KYOGRE (Architecture Inscriptions)
          ───────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen w-full flex items-center px-6 lg:px-20 py-24 relative"
        id="section-kyogre"
      >
        <div className="max-w-5xl space-y-10">
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

          {/* Model Input Scientific Annotations */}
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
      </section>

      {/* ─────────────────────────────────────────────────────────────
          07 // 1000m — THE RECONSTRUCTION (The Visual Climax)
          ───────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative"
        id="section-reconstruction"
      >
        <div className="max-w-4xl space-y-6">
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
      </section>
    </div>
  );
};
