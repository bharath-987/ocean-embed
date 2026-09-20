import React, { useEffect, useRef, useState } from 'react';
import { TelemetryState } from '../types';

interface OceanStageProps {
  telemetry: TelemetryState;
}

export const OceanStage: React.FC<OceanStageProps> = ({ telemetry }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [videoReady, setVideoReady] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);

  const isSeekingRef = useRef<boolean>(false);
  const targetTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);

  const p = telemetry.progress; // 0.0 to 1.0 across the continuous 700vh descent track

  // ─────────────────────────────────────────────────────────────
  // 1. VIDEO INITIALIZATION & METADATA BINDING
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
        setVideoReady(true);
        setVideoError(false);
        // Position at initial progress
        targetTimeRef.current = p * video.duration;
        video.currentTime = targetTimeRef.current;
      }
    };

    const onCanPlay = () => {
      setVideoReady(true);
      setVideoError(false);
    };

    const onError = () => {
      // If none of the video sources could be loaded
      if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
        setVideoError(true);
        setVideoReady(false);
      }
    };

    const onSeeked = () => {
      isSeekingRef.current = false;
      // If user continued scrolling while video was decoding, immediately seek to latest target
      const target = targetTimeRef.current;
      if (video && Math.abs(video.currentTime - target) > 0.02) {
        dispatchSeek(video, target);
      }
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.addEventListener('seeked', onSeeked);

    video.load();

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeEventListener('seeked', onSeeked);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 2. ULTRA-SMOOTH HARDWARE-ACCELERATED VIDEO SCRUBBING
  // ─────────────────────────────────────────────────────────────
  const dispatchSeek = (video: HTMLVideoElement, targetTime: number) => {
    if (isSeekingRef.current) return;
    isSeekingRef.current = true;

    // Use fastSeek if supported for instantaneous hardware keyframe seeking
    if ('fastSeek' in video && typeof (video as any).fastSeek === 'function') {
      try {
        (video as any).fastSeek(targetTime);
        return;
      } catch {
        // Fallback to standard currentTime
      }
    }
    video.currentTime = targetTime;
  };

  useEffect(() => {
    const video = videoRef.current;
    const dur = duration || (video ? video.duration : 0);
    if (!video || !dur || isNaN(dur)) return;

    const target = Math.max(0, Math.min(dur, p * dur));
    targetTimeRef.current = target;

    if (!isSeekingRef.current) {
      if (Math.abs(video.currentTime - target) > 0.015) {
        dispatchSeek(video, target);
      }
    }
  }, [p, duration]);

  // ─────────────────────────────────────────────────────────────
  // 3. 750M - 1000M SCIENTIFIC DIGITAL TWIN EMERGENCE
  // Subsurface temperature isotherms and bathymetric calculation grid
  // emerge organically directly from the deep ocean footage
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    let time = 0;

    const render = () => {
      time += 0.016;
      ctx.clearRect(0, 0, width, height);

      // The digital twin thermal field emerges only at the climax (750m - 1000m, p >= 0.80)
      if (p >= 0.80) {
        const meshAlpha = Math.min(1, (p - 0.80) / 0.16) * 0.26;
        ctx.save();
        ctx.strokeStyle = `rgba(0, 240, 255, ${meshAlpha})`;
        ctx.lineWidth = 0.5;

        // Subtle Cartesian Bathymetric Grid
        const step = 80;
        for (let x = 0; x < width; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Stratified Temperature Isotherm Paths (T20, T15, T10 layers)
        ctx.strokeStyle = `rgba(0, 219, 233, ${meshAlpha * 1.8})`;
        ctx.lineWidth = 1.0;
        ctx.setLineDash([6, 8]);
        for (let i = 1; i <= 3; i++) {
          const cy = height * (0.35 + i * 0.16);
          ctx.beginPath();
          ctx.moveTo(0, cy);
          for (let x = 0; x <= width; x += 25) {
            const waveY = Math.sin(x * 0.0035 + time * 0.5 + i) * 16;
            ctx.lineTo(x, cy + waveY);
          }
          ctx.stroke();
        }

        // Coordinate Intersection Nodes
        ctx.fillStyle = `rgba(0, 240, 255, ${meshAlpha * 2.2})`;
        for (let x = step; x < width; x += step * 2) {
          for (let y = step; y < height; y += step * 2) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [p]);

  const currentSeconds = duration ? (p * duration).toFixed(2) : (p * 15).toFixed(2);
  const totalSeconds = duration ? duration.toFixed(2) : '15.00';
  const calculatedDepth = Math.round(p * 1000);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-[#02060d]">
      {/* ─────────────────────────────────────────────────────────────
          1. THE CANONICAL CINEMATIC VIDEO (HERO ENGINE)
          100vw × 100vh, object-fit: cover, scrubbed 1:1 via scroll
          ───────────────────────────────────────────────────────────── */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300"
        playsInline
        muted
        preload="auto"
        style={{
          opacity: videoReady ? 1 : 0,
          objectPosition: 'center center',
        }}
      >
        <source src="/public/media/kyogre-ocean-dive.mp4" type="video/mp4" />
        <source src="public/media/kyogre-ocean-dive.mp4" type="video/mp4" />
        <source src="media/kyogre-ocean-dive.mp4" type="video/mp4" />
      </video>

      {/* Subtle atmospheric vignette for text legibility (preserves real video colors) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#02060d]/60 pointer-events-none" />

      {/* ─────────────────────────────────────────────────────────────
          2. MISSING VIDEO ASSET CALIBRATION HUD
          Displayed strictly when canonical footage is absent or loading
          ───────────────────────────────────────────────────────────── */}
      {videoError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#02060d]/95 z-20 pointer-events-auto">
          <div className="max-w-xl mx-auto space-y-5 p-7 rounded-2xl border border-[#00f0ff]/30 bg-black/60 backdrop-blur-xl shadow-[0_0_50px_rgba(0,240,255,0.15)]">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono text-[#00f0ff] bg-[#00f0ff]/10 border border-[#00f0ff]/30">
              <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping" />
              <span>VIDEO ENGINE ACTIVE // AWAITING FOOTAGE</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-['Space_Grotesk'] text-[#dbfcff] font-semibold tracking-tight">
              CANONICAL VIDEO FILE REQUIRED
            </h3>

            <p className="text-xs sm:text-sm text-[#94a9be] font-light leading-relaxed">
              The Kyogre cinematic dive is strictly <strong className="text-[#00f0ff]">video-first and video-only</strong>. All artificial image crossfades and wave simulations have been removed.
            </p>

            <div className="p-3.5 rounded-lg bg-black/70 border border-white/10 font-mono text-xs text-left space-y-1 text-[#dbfcff]">
              <div className="text-[#00dbe9] font-bold">EXPECTED ASSET PATH:</div>
              <div className="text-white break-all">/public/media/kyogre-ocean-dive.mp4</div>
              <div className="text-[#48627e] pt-1">
                Spec: 4K/1440p MP4 · 24-30fps · Continuous dive: Aerial Sky → Surface Breach → Underwater Caustics → Abyss (1000m)
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs font-mono text-[#48627e] border-t border-white/10">
              <span>LIVE SCRUB: {currentSeconds}s / {totalSeconds}s</span>
              <span className="text-[#00f0ff]">DEPTH: {calculatedDepth}m</span>
              <span>PROGRESS: {(p * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. SCIENTIFIC RECONSTRUCTION LAYER (750M - 1000M)
          Materializes directly out of the deep ocean footage
          ───────────────────────────────────────────────────────────── */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
    </div>
  );
};
