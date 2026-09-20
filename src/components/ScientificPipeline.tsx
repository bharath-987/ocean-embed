import React, { useState, useEffect, useRef } from 'react';
import { PipelineStage, ValidationMetric } from '../types';

const PIPELINE_STAGES: PipelineStage[] = [
  { step: '01', title: 'SURFACE TELEMETRY', subtitle: 'INGESTION', details: 'SST, SSS, SSH, ASCAT Winds', status: 'ingested' },
  { step: '02', title: 'PREPROCESSING', subtitle: 'ALIGNMENT', details: 'Spatial Gaussian & Grid Inpainting', status: 'preprocessed' },
  { step: '03', title: 'CNN-LSTM CORE', subtitle: 'ENGINE', details: 'Spatio-Temporal Feature Learning', status: 'inferred' },
  { step: '04', title: '3D RECONSTRUCTION', subtitle: 'SYNTHESIS', details: '0 - 1000m Stratified Profiles', status: 'inferred' },
  { step: '05', title: 'ARGO VALIDATION', subtitle: 'BENCHMARK', details: 'Independent In-Situ Matchup', status: 'validated' },
  { step: '06', title: 'OCEAN INTELLIGENCE', subtitle: 'OUTPUT', details: 'OHC₃₀₀, D20, MLD, Thermal Feeds', status: 'active' },
];

const VALIDATION_METRICS: ValidationMetric[] = [
  {
    label: 'ROOT MEAN SQUARE ERROR',
    value: '1.00',
    unit: '°C',
    description: 'Raw RMSE across 1,809 profiles and 24,185 depth points (0.90°C with depth correction vs GLORYS 0.95°C).',
    isPlaceholder: false,
  },
  {
    label: 'CLIMATOLOGY SKILL SCORE',
    value: '+41.4',
    unit: '%',
    description: 'Raw skill improvement over 14-year climatology baseline (+52.6% with Argo depth correction).',
    isPlaceholder: false,
  },
  {
    label: 'CORRELATION COEFFICIENT',
    value: '0.988',
    unit: '',
    description: 'Pearson profile correlation across 24,185 in-situ Argo matchup observations.',
    isPlaceholder: false,
  },
];

export const ScientificPipeline: React.FC = () => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    // Percentage threshold + IntersectionObserver trigger (Requirement D)
    if (typeof IntersectionObserver !== 'undefined' && sectionRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsRevealed(true);
            }
          });
        },
        { threshold: 0.15 }
      );
      observer.observe(sectionRef.current);
      return () => observer.disconnect();
    } else {
      // Fallback: Percentage threshold of total page scroll progress
      const checkProgress = () => {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const maxScroll = Math.max(1, (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight);
        const p = scrollY / maxScroll;
        if (p >= 0.65) setIsRevealed(true);
      };
      window.addEventListener('scroll', checkProgress, { passive: true });
      checkProgress();
      return () => window.removeEventListener('scroll', checkProgress);
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10"
      id="section-validation"
    >
      <div className="max-w-6xl mx-auto w-full space-y-16">
        <div
          className="space-y-4 transition-all duration-700 ease-out"
          style={{
            opacity: isRevealed ? 1 : 0,
            transform: isRevealed ? 'translateY(0px)' : 'translateY(24px)',
          }}
        >
          <div className="font-mono text-xs tracking-widest text-[#00f0ff]">
            SCIENTIFIC BENCHMARK &amp; ARCHITECTURAL FLOW
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]">
            A RECONSTRUCTION IS ONLY AS VALUABLE AS ITS VALIDATION.
          </h2>
        </div>

        {/* Linear Pipeline Chain */}
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 text-xs font-mono border-y border-white/10 py-8 transition-all duration-700 ease-out"
          style={{
            opacity: isRevealed ? 1 : 0,
            transform: isRevealed ? 'translateY(0px)' : 'translateY(20px)',
          }}
        >
          {PIPELINE_STAGES.map((stage, idx) => (
            <div
              key={stage.step}
              className="space-y-1.5 group transition-all duration-500 ease-out"
              style={{
                transitionDelay: `${idx * 75}ms`,
                opacity: isRevealed ? 1 : 0,
                transform: isRevealed ? 'translateY(0px)' : 'translateY(12px)',
              }}
            >
              <div className="text-[#00dbe9] text-[10px] tracking-wider font-semibold">
                {stage.step} // {stage.subtitle}
              </div>
              <div className="text-[#dbfcff] font-bold text-sm tracking-tight group-hover:text-[#00f0ff] transition-colors">
                {stage.title}
              </div>
              <div className="text-[#48627e] text-[11px] font-light leading-relaxed">
                {stage.details}
              </div>
            </div>
          ))}
        </div>

        {/* Independent Validation Metrics (Placeholders as specified) */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-4 transition-all duration-700 ease-out"
          style={{
            opacity: isRevealed ? 1 : 0,
            transform: isRevealed ? 'translateY(0px)' : 'translateY(20px)',
            transitionDelay: '300ms',
          }}
        >
          {VALIDATION_METRICS.map((metric) => (
            <div key={metric.label} className="space-y-2 p-5 rounded-xl bg-[#060d1a]/50 border border-white/5 backdrop-blur-sm hover:border-[#00f0ff]/20 transition-all">
              <div className="text-[#48627e] text-xs font-mono tracking-wider uppercase flex items-center justify-between">
                <span>{metric.label}</span>
                {metric.isPlaceholder && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#00dbe9] border border-white/10">
                    BENCHMARK
                  </span>
                )}
              </div>
              <div className="text-4xl sm:text-5xl font-['Space_Grotesk'] font-bold text-[#dbfcff] font-mono flex items-baseline gap-1">
                <span>{metric.value}</span>
                <span className="text-xl font-normal text-[#00f0ff]">{metric.unit}</span>
              </div>
              <div className="text-xs text-[#94a9be] font-light leading-relaxed">
                {metric.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
