import React from 'react';
import { ApplicationCard } from '../types';

const APPLICATIONS: ApplicationCard[] = [
  {
    id: 'cyclones',
    code: '01 // CYCLONES & RAPID INTENSIFICATION',
    title: 'Tropical Cyclone Heat Potential (TCHP)',
    parameter: 'TCHP & D26 Thermal Reservoirs',
    description:
      'A storm passing over a shallow thermocline cools the sea surface and self-arrests. Over a deep, unseen warm pocket, it deepens by two categories overnight. If TCHP is underestimated, coastal evacuation warnings are issued 12 hours too late.',
  },
  {
    id: 'fisheries',
    code: '02 // PELAGIC FISHERIES INTELLIGENCE',
    title: 'Thermocline Shoaling & Potential Fishing Zones',
    parameter: 'Upwelling Fronts & Biological Boundaries',
    description:
      'Pelagic schools follow sharp thermal boundaries where nutrient upwelling concentrates biomass. Relying only on surface chlorophyll sends artisan fleets on 40-nautical-mile blind searches; subsurface thermocline depth pinpoints active feeding fronts directly.',
  },
  {
    id: 'robotics',
    code: '03 // AUTONOMOUS UNDERWATER VEHICLES & GLIDERS',
    title: 'Density Stratification & Buoyancy Trim',
    parameter: 'Thermocline Gradient & Vertical Density Structure',
    description:
      'Long-endurance ocean gliders and autonomous vehicles rely on variable buoyancy engines calibrated against ambient seawater density. Accurate subsurface temperature reconstruction prevents ballast exhaustion and optimizes dive glideslope efficiency across dynamic frontal zones.',
  },
  {
    id: 'assimilation',
    code: '04 // NUMERICAL MODEL INITIALIZATION',
    title: 'Operational Ocean Forecasting Initial States',
    parameter: 'Continuous 3D State Vector for ROMS/HYCOM',
    description:
      'Circulation models suffer severe forecast drift during the first 72 hours when initialized with cold, smoothed monthly climatologies. Assimilating daily reconstructed 3D temperature fields constrains baroclinic instability before errors compound basin-wide.',
  },
  {
    id: 'science',
    code: '05 // CLIMATE DYNAMICS & MONSOON PREDICTION',
    title: 'Internal Wave & Dipole Dynamics (IOD / MJO)',
    parameter: 'Thermocline Slope across Equatorial Waveguides',
    description:
      'Equatorial Kelvin and Rossby waves tilt the thermocline across the basin weeks before Indian Ocean Dipole anomalies flip the monsoon. Missing the subsurface thermal displacement blinds seasonal rainfall models to imminent drought or unseasonal deluge.',
  },
];

export const ApplicationsGrid: React.FC = () => {
  return (
    <section
      className="min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10"
      id="section-applications"
    >
      <div className="max-w-6xl mx-auto w-full space-y-12">
        <div className="space-y-4">
          <div className="font-mono text-xs tracking-widest text-[#00f0ff]">
            NATIONAL OCEAN APPLICATIONS
          </div>
          <h2 className="text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]">
            A BETTER VIEW OF THE OCEAN BELOW THE SURFACE.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">
          {APPLICATIONS.map((app, idx) => (
            <div
              key={app.id}
              className={`space-y-2 border-t border-white/10 pt-4 group hover:border-[#00f0ff]/40 transition-colors ${
                idx === 4 ? 'sm:col-span-2 lg:col-span-2' : ''
              }`}
            >
              <div className="text-[#00f0ff] font-mono text-xs uppercase tracking-wider">
                {app.code}
              </div>
              <div className="text-lg font-['Space_Grotesk'] font-medium text-[#dbfcff] group-hover:text-[#00dbe9] transition-colors">
                {app.title}
              </div>
              <p className="text-xs text-[#94a9be] font-light leading-relaxed">
                {app.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
