import React from 'react';
import { RoadmapPhase } from '../types';

const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    phase: 'PHASE 01 // TELEMETRY HARVESTING',
    title: 'COPERNICUS + INSAT-3D + ARGO',
    organization: 'INCOIS DATA HARVEST',
    description:
      'Automated ingestion pipeline gathering satellite radar swaths, radiometers, and in-situ ARGO profiles across the Indian Ocean basin.',
    status: 'prototype',
  },
  {
    phase: 'PHASE 02 // NEURAL CLOUD',
    title: 'KYOGRE INFERENCE RUNNER',
    organization: 'NEURAL STRATIFICATION',
    description:
      'Continuous 24-hour neural generation producing gridded 4D subsurface temperature datasets across sovereign territorial waters.',
    status: 'roadmap',
  },
  {
    phase: 'PHASE 03 // DISSEMINATION',
    title: 'INCOIS & MoES ADVISORIES',
    organization: 'OPERATIONAL INSTITUTION',
    description:
      'Exporting actionable feeds directly into cyclone warnings, naval operational tactical models, and commercial fisheries advisories.',
    status: 'planned',
  },
];

export const InstitutionalRoadmap: React.FC = () => {
  return (
    <section
      className="min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10"
      id="section-deployment"
    >
      <div className="max-w-5xl mx-auto w-full space-y-12">
        <div className="space-y-4">
          <div className="font-mono text-xs tracking-widest text-[#00f0ff]">
            INSTITUTIONAL ROADMAP
          </div>
          <h2 className="text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]">
            FROM PROTOTYPE TO OCEAN INTELLIGENCE INFRASTRUCTURE.
          </h2>
          <p className="text-base sm:text-lg text-[#94a9be] font-light leading-relaxed">
            Designed for frictionless integration into India's premier ocean science institutes (INCOIS, NIOT, and MoES).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-y border-white/10 py-10 font-mono text-xs">
          {ROADMAP_PHASES.map((phase) => (
            <div key={phase.phase} className="space-y-2.5 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-[#00f0ff]/30 transition-all">
              <div className="text-[#00dbe9] text-[10px]">{phase.phase}</div>
              <div className="text-[#dbfcff] font-bold text-sm tracking-tight">{phase.title}</div>
              <p className="text-[#94a9be] font-light text-[11px] leading-relaxed">
                {phase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
