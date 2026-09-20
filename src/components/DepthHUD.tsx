import React from 'react';
import { TelemetryState } from '../types';

interface DepthHUDProps {
  telemetry: TelemetryState;
  onSelectDepthMarker?: (sectionId: string) => void;
}

export const DepthHUD: React.FC<DepthHUDProps> = ({ telemetry, onSelectDepthMarker }) => {
  const pipPercent = Math.min(telemetry.progress * 96, 96);

  const handleMarkerClick = (sectionId: string) => {
    if (onSelectDepthMarker) {
      onSelectDepthMarker(sectionId);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <aside className="fixed right-5 sm:right-8 lg:right-10 top-1/2 -translate-y-1/2 z-40 flex flex-col items-end pointer-events-none select-none">
      {/* Vertical Depth Scale Ruler */}
      <div className="relative h-64 w-10 flex flex-col items-end justify-between py-1 border-r border-white/10 font-mono text-[10px] text-[#48627e]">
        {/* Active Depth Tracker Pip */}
        <div
          className="absolute right-[-3px] w-1.5 h-3.5 bg-[#00f0ff] rounded-sm shadow-[0_0_12px_#00f0ff] transition-all duration-100 ease-out"
          style={{ top: `${pipPercent}%` }}
        />

        <button
          type="button"
          className={`pr-2.5 cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right ${telemetry.depth < 30 ? 'text-[#00f0ff] font-bold' : ''}`}
          onClick={() => handleMarkerClick('hero')}
        >
          AIR
        </button>
        <button
          type="button"
          className={`pr-2.5 cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right ${telemetry.depth >= 30 && telemetry.depth < 80 ? 'text-[#00f0ff] font-bold' : ''}`}
          onClick={() => handleMarkerClick('section-surface')}
        >
          0m
        </button>
        <button
          type="button"
          className={`pr-2.5 cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right ${telemetry.depth >= 80 && telemetry.depth < 200 ? 'text-[#00f0ff] font-bold' : ''}`}
          onClick={() => handleMarkerClick('section-problem')}
        >
          100m
        </button>
        <button
          type="button"
          className={`pr-2.5 cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right ${telemetry.depth >= 200 && telemetry.depth < 400 ? 'text-[#00f0ff] font-bold' : ''}`}
          onClick={() => handleMarkerClick('section-gap')}
        >
          250m
        </button>
        <button
          type="button"
          className={`pr-2.5 cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right ${telemetry.depth >= 400 && telemetry.depth < 650 ? 'text-[#00f0ff] font-bold' : ''}`}
          onClick={() => handleMarkerClick('section-question')}
        >
          500m
        </button>
        <button
          type="button"
          className={`pr-2.5 cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right ${telemetry.depth >= 650 && telemetry.depth < 900 ? 'text-[#00f0ff] font-bold' : ''}`}
          onClick={() => handleMarkerClick('section-kyogre')}
        >
          750m
        </button>
        <button
          type="button"
          className={`pr-2.5 cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right font-bold ${telemetry.depth >= 900 ? 'text-[#00f0ff] shadow-[0_0_8px_#00f0ff]' : ''}`}
          onClick={() => handleMarkerClick('section-reconstruction')}
        >
          1000m
        </button>
      </div>
    </aside>
  );
};
