import React, { useState, useEffect, useRef } from 'react';
import { ConsoleSettings } from '../types';

export const ResearchConsole: React.FC = () => {
  const gradientRef = useRef<HTMLDivElement | null>(null);
  const [gradientRevealed, setGradientRevealed] = useState(false);

  useEffect(() => {
    // Percentage threshold + IntersectionObserver trigger (Requirement D)
    if (typeof IntersectionObserver !== 'undefined' && gradientRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setGradientRevealed(true);
            }
          });
        },
        { threshold: 0.25 }
      );
      observer.observe(gradientRef.current);
      return () => observer.disconnect();
    } else {
      // Fallback: Percentage threshold of total page scroll
      const checkProgress = () => {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const maxScroll = Math.max(1, (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight);
        const p = scrollY / maxScroll;
        if (p >= 0.55) setGradientRevealed(true);
      };
      window.addEventListener('scroll', checkProgress, { passive: true });
      checkProgress();
      return () => window.removeEventListener('scroll', checkProgress);
    }
  }, []);

  const [settings, setSettings] = useState<ConsoleSettings>({
    selectedDepth: 150,
    showArgoFloats: true,
    showIsotherms: true,
    showEkmanVelocity: false,
    activeCell: {
      name: 'Bay of Bengal (Central)',
      coordinates: '14.25°N, 84.50°E',
      predictedTemp: 19.42,
      confidenceInterval: 0.28,
    },
  });

  // Calculate dynamic temperature based on slider depth
  const calculateTempAtDepth = (depth: number) => {
    // Standard North Indian Ocean thermocline profile
    if (depth <= 30) return (29.8 - depth * 0.05).toFixed(2);
    if (depth <= 200) return (28.3 - (depth - 30) * 0.075).toFixed(2);
    if (depth <= 500) return (15.5 - (depth - 200) * 0.022).toFixed(2);
    if (depth <= 1000) return (8.9 - (depth - 500) * 0.008).toFixed(2);
    return (4.9 - (depth - 1000) * 0.001).toFixed(2);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setSettings((prev) => ({
      ...prev,
      selectedDepth: val,
      activeCell: {
        ...prev.activeCell,
        predictedTemp: parseFloat(calculateTempAtDepth(val)),
      },
    }));
  };

  return (
    <section
      className="min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10"
      id="section-console"
    >
      <div className="max-w-6xl mx-auto w-full space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="font-mono text-xs tracking-widest text-[#00f0ff]">
              NATIONAL OCEANOGRAPHIC RESEARCH CONSOLE
            </div>
            <h2 className="text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]">
              THE OCEAN, MADE COMPUTABLE.
            </h2>
          </div>
          <div className="font-mono text-xs text-[#00dbe9] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>DOMAIN: NORTH INDIAN OCEAN [ACTIVE]</span>
          </div>
        </div>

        {/* High-Precision Glass Interface Frame */}
        <div className="p-6 lg:p-8 rounded-2xl bg-[#060d1a]/70 backdrop-blur-xl border border-[#00f0ff]/15 space-y-6 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
          {/* Metadata Top Bar */}
          <div className="flex flex-wrap justify-between items-center gap-4 text-xs font-mono border-b border-white/10 pb-4 text-[#48627e]">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[#dbfcff] font-bold">KYOGRE v2.4 OPERATIONAL RUN</span>
              <span>LAT: 05°N – 30°N</span>
              <span>LON: 45°E – 105°E</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[#00dbe9]">VALIDATED ARGO FLOATS: 41</span>
              <span className="text-[#00f0ff]">INFERENCE: &lt; 1.5ms (cached)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Controls */}
            <div className="lg:col-span-4 space-y-6">
              {/* Depth Slider */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#48627e]">VERTICAL DEPTH TRANSECT</span>
                  <span className="text-[#00f0ff] font-bold font-mono">
                    {settings.selectedDepth} m
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="25"
                  value={settings.selectedDepth}
                  onChange={handleSliderChange}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#48627e]">
                  <span>0m (SST)</span>
                  <span>250m</span>
                  <span>500m</span>
                  <span>1000m</span>
                </div>
              </div>

              {/* Telemetry Overlays Toggles */}
              <div className="space-y-2.5 text-xs font-mono">
                <div className="text-[#48627e] uppercase text-[10px] tracking-wider mb-2">
                  TELEMETRY OVERLAYS
                </div>

                <label className="flex items-center justify-between text-[#94a9be] cursor-pointer hover:text-white transition-colors">
                  <span>ARGO Float Vectors</span>
                  <input
                    type="checkbox"
                    checked={settings.showArgoFloats}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, showArgoFloats: e.target.checked }))
                    }
                    className="accent-[#00f0ff]"
                  />
                </label>

                <label className="flex items-center justify-between text-[#94a9be] cursor-pointer hover:text-white transition-colors">
                  <span>Isotherm Contours (Δ1°C)</span>
                  <input
                    type="checkbox"
                    checked={settings.showIsotherms}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, showIsotherms: e.target.checked }))
                    }
                    className="accent-[#00f0ff]"
                  />
                </label>

                <label className="flex items-center justify-between text-[#94a9be] cursor-pointer hover:text-white transition-colors">
                  <span>Ekman Pumping Velocity</span>
                  <input
                    type="checkbox"
                    checked={settings.showEkmanVelocity}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, showEkmanVelocity: e.target.checked }))
                    }
                    className="accent-[#00f0ff]"
                  />
                </label>
              </div>

              {/* Active Cell Card */}
              <div className="p-3.5 rounded-lg bg-black/50 border border-white/5 space-y-1.5 font-mono text-xs">
                <div className="text-[#48627e] text-[10px]">SELECTED CELL ({settings.activeCell.name})</div>
                <div className="flex justify-between text-[#dde2f3]">
                  <span>COORDINATE:</span> <span>{settings.activeCell.coordinates}</span>
                </div>
                <div className="flex justify-between text-[#dbfcff]">
                  <span>T(z) PREDICTION:</span>{' '}
                  <span className="font-bold text-[#00f0ff]">
                    {settings.activeCell.predictedTemp} °C
                  </span>
                </div>
                <div className="flex justify-between text-[#48627e]">
                  <span>CONFIDENCE:</span> <span>± {settings.activeCell.confidenceInterval} °C</span>
                </div>
              </div>

              {/* Launch CTA */}
              <a
                href="explore.html"
                className="w-full py-3 rounded-xl bg-[#00f0ff] text-[#02060d] font-['Space_Grotesk'] font-bold text-xs tracking-wider uppercase text-center block shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:shadow-[0_0_30px_rgba(0,240,255,0.7)] transition-all"
              >
                Launch Interactive 3D Explorer
              </a>
            </div>

            {/* Right: Visual Transect Slice */}
            <div
              className="lg:col-span-8 h-72 lg:h-96 rounded-xl relative overflow-hidden flex flex-col justify-between p-6 bg-cover bg-center border border-white/10"
              style={{
                backgroundImage: "url('assets/ocean-abyss.jpg')",
              }}
            >
              <div className="flex justify-between items-center text-xs font-mono text-[#dbfcff] z-10">
                <span className="px-2.5 py-1 rounded bg-black/70 backdrop-blur-sm border border-white/10">
                  3D SUB-SURFACE THERMAL VOLUME
                </span>
                <span className="text-[#00dbe9] text-[11px]">TRANSECT: 14°N LATITUDE</span>
              </div>

              {/* Depth indicator line inside visualization */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-[#00f0ff] transition-all duration-300 z-10 pointer-events-none"
                style={{ top: `${Math.min(92, Math.max(8, (settings.selectedDepth / 1000) * 85 + 8))}%` }}
              >
                <span className="absolute right-4 -top-5 font-mono text-[10px] text-[#00f0ff] bg-black/80 px-2 py-0.5 rounded border border-[#00f0ff]/40">
                  z = {settings.selectedDepth}m ({settings.activeCell.predictedTemp}°C)
                </span>
              </div>

              {/* Thermal Scale Strip with Percentage & Observer Reveal */}
              <div
                ref={gradientRef}
                className="z-10 bg-black/80 backdrop-blur-md p-3 rounded-lg flex items-center justify-between text-xs font-mono border border-white/10 transition-all duration-700 ease-out"
                style={{
                  opacity: gradientRevealed ? 1 : 0.25,
                  transform: gradientRevealed ? 'scaleX(1)' : 'scaleX(0.92)',
                  boxShadow: gradientRevealed ? '0 0 25px rgba(0, 240, 255, 0.25)' : 'none',
                }}
              >
                <span className="text-[#48627e]">4°C (Abyss)</span>
                <div className="flex-1 mx-4 h-2.5 rounded bg-gradient-to-r from-blue-900 via-[#00f0ff] via-amber-400 to-red-500 overflow-hidden relative">
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000"
                    style={{
                      transform: gradientRevealed ? 'translateX(100%)' : 'translateX(-100%)',
                    }}
                  />
                </div>
                <span className="text-[#dbfcff]">31°C (Surface)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
