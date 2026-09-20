import React, { useState } from 'react';

export const PrototypeShowcase: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <section
      className="min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10"
      id="section-prototype"
    >
      <div className="max-w-6xl mx-auto w-full space-y-12">
        <div className="space-y-4">
          <div className="font-mono text-xs tracking-widest text-[#00f0ff]">
            LIVE DEMO &amp; EVALUATION REPO
          </div>
          <h2 className="text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]">
            KYOGRE IS ALREADY TAKING SHAPE.
          </h2>
          <p className="text-base sm:text-lg text-[#94a9be] font-light max-w-2xl leading-relaxed">
            Tested on historical INCOIS and Copernicus data pipelines with live model inference benchmarks for SIH26066 evaluators.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Interactive Demo Frame / Video Placeholder */}
          <div className="lg:col-span-8 p-4 rounded-2xl bg-[#060d1a]/60 border border-[#00f0ff]/15 backdrop-blur-xl overflow-hidden relative group">
            <div
              className="aspect-video w-full rounded-xl bg-cover bg-center relative flex flex-col justify-between p-6 border border-white/10"
              style={{ backgroundImage: "url('assets/ocean-sunbeams.jpg')" }}
            >
              <div className="flex justify-between items-center text-xs font-mono text-white/90 z-10">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  DEMO REEL // SIH26066
                </span>
                <span className="text-[#00dbe9]">4K SPATIAL RECONSTRUCTION</span>
              </div>

              {/* Play Button Trigger */}
              <div className="flex items-center justify-center my-auto z-10">
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="w-20 h-20 rounded-full bg-[#00f0ff] text-[#02060d] flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-[0_0_30px_rgba(0,240,255,0.6)] cursor-pointer group"
                  aria-label="Watch Prototype Video"
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                </button>
              </div>

              <div className="flex justify-between items-center text-xs font-mono text-[#00dbe9] z-10">
                <span>[ VIDEO DEMO PLACEHOLDER ]</span>
                <span>TEAM NEUROTIDE · SIH26066</span>
              </div>
            </div>
          </div>

          {/* Specifications & Academic QR Code Area */}
          <div className="lg:col-span-4 space-y-6">
            {/* Inference Benchmarks */}
            <div className="space-y-4 font-mono text-xs">
              <div className="text-[#00f0ff] font-bold tracking-wider">[ INFERENCE BENCHMARKS ]</div>
              <div className="space-y-3 border-y border-white/10 py-4 text-[#94a9be]">
                <div className="flex justify-between">
                  <span>CELL LATENCY:</span> <span className="text-[#dbfcff] font-bold">&lt; 140ms</span>
                </div>
                <div className="flex justify-between">
                  <span>STRATA RESOLUTION:</span> <span className="text-[#dde2f3]">36 Depths</span>
                </div>
                <div className="flex justify-between">
                  <span>GRID SPACING:</span> <span className="text-[#dde2f3]">25km × 25km (0.25°)</span>
                </div>
                <div className="flex justify-between">
                  <span>INFERENCE CORE:</span> <span className="text-[#00dbe9]">PyTorch / ONNX</span>
                </div>
              </div>
            </div>

            {/* Dedicated QR Code & Evaluation Repo Placeholder */}
            <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex items-center gap-4">
              <div className="w-16 h-16 rounded bg-black/70 border border-[#00f0ff]/30 flex flex-col items-center justify-center font-mono text-[9px] text-center text-[#00dbe9] p-1 flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
                <span>[ QR CODE ]</span>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-['Space_Grotesk'] text-[#dbfcff] font-medium">
                  Evaluation Repo &amp; Notebooks
                </div>
                <div className="text-xs text-[#94a9be] font-light">
                  Direct benchmark code, checkpoints, and ERDDAP Argo sync for evaluators.
                </div>
              </div>
            </div>

            <a
              href="explore.html"
              className="w-full py-2.5 rounded-lg border border-[#00f0ff]/30 text-[#00dbe9] hover:bg-[#00f0ff]/10 text-xs font-mono tracking-wider text-center block transition-colors"
            >
              ENTER LIVE RUNTIME
            </a>
          </div>
        </div>
      </div>

      {/* Video Modal Placeholder */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="max-w-3xl w-full bg-[#060d1a] border border-[#00f0ff]/30 rounded-2xl p-6 space-y-4 shadow-[0_0_50px_rgba(0,240,255,0.2)]">
            <div className="flex justify-between items-center text-sm font-mono text-[#dbfcff]">
              <span>KYOGRE PROTOTYPE DEMO REEL</span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-[#94a9be] hover:text-white text-lg font-mono px-2"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video bg-black/90 rounded-xl border border-white/10 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#00f0ff]/20 text-[#00f0ff] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <p className="text-sm font-mono text-[#dbfcff]">
                DEMO VIDEO LINK PLACEHOLDER
              </p>
              <p className="text-xs text-[#94a9be] max-w-md">
                You can drop in your YouTube, Vimeo, or local MP4 link directly in `src/components/PrototypeShowcase.tsx`.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2 rounded-lg bg-[#00f0ff] text-[#02060d] font-mono text-xs font-bold"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
