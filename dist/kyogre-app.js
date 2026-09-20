var require = function(m) { if (m==='react') return window.React; if (m==='react-dom/client'||m==='react-dom') return window.ReactDOM; throw new Error('Cannot find module ' + m); };
var KyogreApp = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/index.tsx
  var import_react10 = __toESM(__require("react"));
  var import_client = __toESM(__require("react-dom/client"));

  // src/App.tsx
  var import_react9 = __toESM(__require("react"));

  // src/components/Navigation.tsx
  var import_react = __toESM(__require("react"));
  var Navigation = ({ onNavigate }) => {
    const labelRef = (0, import_react.useRef)(null);
    (0, import_react.useEffect)(() => {
      const updateState = () => {
        if (!labelRef.current) return;
        const scrollY = window.scrollY;
        const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
        const pFull = totalScroll > 0 ? Math.max(0, Math.min(1, scrollY / totalScroll)) : 0;
        const fadeStart = 0.04;
        const fadeEnd = 0.1;
        let t = 0;
        if (pFull <= fadeStart) {
          t = 0;
        } else if (pFull >= fadeEnd) {
          t = 1;
        } else {
          const raw = (pFull - fadeStart) / (fadeEnd - fadeStart);
          t = raw * raw * (3 - 2 * raw);
        }
        const opacity = t;
        const scale = 0.92 + t * 0.08;
        const blur = (1 - t) * 4;
        labelRef.current.style.opacity = `${opacity}`;
        labelRef.current.style.transform = `scale(${scale})`;
        labelRef.current.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : "none";
      };
      updateState();
      window.addEventListener("scroll", updateState, { passive: true });
      return () => window.removeEventListener("scroll", updateState);
    }, []);
    const handleClick = (e) => {
      e.preventDefault();
      if (onNavigate) {
        onNavigate("hero");
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    return /* @__PURE__ */ import_react.default.createElement("div", { className: "fixed top-7 left-6 sm:left-10 z-50 pointer-events-auto select-none" }, /* @__PURE__ */ import_react.default.createElement(
      "a",
      {
        ref: labelRef,
        href: "#hero",
        onClick: handleClick,
        className: "text-sm sm:text-base font-['Space_Grotesk'] font-medium tracking-[0.26em] text-[#dde2f3]/90 hover:text-white uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]",
        style: {
          opacity: 0,
          transform: "scale(0.92)",
          filter: "blur(4px)",
          transition: "opacity 350ms ease, transform 350ms ease, filter 350ms ease",
          transformOrigin: "left center"
        }
      },
      "KYOGRE"
    ));
  };

  // src/components/CinematicVideoDive.tsx
  var import_react2 = __toESM(__require("react"));
  var SATELLITE_INPUTS = [
    { id: "sst", symbol: "SST", name: "Sea Surface Temperature", source: "GHRSST / MODIS", description: "Thermal infrared and microwave skin temperature" },
    { id: "sss", symbol: "SSS", name: "Sea Surface Salinity", source: "SMAP / SMOS", description: "Halosteric density and freshwater flux tracking" },
    { id: "ssh", symbol: "SSH / SLA", name: "Sea Level Anomaly", source: "Altimetry (SWOT/Jason)", description: "Baroclinic steric expansion and thermocline slope" },
    { id: "wind", symbol: "SURFACE WINDS", name: "Scatterometer Vectors", source: "ASCAT / ECMWF", description: "Wind-stress curl driving Ekman pumping" },
    { id: "curr", symbol: "SURFACE CURRENTS", name: "Geostrophic Advection", source: "OSCAR", description: "Horizontal thermal flux transport" }
  ];
  var DEPTH_MILESTONES = [
    { id: "hero", label: "AIR", depth: 0, targetP: 0 },
    { id: "section-surface", label: "0m", depth: 0, targetP: 0.15 },
    { id: "section-problem", label: "100m", depth: 100, targetP: 0.27 },
    { id: "section-gap", label: "250m", depth: 250, targetP: 0.39 },
    { id: "section-question", label: "500m", depth: 500, targetP: 0.51 },
    { id: "section-kyogre", label: "750m", depth: 750, targetP: 0.64 },
    { id: "section-reconstruction", label: "1000m", depth: 1e3, targetP: 0.85 }
  ];
  function computePhaseMetrics(p, start, enterPeak, exitStart, end) {
    if (p < start || p > end) {
      return { opacity: 0, y: 20, blur: 6, pointer: "none" };
    }
    let factor = 0;
    let isExiting = false;
    if (p < enterPeak) {
      factor = (p - start) / (enterPeak - start);
    } else if (p <= exitStart) {
      factor = 1;
    } else {
      factor = (end - p) / (end - exitStart);
      isExiting = true;
    }
    const clamped = Math.max(0, Math.min(1, factor));
    const smooth = clamped * clamped * (3 - 2 * clamped);
    const opacity = smooth;
    const y = isExiting ? (1 - smooth) * -20 : (1 - smooth) * 20;
    const blur = (1 - smooth) * 6;
    const pointer = opacity > 0.4 ? "auto" : "none";
    return { opacity, y, blur, pointer };
  }
  function calcTempAtDepth(depth) {
    if (depth <= 0) return "29.8";
    if (depth <= 30) return (29.8 - depth * 0.05).toFixed(1);
    if (depth <= 200) return (28.3 - (depth - 30) * 0.075).toFixed(1);
    if (depth <= 500) return (15.5 - (depth - 200) * 0.022).toFixed(1);
    if (depth <= 1e3) return (8.9 - (depth - 500) * 8e-3).toFixed(1);
    return "4.9";
  }
  var CinematicVideoDive = ({
    onExplore,
    onViewPrototype,
    onScrollDown,
    onSelectDepth
  }) => {
    const containerRef = (0, import_react2.useRef)(null);
    const videoRef = (0, import_react2.useRef)(null);
    const canvasRef = (0, import_react2.useRef)(null);
    const heroRef = (0, import_react2.useRef)(null);
    const scrollPromptRef = (0, import_react2.useRef)(null);
    const phase1Ref = (0, import_react2.useRef)(null);
    const phase2Ref = (0, import_react2.useRef)(null);
    const phase3Ref = (0, import_react2.useRef)(null);
    const phase4Ref = (0, import_react2.useRef)(null);
    const phase5Ref = (0, import_react2.useRef)(null);
    const phase6Ref = (0, import_react2.useRef)(null);
    const depthReadoutRef = (0, import_react2.useRef)(null);
    const depthPipRef = (0, import_react2.useRef)(null);
    const depthButtonsRef = (0, import_react2.useRef)([]);
    const isSeekingRef = (0, import_react2.useRef)(false);
    const targetTimeRef = (0, import_react2.useRef)(0);
    const progressRef = (0, import_react2.useRef)(0);
    const durationRef = (0, import_react2.useRef)(23.85);
    const seekTimeoutRef = (0, import_react2.useRef)(null);
    const blackOverlayRef = (0, import_react2.useRef)(null);
    const progressBarRef = (0, import_react2.useRef)(null);
    const depthTempRef = (0, import_react2.useRef)(null);
    const [videoLoaded, setVideoLoaded] = (0, import_react2.useState)(false);
    const [reducedMotion, setReducedMotion] = (0, import_react2.useState)(false);
    (0, import_react2.useEffect)(() => {
      let rafId;
      const tickLerp = () => {
        const video = videoRef.current;
        if (video && !reducedMotion && video.readyState >= 1) {
          const current = video.currentTime;
          const target = targetTimeRef.current;
          const diff = target - current;
          if (Math.abs(diff) > 2e-3) {
            const next = current + diff * 0.15;
            const dur = durationRef.current || video.duration || 23.85;
            const clamped = Math.max(0, Math.min(dur - 0.05, next));
            if (!isSeekingRef.current) {
              isSeekingRef.current = true;
              video.currentTime = clamped;
              if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
              seekTimeoutRef.current = setTimeout(() => {
                isSeekingRef.current = false;
              }, 35);
            }
          }
        }
        rafId = requestAnimationFrame(tickLerp);
      };
      rafId = requestAnimationFrame(tickLerp);
      return () => {
        cancelAnimationFrame(rafId);
        if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      };
    }, [reducedMotion]);
    const dispatchSeek = (video, time) => {
      if (!video || isNaN(time)) return;
      const dur = durationRef.current || video.duration || 23.85;
      const clamped = Math.max(0, Math.min(dur - 0.05, time));
      targetTimeRef.current = clamped;
      if (false) {
        try {
          video.fastSeek(clamped);
          return;
        } catch {
        }
      }
      video.currentTime = clamped;
    };
    (0, import_react2.useEffect)(() => {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mql.matches);
      const onMotionChange = (e) => setReducedMotion(e.matches);
      mql.addEventListener("change", onMotionChange);
      const video = videoRef.current;
      if (!video) return;
      const handleLoadedMetadata = () => {
        if (video.duration && !isNaN(video.duration) && video.duration > 0) {
          durationRef.current = video.duration;
        }
        setVideoLoaded(true);
        const pFull = computeFullPageProgress();
        const initialTime = pFull * durationRef.current;
        targetTimeRef.current = initialTime;
        dispatchSeek(video, initialTime);
      };
      const handleCanPlay = () => {
        setVideoLoaded(true);
      };
      const handleSeeked = () => {
        isSeekingRef.current = false;
        if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      };
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("seeked", handleSeeked);
      if (video.readyState >= 1) {
        handleLoadedMetadata();
      } else {
        video.load();
      }
      return () => {
        if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
        mql.removeEventListener("change", onMotionChange);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("seeked", handleSeeked);
      };
    }, []);
    const computeFullPageProgress = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const maxScroll = Math.max(1, docHeight - window.innerHeight);
      return Math.max(0, Math.min(1, scrollY / maxScroll));
    };
    (0, import_react2.useEffect)(() => {
      const video = videoRef.current;
      let st = null;
      const applyProgress = (pTrack) => {
        progressRef.current = pTrack;
        if (blackOverlayRef.current) {
          blackOverlayRef.current.style.opacity = "0";
        }
        let currentDepth = 0;
        if (pTrack <= 0.02) {
          currentDepth = 0;
        } else if (pTrack >= 0.98) {
          currentDepth = 1e3;
        } else {
          currentDepth = Math.round(pTrack * 1e3);
        }
        if (depthReadoutRef.current) {
          depthReadoutRef.current.textContent = pTrack <= 0.02 ? "AIR" : `${currentDepth}m`;
        }
        if (depthPipRef.current) {
          depthPipRef.current.style.top = `${Math.min(pTrack * 96, 96)}%`;
        }
        if (depthTempRef.current) {
          if (pTrack <= 0.02) {
            depthTempRef.current.textContent = "";
          } else {
            depthTempRef.current.textContent = `\u2248 ${calcTempAtDepth(currentDepth)}\xB0C`;
          }
        }
        const hudEl = depthReadoutRef.current?.closest("aside");
        if (hudEl) {
          const hudOpacity = pTrack >= 0.95 ? Math.max(0, 1 - (pTrack - 0.95) / 0.05) : 1;
          hudEl.style.opacity = `${hudOpacity}`;
          hudEl.style.pointerEvents = hudOpacity > 0.3 ? "auto" : "none";
        }
        depthButtonsRef.current.forEach((btn, idx) => {
          if (!btn) return;
          const milestone = DEPTH_MILESTONES[idx];
          const nextMilestone = DEPTH_MILESTONES[idx + 1];
          const isActive = nextMilestone ? currentDepth >= milestone.depth && currentDepth < nextMilestone.depth : currentDepth >= milestone.depth;
          if (isActive) {
            btn.classList.add("text-[#00f0ff]", "font-bold");
            btn.classList.remove("text-white/70");
          } else {
            btn.classList.remove("text-[#00f0ff]", "font-bold");
            btn.classList.add("text-white/70");
          }
        });
        if (heroRef.current) {
          let heroOpacity = 1;
          let heroY = 0;
          let heroBlur = 0;
          if (pTrack <= 0.04) {
            heroOpacity = 1;
            heroY = -pTrack * 20;
            heroBlur = 0;
          } else if (pTrack < 0.1) {
            const factor = (pTrack - 0.04) / 0.06;
            const smooth = factor * factor * (3 - 2 * factor);
            heroOpacity = Math.max(0, 1 - smooth);
            heroY = -20 - smooth * 45;
            heroBlur = smooth * 5;
          } else {
            heroOpacity = 0;
            heroY = -65;
            heroBlur = 5;
          }
          heroRef.current.style.opacity = `${heroOpacity}`;
          heroRef.current.style.transform = `translateY(${heroY}px)`;
          heroRef.current.style.filter = heroBlur > 0.2 ? `blur(${heroBlur}px)` : "none";
          heroRef.current.style.pointerEvents = heroOpacity > 0.4 ? "auto" : "none";
        }
        if (scrollPromptRef.current) {
          const promptOpacity = Math.max(0, Math.min(1, 1 - pTrack / 0.04));
          scrollPromptRef.current.style.opacity = `${promptOpacity}`;
        }
        if (phase1Ref.current) {
          const m1 = computePhaseMetrics(pTrack, 0.08, 0.13, 0.17, 0.22);
          phase1Ref.current.style.opacity = `${m1.opacity}`;
          phase1Ref.current.style.transform = `translateY(${m1.y}px)`;
          phase1Ref.current.style.filter = m1.blur > 0.2 ? `blur(${m1.blur}px)` : "none";
          phase1Ref.current.style.pointerEvents = m1.pointer;
        }
        if (phase2Ref.current) {
          const m2 = computePhaseMetrics(pTrack, 0.2, 0.25, 0.29, 0.34);
          phase2Ref.current.style.opacity = `${m2.opacity}`;
          phase2Ref.current.style.transform = `translateY(${m2.y}px)`;
          phase2Ref.current.style.filter = m2.blur > 0.2 ? `blur(${m2.blur}px)` : "none";
          phase2Ref.current.style.pointerEvents = m2.pointer;
        }
        if (phase3Ref.current) {
          const m3 = computePhaseMetrics(pTrack, 0.32, 0.37, 0.41, 0.46);
          phase3Ref.current.style.opacity = `${m3.opacity}`;
          phase3Ref.current.style.transform = `translateY(${m3.y}px)`;
          phase3Ref.current.style.filter = m3.blur > 0.2 ? `blur(${m3.blur}px)` : "none";
          phase3Ref.current.style.pointerEvents = m3.pointer;
        }
        if (phase4Ref.current) {
          const m4 = computePhaseMetrics(pTrack, 0.44, 0.49, 0.53, 0.58);
          phase4Ref.current.style.opacity = `${m4.opacity}`;
          phase4Ref.current.style.transform = `translateY(${m4.y}px)`;
          phase4Ref.current.style.filter = m4.blur > 0.2 ? `blur(${m4.blur}px)` : "none";
          phase4Ref.current.style.pointerEvents = m4.pointer;
        }
        if (phase5Ref.current) {
          const m5 = computePhaseMetrics(pTrack, 0.56, 0.61, 0.67, 0.72);
          phase5Ref.current.style.opacity = `${m5.opacity}`;
          phase5Ref.current.style.transform = `translateY(${m5.y}px)`;
          phase5Ref.current.style.filter = m5.blur > 0.2 ? `blur(${m5.blur}px)` : "none";
          phase5Ref.current.style.pointerEvents = m5.pointer;
        }
        if (phase6Ref.current) {
          let opacity = 0;
          let y = 0;
          let blur = 0;
          if (pTrack < 0.74) {
            opacity = 0;
            y = 20;
            blur = 6;
          } else if (pTrack < 0.8) {
            const factor = (pTrack - 0.74) / 0.06;
            const smooth = factor * factor * (3 - 2 * factor);
            opacity = smooth;
            y = (1 - smooth) * 20;
            blur = (1 - smooth) * 6;
          } else if (pTrack <= 0.97) {
            opacity = 1;
            y = 0;
            blur = 0;
          } else {
            const factor = (pTrack - 0.97) / 0.03;
            opacity = Math.max(0, 1 - factor);
            y = -factor * 15;
            blur = factor * 4;
          }
          phase6Ref.current.style.opacity = `${opacity}`;
          phase6Ref.current.style.transform = `translateY(${y}px)`;
          phase6Ref.current.style.filter = blur > 0.2 ? `blur(${blur}px)` : "none";
          phase6Ref.current.style.pointerEvents = opacity > 0.4 ? "auto" : "none";
        }
      };
      const handleScroll = () => {
        const pFull = computeFullPageProgress();
        const track = document.getElementById("cinematic-track");
        let pTrack = 0;
        if (track) {
          const trackRect = track.getBoundingClientRect();
          const trackScrollable = track.offsetHeight - window.innerHeight;
          pTrack = Math.max(0, Math.min(1, -trackRect.top / (trackScrollable || 1)));
        } else {
          pTrack = pFull;
        }
        const dur = durationRef.current || (video ? video.duration : 23.85) || 23.85;
        targetTimeRef.current = pFull * Math.max(0, dur - 0.05);
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${pFull * 100}%`;
        }
        applyProgress(pTrack);
      };
      if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
        gsap.registerPlugin(ScrollTrigger);
        st = ScrollTrigger.create({
          trigger: "#cinematic-track",
          start: "top top",
          end: "bottom bottom",
          scrub: 1.2,
          // Velvety continuous scrub synced with Lenis inertia
          onUpdate: (self) => {
            const pFull = computeFullPageProgress();
            const dur = durationRef.current || (video ? video.duration : 23.85) || 23.85;
            targetTimeRef.current = pFull * Math.max(0, dur - 0.05);
            if (progressBarRef.current) {
              progressBarRef.current.style.width = `${pFull * 100}%`;
            }
            applyProgress(self.progress);
          }
        });
      }
      window.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => {
        if (st) st.kill();
        window.removeEventListener("scroll", handleScroll);
      };
    }, [reducedMotion]);
    (0, import_react2.useEffect)(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let animId;
      let width = canvas.width = window.innerWidth;
      let height = canvas.height = window.innerHeight;
      const handleResize = () => {
        if (!canvas) return;
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      };
      window.addEventListener("resize", handleResize);
      let time = 0;
      const render = () => {
        time += 0.016;
        ctx.clearRect(0, 0, width, height);
        const p = progressRef.current;
        if (p >= 0.65) {
          const meshAlpha = Math.min(1, (p - 0.65) / 0.16) * 0.28;
          ctx.save();
          ctx.strokeStyle = `rgba(0, 240, 255, ${meshAlpha})`;
          ctx.lineWidth = 0.5;
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
          ctx.strokeStyle = `rgba(0, 219, 233, ${meshAlpha * 1.8})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 8]);
          for (let i = 1; i <= 3; i++) {
            const cy = height * (0.35 + i * 0.16);
            ctx.beginPath();
            ctx.moveTo(0, cy);
            for (let x = 0; x <= width; x += 25) {
              const waveY = Math.sin(x * 35e-4 + time * 0.5 + i) * 16;
              ctx.lineTo(x, cy + waveY);
            }
            ctx.stroke();
          }
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
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animId);
      };
    }, []);
    return /* @__PURE__ */ import_react2.default.createElement("div", { ref: containerRef, className: "relative w-full" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-[#000000]" }, /* @__PURE__ */ import_react2.default.createElement(
      "video",
      {
        ref: videoRef,
        className: "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
        playsInline: true,
        muted: true,
        preload: "auto",
        style: {
          opacity: videoLoaded ? 1 : 0.85,
          objectPosition: "center center"
        }
      },
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "/public/media/kyogre-bg-smooth.mp4", type: "video/mp4" }),
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "public/media/kyogre-bg-smooth.mp4", type: "video/mp4" }),
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "/media/kyogre-bg-smooth.mp4", type: "video/mp4" }),
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "media/kyogre-bg-smooth.mp4", type: "video/mp4" }),
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "/public/media/kyogre-ocean-dive.mp4", type: "video/mp4" }),
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "public/media/kyogre-ocean-dive.mp4", type: "video/mp4" }),
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "/media/kyogre-ocean-dive.mp4", type: "video/mp4" }),
      /* @__PURE__ */ import_react2.default.createElement("source", { src: "media/kyogre-ocean-dive.mp4", type: "video/mp4" })
    ), /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-[#02060d]/80 pointer-events-none" }), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        className: "absolute inset-0 pointer-events-none z-[3]",
        style: {
          background: "radial-gradient(ellipse at center, transparent 38%, rgba(2,6,13,0.5) 68%, rgba(2,6,13,0.88) 100%)"
        }
      }
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: blackOverlayRef,
        className: "absolute inset-0 bg-[#000000] pointer-events-none transition-none z-[5]",
        style: { opacity: 0 }
      }
    ), /* @__PURE__ */ import_react2.default.createElement("canvas", { ref: canvasRef, className: "absolute inset-0 w-full h-full pointer-events-none z-10" })), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        className: "fixed inset-0 pointer-events-none z-[2]",
        style: {
          opacity: 0.035,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px"
        }
      }
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        className: "fixed top-0 left-0 z-[60] h-[2px] pointer-events-none",
        style: {
          background: "linear-gradient(90deg, #00f0ff, #0080ff)",
          boxShadow: "0 0 8px #00f0ff, 0 0 2px #00f0ff",
          width: "0%",
          transition: "width 0.1s linear"
        },
        ref: progressBarRef
      }
    ), /* @__PURE__ */ import_react2.default.createElement("aside", { className: "fixed right-5 sm:right-8 lg:right-10 top-1/2 -translate-y-1/2 z-40 flex flex-col items-end pointer-events-none select-none" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "mb-3 px-2.5 py-1.5 rounded border border-[#00f0ff]/30 bg-black/65 backdrop-blur-md font-mono text-xs text-[#00f0ff] shadow-[0_0_12px_rgba(0,240,255,0.2)] flex flex-col items-end gap-0.5" }, /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[10px] text-[#94a9be] mr-1.5 uppercase tracking-wider" }, "DEPTH:"), /* @__PURE__ */ import_react2.default.createElement("span", { ref: depthReadoutRef, className: "font-bold text-[#dbfcff]" }, "0m")), /* @__PURE__ */ import_react2.default.createElement("span", { ref: depthTempRef, className: "text-[9px] text-[#00dbe9] tracking-wide" })), /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative h-64 w-12 flex flex-col items-end justify-between px-2 py-2 border-r border-white/20 font-mono text-[10px] text-white/75 bg-black/65 backdrop-blur-md rounded-l-xl drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]" }, /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: depthPipRef,
        className: "absolute right-[-3px] w-1.5 h-3.5 bg-[#00f0ff] rounded-sm shadow-[0_0_12px_#00f0ff] transition-none",
        style: { top: "0%" }
      }
    ), DEPTH_MILESTONES.map((ms, idx) => /* @__PURE__ */ import_react2.default.createElement(
      "button",
      {
        key: ms.id,
        ref: (el) => depthButtonsRef.current[idx] = el,
        type: "button",
        className: "cursor-pointer pointer-events-auto hover:text-[#00f0ff] transition-colors text-right text-white/70 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] w-full pr-1",
        onClick: () => onSelectDepth && onSelectDepth(ms.id)
      },
      ms.label
    )))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center pointer-events-none select-none z-30 px-6 sm:px-12 lg:px-20" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.55)_0%,rgba(2,6,13,0.25)_50%,transparent_80%)]" }), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: heroRef,
        className: "absolute inset-0 flex flex-col justify-center items-center text-center px-6 lg:px-12 transition-none z-10",
        style: { opacity: 1, transform: "translateY(0px)" }
      },
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative max-w-4xl mx-auto flex flex-col items-center space-y-7 px-8 py-10 sm:px-12 sm:py-12 z-10" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-[-40px] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.75)_0%,rgba(2,6,13,0.45)_50%,transparent_78%)]" }), /* @__PURE__ */ import_react2.default.createElement("h1", { className: "relative text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-['Space_Grotesk'] font-bold tracking-tighter uppercase text-[#dbfcff] leading-none drop-shadow-[0_4px_30px_rgba(0,0,0,0.9)]" }, "KYOGRE"), /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-xl sm:text-2xl md:text-3xl font-['Space_Grotesk'] font-light text-[#00f0ff] tracking-wide drop-shadow-[0_2px_15px_rgba(0,0,0,0.9)]" }, "Seeing Beneath the Surface"), /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-base sm:text-lg text-[#cbd5e1] font-normal max-w-xl mx-auto leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]" }, "AI-powered reconstruction of subsurface ocean temperature fields using multimodal satellite observations."), /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative pt-6 flex flex-col sm:flex-row items-center justify-center gap-5" }, /* @__PURE__ */ import_react2.default.createElement(
        "button",
        {
          type: "button",
          onClick: onExplore,
          className: "px-8 py-3.5 rounded-full bg-[#00f0ff] text-[#02060d] font-['Space_Grotesk'] font-semibold tracking-wider text-sm shadow-[0_0_25px_rgba(0,240,255,0.4)] hover:shadow-[0_0_35px_rgba(0,240,255,0.8)] hover:scale-[1.02] transition-all duration-300 flex items-center gap-2 cursor-pointer pointer-events-auto"
        },
        /* @__PURE__ */ import_react2.default.createElement("span", null, "EXPLORE KYOGRE"),
        /* @__PURE__ */ import_react2.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M5 12h14M12 5l7 7-7 7" }))
      ), /* @__PURE__ */ import_react2.default.createElement(
        "button",
        {
          type: "button",
          onClick: onViewPrototype,
          className: "px-8 py-3.5 rounded-full border border-white/20 text-[#dde2f3] hover:text-[#00f0ff] hover:border-[#00f0ff]/50 text-sm font-['Space_Grotesk'] tracking-wider transition-all duration-300 backdrop-blur-sm bg-black/40 cursor-pointer pointer-events-auto"
        },
        "VIEW PROTOTYPE"
      ))),
      /* @__PURE__ */ import_react2.default.createElement(
        "div",
        {
          ref: scrollPromptRef,
          className: "absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#94a9be] transition-none cursor-pointer pointer-events-auto z-10",
          onClick: onScrollDown
        },
        /* @__PURE__ */ import_react2.default.createElement("span", { className: "font-mono text-[10px] tracking-widest uppercase opacity-75 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" }, "SCROLL TO DESCEND"),
        /* @__PURE__ */ import_react2.default.createElement(
          "svg",
          {
            width: "18",
            height: "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "#00f0ff",
            strokeWidth: "2",
            className: "animate-bounce drop-shadow-[0_0_10px_#00f0ff]"
          },
          /* @__PURE__ */ import_react2.default.createElement("path", { d: "M12 5v14M19 12l-7 7-7-7" })
        )
      )
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: phase1Ref,
        className: "absolute max-w-4xl space-y-6 text-left transition-none z-10 px-8 py-10 sm:px-10 sm:py-12",
        style: { opacity: 0, pointerEvents: "none" }
      },
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-[-40px] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.72)_0%,rgba(2,6,13,0.40)_55%,transparent_80%)]" }),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-[#00f0ff]" }), /* @__PURE__ */ import_react2.default.createElement("span", null, "0.0 METERS // EPILIMNION SURFACE LAYER")),
      /* @__PURE__ */ import_react2.default.createElement("h2", { className: "relative text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff] leading-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)]" }, "WE CAN SEE THE SURFACE.", /* @__PURE__ */ import_react2.default.createElement("br", null), /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#94a9be] font-light" }, "THE OCEAN WITHHOLDS EVERYTHING ELSE.")),
      /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-base sm:text-lg text-[#cbd5e1] font-light max-w-2xl leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]" }, "Satellites image every square kilometre of the North Indian Ocean daily \u2014 but infrared and microwave wavelengths penetrate only a fraction of a millimetre into the water column. Heat reserves, cyclone intensification fuel, and thermocline structure live in the dark column between 0 and 1000m. That entire vertical structure is invisible to real-time remote sensing."),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative pt-4 flex flex-wrap gap-8 text-xs font-mono text-[#94a9be] border-t border-white/15 max-w-xl" }, /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#00dbe9] font-bold" }, "SATELLITE PENETRATION:"), " < 1mm (IR/Microwave)"), /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#00dbe9] font-bold" }, "INVISIBLE DEPTH RANGE:"), " 0m \u2192 1000m"))
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: phase2Ref,
        className: "absolute max-w-5xl space-y-8 text-left transition-none z-10 px-8 py-10 sm:px-10 sm:py-12",
        style: { opacity: 0, pointerEvents: "none" }
      },
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-[-40px] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.72)_0%,rgba(2,6,13,0.40)_55%,transparent_80%)]" }),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-[#00f0ff]" }), /* @__PURE__ */ import_react2.default.createElement("span", null, "100 METERS // THERMOCLINE BOUNDARY")), /* @__PURE__ */ import_react2.default.createElement("h2", { className: "relative text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff] leading-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)]" }, "ARGO FLOATS PROFILE IT DIRECTLY.", /* @__PURE__ */ import_react2.default.createElement("br", null), /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#94a9be] font-light" }, "THERE AREN'T NEARLY ENOUGH.")), /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-base sm:text-lg text-[#cbd5e1] font-light max-w-2xl leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]" }, "The global Argo array is the finest in-situ profiling network ever deployed \u2014 but each float covers ~300km of open ocean and resurfaces only once every 10 days. During that window a monsoon eddy can form, intensify, and shed subsurface heat entirely unobserved. Kyogre was built to fill exactly this gap \u2014 and validated against every one of the 41 independent Argo floats operating across the North Indian Ocean.")),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative grid grid-cols-1 sm:grid-cols-3 gap-8 pt-4 border-t border-white/15 max-w-3xl" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "space-y-1" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-3xl sm:text-4xl font-['Space_Grotesk'] font-light text-[#dbfcff] font-mono" }, "~300 km"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-xs font-mono text-[#00f0ff] tracking-wider uppercase" }, "Average Float Spacing"), /* @__PURE__ */ import_react2.default.createElement("p", { className: "text-xs text-[#94a9be] font-light" }, "Lateral distance between profiling floats across the Indian Ocean.")), /* @__PURE__ */ import_react2.default.createElement("div", { className: "space-y-1" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-3xl sm:text-4xl font-['Space_Grotesk'] font-light text-[#dbfcff] font-mono" }, "10 Days"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-xs font-mono text-[#00f0ff] tracking-wider uppercase" }, "Resurface Cycle"), /* @__PURE__ */ import_react2.default.createElement("p", { className: "text-xs text-[#94a9be] font-light" }, "Descent to 1000m parking depth and ascent \u2014 missing cyclones and eddies in between.")), /* @__PURE__ */ import_react2.default.createElement("div", { className: "space-y-1" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-3xl sm:text-4xl font-['Space_Grotesk'] font-light text-[#dbfcff] font-mono" }, "41"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-xs font-mono text-[#00f0ff] tracking-wider uppercase" }, "Floats Validated Against"), /* @__PURE__ */ import_react2.default.createElement("p", { className: "text-xs text-[#94a9be] font-light" }, "Independent in-situ Argo profiles used for blind validation \u2014 615 depth observation points.")))
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: phase3Ref,
        className: "absolute max-w-2xl space-y-6 text-right ml-auto transition-none z-10 px-8 py-10 sm:px-10 sm:py-12",
        style: { opacity: 0, pointerEvents: "none", right: "5%" }
      },
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-[-40px] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.72)_0%,rgba(2,6,13,0.40)_55%,transparent_80%)]" }),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs tracking-widest text-[#00f0ff] inline-flex items-center gap-2" }, /* @__PURE__ */ import_react2.default.createElement("span", null, "250 METERS // MESOPELAGIC TWILIGHT"), /* @__PURE__ */ import_react2.default.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-[#00f0ff]" })),
      /* @__PURE__ */ import_react2.default.createElement("h2", { className: "relative text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff] leading-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)]" }, "WHEN A CYCLONE DEEPENS OVERNIGHT,", /* @__PURE__ */ import_react2.default.createElement("br", null), /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#94a9be] font-light" }, "THE HEAT WAS ALWAYS THERE \u2014 UNSEEN.")),
      /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-base sm:text-lg text-[#cbd5e1] font-light leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]" }, "The 26\xB0C isotherm \u2014 the fuel boundary for tropical cyclone intensification \u2014 typically sits at 50\u2013150m depth. When a storm passes over a subsurface warm eddy and rapidly deepens from Category 2 to Category 4, forecasters are reading surface signals that masked what was building below. The measurement gap isn't academic."),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs text-[#00dbe9] tracking-wider pt-2" }, "[ D26 ISOTHERM: CRITICAL CYCLONE HEAT POTENTIAL BOUNDARY ]")
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: phase4Ref,
        className: "absolute max-w-3xl space-y-7 text-center mx-auto transition-none z-10 px-8 py-10 sm:px-10 sm:py-12",
        style: { opacity: 0, pointerEvents: "none" }
      },
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-[-40px] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.72)_0%,rgba(2,6,13,0.40)_55%,transparent_80%)]" }),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs tracking-widest text-[#00f0ff] uppercase" }, "500 METERS // INTERMEDIATE DEPTH"),
      /* @__PURE__ */ import_react2.default.createElement("h2", { className: "relative text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-['Space_Grotesk'] font-bold tracking-tight text-[#dbfcff] drop-shadow-[0_0_40px_rgba(0,240,255,0.4)] leading-tight" }, "SURFACE SIGNALS ENCODE SUBSURFACE PHYSICS.", /* @__PURE__ */ import_react2.default.createElement("br", null), /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#94a9be] font-light text-4xl sm:text-5xl" }, "KYOGRE READS THE CODE.")),
      /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-lg sm:text-xl text-[#cbd5e1] font-light max-w-2xl mx-auto leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]" }, "Sea surface height anomalies reflect baroclinic stretching of the water column below. Salinity gradients reveal freshwater lenses that cap vertical mixing. Wind-stress curl marks where Ekman pumping lifts cold thermocline water. Together, across a 10-day lookback window, these surface fingerprints contain enough information to reconstruct temperature structure down to 1000m."),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative text-xs font-mono text-[#00dbe9] tracking-widest uppercase pt-4" }, "CNN-LSTM SPATIO-TEMPORAL INFERENCE \u2014 27 INPUT CHANNELS \u2014 10-DAY LOOKBACK WINDOW")
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: phase5Ref,
        className: "absolute max-w-5xl space-y-8 text-left transition-none z-10 px-8 py-10 sm:px-10 sm:py-12",
        style: { opacity: 0, pointerEvents: "none" }
      },
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-[-40px] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.72)_0%,rgba(2,6,13,0.40)_55%,transparent_80%)]" }),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-[#00f0ff]" }), /* @__PURE__ */ import_react2.default.createElement("span", null, "750 METERS // DEEP THERMOCLINE")), /* @__PURE__ */ import_react2.default.createElement("h2", { className: "relative text-4xl sm:text-6xl md:text-7xl font-['Space_Grotesk'] font-bold tracking-tight text-[#dbfcff] uppercase leading-tight drop-shadow-[0_0_35px_rgba(0,240,255,0.3)]" }, "MEET KYOGRE."), /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs sm:text-sm tracking-widest text-[#00f0ff] uppercase font-semibold" }, "CNN-LSTM DEEP LEARNING MODEL"), /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-lg sm:text-xl text-[#cbd5e1] font-light max-w-2xl leading-relaxed" }, "Ingests 27 channels of satellite surface anomaly fields \u2014 SST, SSH, SSS, currents, winds \u2014 across a rolling 10-day lookback window. A spatial CNN extracts mesoscale eddy structures and frontal boundaries. A temporal LSTM reads baroclinic wave propagation delays. The output: a full 15-depth temperature profile anywhere in the North Indian Ocean, reconstructed in < 1.5ms.")),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative space-y-3" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-xs font-mono text-[#48627e] tracking-widest uppercase mb-4" }, "[ MULTIMODAL SATELLITE SURFACE EMBEDDINGS ]"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "flex flex-wrap gap-3 max-w-3xl" }, SATELLITE_INPUTS.map((inp) => /* @__PURE__ */ import_react2.default.createElement(
        "div",
        {
          key: inp.id,
          className: "px-4 py-2.5 rounded-full border border-[#00f0ff]/30 bg-black/60 backdrop-blur-sm text-xs font-mono text-[#dbfcff] hover:border-[#00f0ff] transition-colors"
        },
        /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#00dbe9] font-bold mr-2" }, inp.symbol),
        /* @__PURE__ */ import_react2.default.createElement("span", null, inp.name)
      )))),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative text-xs font-mono text-[#00dbe9] tracking-wide max-w-2xl border-l-2 border-[#00f0ff]/60 pl-4 py-1.5 bg-black/60 backdrop-blur-sm rounded-r" }, "65,967 parameters. Validated against 41 independent Argo floats (615 depth observation points): RMSE 0.75\xB0C \u2014 +20.0% skill improvement over monthly climatology.")
    ), /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        ref: phase6Ref,
        className: "absolute max-w-4xl space-y-6 text-left transition-none z-10 px-8 py-10 sm:px-10 sm:py-12",
        style: { opacity: 0, pointerEvents: "none" }
      },
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "absolute inset-[-40px] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(2,6,13,0.72)_0%,rgba(2,6,13,0.40)_55%,transparent_80%)]" }),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative font-mono text-xs tracking-widest text-[#00f0ff] flex items-center gap-2" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-ping" }), /* @__PURE__ */ import_react2.default.createElement("span", null, "1000 METERS // BATHYPELAGIC REALM")),
      /* @__PURE__ */ import_react2.default.createElement("h2", { className: "relative text-3xl sm:text-5xl md:text-6xl font-['Space_Grotesk'] font-bold tracking-tight text-[#dbfcff] leading-tight drop-shadow-[0_0_40px_rgba(0,240,255,0.4)]" }, "FROM SURFACE SIGNALS", /* @__PURE__ */ import_react2.default.createElement("br", null), /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#00dbe9] font-light" }, "TO SUBSURFACE INTELLIGENCE.")),
      /* @__PURE__ */ import_react2.default.createElement("p", { className: "relative text-base sm:text-lg text-[#cbd5e1] font-light max-w-2xl leading-relaxed drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)]" }, "Kyogre reconstructs full volumetric thermal strata across 15 standard depths from 0m down to 1000m. Thermocline depth, mixed layer depth, ocean heat content, and acoustic sound velocity profiles \u2014 previously requiring ship-deployed CTD sensors \u2014 become computable anywhere in the North Indian Ocean on demand."),
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "relative flex flex-wrap gap-8 pt-4 text-xs font-mono text-[#94a9be] border-t border-white/15 max-w-xl" }, /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#dbfcff] font-bold" }, "GRID RESOLUTION:"), " 0.25\xB0 \xD7 0.25\xB0"), /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#dbfcff] font-bold" }, "VERTICAL LEVELS:"), " 15 Standard Depths"), /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "text-[#dbfcff] font-bold" }, "INFERENCE:"), " < 1.5ms (cached)"))
    )), /* @__PURE__ */ import_react2.default.createElement("div", { className: "sr-only hidden", "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("span", null, "WE CAN SEE THE SURFACE. BUT NOT EVERYTHING BENEATH IT."), /* @__PURE__ */ import_react2.default.createElement("span", null, "THE OCEAN IS VOLUMETRIC. OUR OBSERVATIONS ARE NOT."), /* @__PURE__ */ import_react2.default.createElement("span", null, "BETWEEN THE OBSERVATIONS LIES THE UNKNOWN."), /* @__PURE__ */ import_react2.default.createElement("span", null, "HOW DO WE RECONSTRUCT WHAT WE CANNOT DIRECTLY OBSERVE?"), /* @__PURE__ */ import_react2.default.createElement("span", { className: "bg-[#02060d]/80 backdrop-blur-xl" }, "p <= 0.08")));
  };

  // src/components/ResearchConsole.tsx
  var import_react3 = __toESM(__require("react"));
  var ResearchConsole = () => {
    const gradientRef = (0, import_react3.useRef)(null);
    const [gradientRevealed, setGradientRevealed] = (0, import_react3.useState)(false);
    (0, import_react3.useEffect)(() => {
      if (typeof IntersectionObserver !== "undefined" && gradientRef.current) {
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
        const checkProgress = () => {
          const scrollY = window.scrollY || window.pageYOffset || 0;
          const maxScroll = Math.max(1, (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight);
          const p = scrollY / maxScroll;
          if (p >= 0.55) setGradientRevealed(true);
        };
        window.addEventListener("scroll", checkProgress, { passive: true });
        checkProgress();
        return () => window.removeEventListener("scroll", checkProgress);
      }
    }, []);
    const [settings, setSettings] = (0, import_react3.useState)({
      selectedDepth: 150,
      showArgoFloats: true,
      showIsotherms: true,
      showEkmanVelocity: false,
      activeCell: {
        name: "Bay of Bengal (Central)",
        coordinates: "14.25\xB0N, 84.50\xB0E",
        predictedTemp: 19.42,
        confidenceInterval: 0.28
      }
    });
    const calculateTempAtDepth = (depth) => {
      if (depth <= 30) return (29.8 - depth * 0.05).toFixed(2);
      if (depth <= 200) return (28.3 - (depth - 30) * 0.075).toFixed(2);
      if (depth <= 500) return (15.5 - (depth - 200) * 0.022).toFixed(2);
      if (depth <= 1e3) return (8.9 - (depth - 500) * 8e-3).toFixed(2);
      return (4.9 - (depth - 1e3) * 1e-3).toFixed(2);
    };
    const handleSliderChange = (e) => {
      const val = parseInt(e.target.value, 10);
      setSettings((prev) => ({
        ...prev,
        selectedDepth: val,
        activeCell: {
          ...prev.activeCell,
          predictedTemp: parseFloat(calculateTempAtDepth(val))
        }
      }));
    };
    return /* @__PURE__ */ import_react3.default.createElement(
      "section",
      {
        className: "min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10",
        id: "section-console"
      },
      /* @__PURE__ */ import_react3.default.createElement("div", { className: "max-w-6xl mx-auto w-full space-y-10" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex flex-col sm:flex-row sm:items-end justify-between gap-4" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "font-mono text-xs tracking-widest text-[#00f0ff]" }, "NATIONAL OCEANOGRAPHIC RESEARCH CONSOLE"), /* @__PURE__ */ import_react3.default.createElement("h2", { className: "text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]" }, "THE OCEAN, MADE COMPUTABLE.")), /* @__PURE__ */ import_react3.default.createElement("div", { className: "font-mono text-xs text-[#00dbe9] flex items-center gap-2" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "w-2 h-2 rounded-full bg-emerald-400 animate-pulse" }), /* @__PURE__ */ import_react3.default.createElement("span", null, "DOMAIN: NORTH INDIAN OCEAN [ACTIVE]"))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-6 lg:p-8 rounded-2xl bg-[#060d1a]/70 backdrop-blur-xl border border-[#00f0ff]/15 space-y-6 shadow-[0_0_40px_rgba(0,0,0,0.6)]" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex flex-wrap justify-between items-center gap-4 text-xs font-mono border-b border-white/10 pb-4 text-[#48627e]" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-4 flex-wrap" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#dbfcff] font-bold" }, "KYOGRE v2.4 OPERATIONAL RUN"), /* @__PURE__ */ import_react3.default.createElement("span", null, "LAT: 05\xB0N \u2013 30\xB0N"), /* @__PURE__ */ import_react3.default.createElement("span", null, "LON: 45\xB0E \u2013 105\xB0E")), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-4" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#00dbe9]" }, "VALIDATED ARGO FLOATS: 41"), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#00f0ff]" }, "INFERENCE: < 1.5ms (cached)"))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-8 items-center" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "lg:col-span-4 space-y-6" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex justify-between text-xs font-mono" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#48627e]" }, "VERTICAL DEPTH TRANSECT"), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#00f0ff] font-bold font-mono" }, settings.selectedDepth, " m")), /* @__PURE__ */ import_react3.default.createElement(
        "input",
        {
          type: "range",
          min: "0",
          max: "1000",
          step: "25",
          value: settings.selectedDepth,
          onChange: handleSliderChange,
          className: "w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
        }
      ), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex justify-between text-[10px] font-mono text-[#48627e]" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "0m (SST)"), /* @__PURE__ */ import_react3.default.createElement("span", null, "250m"), /* @__PURE__ */ import_react3.default.createElement("span", null, "500m"), /* @__PURE__ */ import_react3.default.createElement("span", null, "1000m"))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "space-y-2.5 text-xs font-mono" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "text-[#48627e] uppercase text-[10px] tracking-wider mb-2" }, "TELEMETRY OVERLAYS"), /* @__PURE__ */ import_react3.default.createElement("label", { className: "flex items-center justify-between text-[#94a9be] cursor-pointer hover:text-white transition-colors" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "ARGO Float Vectors"), /* @__PURE__ */ import_react3.default.createElement(
        "input",
        {
          type: "checkbox",
          checked: settings.showArgoFloats,
          onChange: (e) => setSettings((p) => ({ ...p, showArgoFloats: e.target.checked })),
          className: "accent-[#00f0ff]"
        }
      )), /* @__PURE__ */ import_react3.default.createElement("label", { className: "flex items-center justify-between text-[#94a9be] cursor-pointer hover:text-white transition-colors" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "Isotherm Contours (\u03941\xB0C)"), /* @__PURE__ */ import_react3.default.createElement(
        "input",
        {
          type: "checkbox",
          checked: settings.showIsotherms,
          onChange: (e) => setSettings((p) => ({ ...p, showIsotherms: e.target.checked })),
          className: "accent-[#00f0ff]"
        }
      )), /* @__PURE__ */ import_react3.default.createElement("label", { className: "flex items-center justify-between text-[#94a9be] cursor-pointer hover:text-white transition-colors" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "Ekman Pumping Velocity"), /* @__PURE__ */ import_react3.default.createElement(
        "input",
        {
          type: "checkbox",
          checked: settings.showEkmanVelocity,
          onChange: (e) => setSettings((p) => ({ ...p, showEkmanVelocity: e.target.checked })),
          className: "accent-[#00f0ff]"
        }
      ))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-3.5 rounded-lg bg-black/50 border border-white/5 space-y-1.5 font-mono text-xs" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "text-[#48627e] text-[10px]" }, "SELECTED CELL (", settings.activeCell.name, ")"), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex justify-between text-[#dde2f3]" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "COORDINATE:"), " ", /* @__PURE__ */ import_react3.default.createElement("span", null, settings.activeCell.coordinates)), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex justify-between text-[#dbfcff]" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "T(z) PREDICTION:"), " ", /* @__PURE__ */ import_react3.default.createElement("span", { className: "font-bold text-[#00f0ff]" }, settings.activeCell.predictedTemp, " \xB0C")), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex justify-between text-[#48627e]" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "CONFIDENCE:"), " ", /* @__PURE__ */ import_react3.default.createElement("span", null, "\xB1 ", settings.activeCell.confidenceInterval, " \xB0C"))), /* @__PURE__ */ import_react3.default.createElement(
        "a",
        {
          href: "explore.html",
          className: "w-full py-3 rounded-xl bg-[#00f0ff] text-[#02060d] font-['Space_Grotesk'] font-bold text-xs tracking-wider uppercase text-center block shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:shadow-[0_0_30px_rgba(0,240,255,0.7)] transition-all"
        },
        "Launch Interactive 3D Explorer"
      )), /* @__PURE__ */ import_react3.default.createElement(
        "div",
        {
          className: "lg:col-span-8 h-72 lg:h-96 rounded-xl relative overflow-hidden flex flex-col justify-between p-6 bg-cover bg-center border border-white/10",
          style: {
            backgroundImage: "url('assets/ocean-abyss.jpg')"
          }
        },
        /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex justify-between items-center text-xs font-mono text-[#dbfcff] z-10" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "px-2.5 py-1 rounded bg-black/70 backdrop-blur-sm border border-white/10" }, "3D SUB-SURFACE THERMAL VOLUME"), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#00dbe9] text-[11px]" }, "TRANSECT: 14\xB0N LATITUDE")),
        /* @__PURE__ */ import_react3.default.createElement(
          "div",
          {
            className: "absolute left-0 right-0 border-t border-dashed border-[#00f0ff] transition-all duration-300 z-10 pointer-events-none",
            style: { top: `${Math.min(92, Math.max(8, settings.selectedDepth / 1e3 * 85 + 8))}%` }
          },
          /* @__PURE__ */ import_react3.default.createElement("span", { className: "absolute right-4 -top-5 font-mono text-[10px] text-[#00f0ff] bg-black/80 px-2 py-0.5 rounded border border-[#00f0ff]/40" }, "z = ", settings.selectedDepth, "m (", settings.activeCell.predictedTemp, "\xB0C)")
        ),
        /* @__PURE__ */ import_react3.default.createElement(
          "div",
          {
            ref: gradientRef,
            className: "z-10 bg-black/80 backdrop-blur-md p-3 rounded-lg flex items-center justify-between text-xs font-mono border border-white/10 transition-all duration-700 ease-out",
            style: {
              opacity: gradientRevealed ? 1 : 0.25,
              transform: gradientRevealed ? "scaleX(1)" : "scaleX(0.92)",
              boxShadow: gradientRevealed ? "0 0 25px rgba(0, 240, 255, 0.25)" : "none"
            }
          },
          /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#48627e]" }, "4\xB0C (Abyss)"),
          /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex-1 mx-4 h-2.5 rounded bg-gradient-to-r from-blue-900 via-[#00f0ff] via-amber-400 to-red-500 overflow-hidden relative" }, /* @__PURE__ */ import_react3.default.createElement(
            "div",
            {
              className: "absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000",
              style: {
                transform: gradientRevealed ? "translateX(100%)" : "translateX(-100%)"
              }
            }
          )),
          /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[#dbfcff]" }, "31\xB0C (Surface)")
        )
      ))))
    );
  };

  // src/components/ScientificPipeline.tsx
  var import_react4 = __toESM(__require("react"));
  var PIPELINE_STAGES = [
    { step: "01", title: "SURFACE TELEMETRY", subtitle: "INGESTION", details: "SST, SSS, SSH, ASCAT Winds", status: "ingested" },
    { step: "02", title: "PREPROCESSING", subtitle: "ALIGNMENT", details: "Spatial Gaussian & Grid Inpainting", status: "preprocessed" },
    { step: "03", title: "CNN-LSTM CORE", subtitle: "ENGINE", details: "Spatio-Temporal Feature Learning", status: "inferred" },
    { step: "04", title: "3D RECONSTRUCTION", subtitle: "SYNTHESIS", details: "0 - 1000m Stratified Profiles", status: "inferred" },
    { step: "05", title: "ARGO VALIDATION", subtitle: "BENCHMARK", details: "Independent In-Situ Matchup", status: "validated" },
    { step: "06", title: "OCEAN INTELLIGENCE", subtitle: "OUTPUT", details: "OHC\u2083\u2080\u2080, D20, MLD, SVP Feeds", status: "active" }
  ];
  var VALIDATION_METRICS = [
    {
      label: "ROOT MEAN SQUARE ERROR",
      value: "0.75",
      unit: "\xB0C",
      description: "Overall benchmark error against 41 blind independent Argo floats across 615 depth points.",
      isPlaceholder: false
    },
    {
      label: "CLIMATOLOGY SKILL SCORE",
      value: "+20.0",
      unit: "%",
      description: "Empirical skill improvement over monthly climatology baseline (RMSE 0.75\xB0C vs 0.84\xB0C).",
      isPlaceholder: false
    },
    {
      label: "CORRELATION COEFFICIENT",
      value: "0.962",
      unit: "",
      description: "High Pearson correlation against independent in-situ Argo profiling float observations.",
      isPlaceholder: false
    }
  ];
  var ScientificPipeline = () => {
    const sectionRef = (0, import_react4.useRef)(null);
    const [isRevealed, setIsRevealed] = (0, import_react4.useState)(false);
    (0, import_react4.useEffect)(() => {
      if (typeof IntersectionObserver !== "undefined" && sectionRef.current) {
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
        const checkProgress = () => {
          const scrollY = window.scrollY || window.pageYOffset || 0;
          const maxScroll = Math.max(1, (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight);
          const p = scrollY / maxScroll;
          if (p >= 0.65) setIsRevealed(true);
        };
        window.addEventListener("scroll", checkProgress, { passive: true });
        checkProgress();
        return () => window.removeEventListener("scroll", checkProgress);
      }
    }, []);
    return /* @__PURE__ */ import_react4.default.createElement(
      "section",
      {
        ref: sectionRef,
        className: "min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10",
        id: "section-validation"
      },
      /* @__PURE__ */ import_react4.default.createElement("div", { className: "max-w-6xl mx-auto w-full space-y-16" }, /* @__PURE__ */ import_react4.default.createElement(
        "div",
        {
          className: "space-y-4 transition-all duration-700 ease-out",
          style: {
            opacity: isRevealed ? 1 : 0,
            transform: isRevealed ? "translateY(0px)" : "translateY(24px)"
          }
        },
        /* @__PURE__ */ import_react4.default.createElement("div", { className: "font-mono text-xs tracking-widest text-[#00f0ff]" }, "SCIENTIFIC BENCHMARK & ARCHITECTURAL FLOW"),
        /* @__PURE__ */ import_react4.default.createElement("h2", { className: "text-3xl sm:text-4xl md:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]" }, "A RECONSTRUCTION IS ONLY AS VALUABLE AS ITS VALIDATION.")
      ), /* @__PURE__ */ import_react4.default.createElement(
        "div",
        {
          className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 text-xs font-mono border-y border-white/10 py-8 transition-all duration-700 ease-out",
          style: {
            opacity: isRevealed ? 1 : 0,
            transform: isRevealed ? "translateY(0px)" : "translateY(20px)"
          }
        },
        PIPELINE_STAGES.map((stage, idx) => /* @__PURE__ */ import_react4.default.createElement(
          "div",
          {
            key: stage.step,
            className: "space-y-1.5 group transition-all duration-500 ease-out",
            style: {
              transitionDelay: `${idx * 75}ms`,
              opacity: isRevealed ? 1 : 0,
              transform: isRevealed ? "translateY(0px)" : "translateY(12px)"
            }
          },
          /* @__PURE__ */ import_react4.default.createElement("div", { className: "text-[#00dbe9] text-[10px] tracking-wider font-semibold" }, stage.step, " // ", stage.subtitle),
          /* @__PURE__ */ import_react4.default.createElement("div", { className: "text-[#dbfcff] font-bold text-sm tracking-tight group-hover:text-[#00f0ff] transition-colors" }, stage.title),
          /* @__PURE__ */ import_react4.default.createElement("div", { className: "text-[#48627e] text-[11px] font-light leading-relaxed" }, stage.details)
        ))
      ), /* @__PURE__ */ import_react4.default.createElement(
        "div",
        {
          className: "grid grid-cols-1 sm:grid-cols-3 gap-8 pt-4 transition-all duration-700 ease-out",
          style: {
            opacity: isRevealed ? 1 : 0,
            transform: isRevealed ? "translateY(0px)" : "translateY(20px)",
            transitionDelay: "300ms"
          }
        },
        VALIDATION_METRICS.map((metric) => /* @__PURE__ */ import_react4.default.createElement("div", { key: metric.label, className: "space-y-2 p-5 rounded-xl bg-[#060d1a]/50 border border-white/5 backdrop-blur-sm hover:border-[#00f0ff]/20 transition-all" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "text-[#48627e] text-xs font-mono tracking-wider uppercase flex items-center justify-between" }, /* @__PURE__ */ import_react4.default.createElement("span", null, metric.label), metric.isPlaceholder && /* @__PURE__ */ import_react4.default.createElement("span", { className: "text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#00dbe9] border border-white/10" }, "BENCHMARK")), /* @__PURE__ */ import_react4.default.createElement("div", { className: "text-4xl sm:text-5xl font-['Space_Grotesk'] font-bold text-[#dbfcff] font-mono flex items-baseline gap-1" }, /* @__PURE__ */ import_react4.default.createElement("span", null, metric.value), /* @__PURE__ */ import_react4.default.createElement("span", { className: "text-xl font-normal text-[#00f0ff]" }, metric.unit)), /* @__PURE__ */ import_react4.default.createElement("div", { className: "text-xs text-[#94a9be] font-light leading-relaxed" }, metric.description)))
      ))
    );
  };

  // src/components/PrototypeShowcase.tsx
  var import_react5 = __toESM(__require("react"));
  var PrototypeShowcase = () => {
    const [showModal, setShowModal] = (0, import_react5.useState)(false);
    return /* @__PURE__ */ import_react5.default.createElement(
      "section",
      {
        className: "min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10",
        id: "section-prototype"
      },
      /* @__PURE__ */ import_react5.default.createElement("div", { className: "max-w-6xl mx-auto w-full space-y-12" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "font-mono text-xs tracking-widest text-[#00f0ff]" }, "LIVE DEMO & EVALUATION REPO"), /* @__PURE__ */ import_react5.default.createElement("h2", { className: "text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]" }, "KYOGRE IS ALREADY TAKING SHAPE."), /* @__PURE__ */ import_react5.default.createElement("p", { className: "text-base sm:text-lg text-[#94a9be] font-light max-w-2xl leading-relaxed" }, "Tested on historical INCOIS and Copernicus data pipelines with live model inference benchmarks for SIH26066 evaluators.")), /* @__PURE__ */ import_react5.default.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-8 items-center" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "lg:col-span-8 p-4 rounded-2xl bg-[#060d1a]/60 border border-[#00f0ff]/15 backdrop-blur-xl overflow-hidden relative group" }, /* @__PURE__ */ import_react5.default.createElement(
        "div",
        {
          className: "aspect-video w-full rounded-xl bg-cover bg-center relative flex flex-col justify-between p-6 border border-white/10",
          style: { backgroundImage: "url('assets/ocean-sunbeams.jpg')" }
        },
        /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-between items-center text-xs font-mono text-white/90 z-10" }, /* @__PURE__ */ import_react5.default.createElement("span", { className: "flex items-center gap-2" }, /* @__PURE__ */ import_react5.default.createElement("span", { className: "w-2 h-2 rounded-full bg-red-500 animate-pulse" }), "DEMO REEL // SIH26066"), /* @__PURE__ */ import_react5.default.createElement("span", { className: "text-[#00dbe9]" }, "4K SPATIAL RECONSTRUCTION")),
        /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex items-center justify-center my-auto z-10" }, /* @__PURE__ */ import_react5.default.createElement(
          "button",
          {
            type: "button",
            onClick: () => setShowModal(true),
            className: "w-20 h-20 rounded-full bg-[#00f0ff] text-[#02060d] flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-[0_0_30px_rgba(0,240,255,0.6)] cursor-pointer group",
            "aria-label": "Watch Prototype Video"
          },
          /* @__PURE__ */ import_react5.default.createElement("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "currentColor" }, /* @__PURE__ */ import_react5.default.createElement("polygon", { points: "6 4 20 12 6 20 6 4" }))
        )),
        /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-between items-center text-xs font-mono text-[#00dbe9] z-10" }, /* @__PURE__ */ import_react5.default.createElement("span", null, "[ VIDEO DEMO PLACEHOLDER ]"), /* @__PURE__ */ import_react5.default.createElement("span", null, "TEAM NEUROTIDE \xB7 SIH26066"))
      )), /* @__PURE__ */ import_react5.default.createElement("div", { className: "lg:col-span-4 space-y-6" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "space-y-4 font-mono text-xs" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "text-[#00f0ff] font-bold tracking-wider" }, "[ INFERENCE BENCHMARKS ]"), /* @__PURE__ */ import_react5.default.createElement("div", { className: "space-y-3 border-y border-white/10 py-4 text-[#94a9be]" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ import_react5.default.createElement("span", null, "CELL LATENCY:"), " ", /* @__PURE__ */ import_react5.default.createElement("span", { className: "text-[#dbfcff] font-bold" }, "< 140ms")), /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ import_react5.default.createElement("span", null, "STRATA RESOLUTION:"), " ", /* @__PURE__ */ import_react5.default.createElement("span", { className: "text-[#dde2f3]" }, "36 Depths")), /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ import_react5.default.createElement("span", null, "GRID SPACING:"), " ", /* @__PURE__ */ import_react5.default.createElement("span", { className: "text-[#dde2f3]" }, "25km \xD7 25km (0.25\xB0)")), /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ import_react5.default.createElement("span", null, "INFERENCE CORE:"), " ", /* @__PURE__ */ import_react5.default.createElement("span", { className: "text-[#00dbe9]" }, "PyTorch / ONNX")))), /* @__PURE__ */ import_react5.default.createElement("div", { className: "p-4 rounded-xl border border-white/10 bg-white/5 flex items-center gap-4" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "w-16 h-16 rounded bg-black/70 border border-[#00f0ff]/30 flex flex-col items-center justify-center font-mono text-[9px] text-center text-[#00dbe9] p-1 flex-shrink-0" }, /* @__PURE__ */ import_react5.default.createElement("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5" }, /* @__PURE__ */ import_react5.default.createElement("rect", { x: "3", y: "3", width: "7", height: "7" }), /* @__PURE__ */ import_react5.default.createElement("rect", { x: "14", y: "3", width: "7", height: "7" }), /* @__PURE__ */ import_react5.default.createElement("rect", { x: "3", y: "14", width: "7", height: "7" }), /* @__PURE__ */ import_react5.default.createElement("rect", { x: "14", y: "14", width: "7", height: "7" })), /* @__PURE__ */ import_react5.default.createElement("span", null, "[ QR CODE ]")), /* @__PURE__ */ import_react5.default.createElement("div", { className: "space-y-1" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "text-sm font-['Space_Grotesk'] text-[#dbfcff] font-medium" }, "Evaluation Repo & Notebooks"), /* @__PURE__ */ import_react5.default.createElement("div", { className: "text-xs text-[#94a9be] font-light" }, "Direct benchmark code, checkpoints, and ERDDAP Argo sync for evaluators."))), /* @__PURE__ */ import_react5.default.createElement(
        "a",
        {
          href: "explore.html",
          className: "w-full py-2.5 rounded-lg border border-[#00f0ff]/30 text-[#00dbe9] hover:bg-[#00f0ff]/10 text-xs font-mono tracking-wider text-center block transition-colors"
        },
        "ENTER LIVE RUNTIME"
      )))),
      showModal && /* @__PURE__ */ import_react5.default.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "max-w-3xl w-full bg-[#060d1a] border border-[#00f0ff]/30 rounded-2xl p-6 space-y-4 shadow-[0_0_50px_rgba(0,240,255,0.2)]" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-between items-center text-sm font-mono text-[#dbfcff]" }, /* @__PURE__ */ import_react5.default.createElement("span", null, "KYOGRE PROTOTYPE DEMO REEL"), /* @__PURE__ */ import_react5.default.createElement(
        "button",
        {
          type: "button",
          onClick: () => setShowModal(false),
          className: "text-[#94a9be] hover:text-white text-lg font-mono px-2"
        },
        "\u2715"
      )), /* @__PURE__ */ import_react5.default.createElement("div", { className: "aspect-video bg-black/90 rounded-xl border border-white/10 flex flex-col items-center justify-center p-8 text-center space-y-3" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "w-12 h-12 rounded-full bg-[#00f0ff]/20 text-[#00f0ff] flex items-center justify-center" }, /* @__PURE__ */ import_react5.default.createElement("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react5.default.createElement("polygon", { points: "5 3 19 12 5 21 5 3" }))), /* @__PURE__ */ import_react5.default.createElement("p", { className: "text-sm font-mono text-[#dbfcff]" }, "DEMO VIDEO LINK PLACEHOLDER"), /* @__PURE__ */ import_react5.default.createElement("p", { className: "text-xs text-[#94a9be] max-w-md" }, "You can drop in your YouTube, Vimeo, or local MP4 link directly in `src/components/PrototypeShowcase.tsx`.")), /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex justify-end" }, /* @__PURE__ */ import_react5.default.createElement(
        "button",
        {
          type: "button",
          onClick: () => setShowModal(false),
          className: "px-5 py-2 rounded-lg bg-[#00f0ff] text-[#02060d] font-mono text-xs font-bold"
        },
        "CLOSE"
      ))))
    );
  };

  // src/components/ApplicationsGrid.tsx
  var import_react6 = __toESM(__require("react"));
  var APPLICATIONS = [
    {
      id: "cyclones",
      code: "01 // CYCLONES & RAPID INTENSIFICATION",
      title: "Tropical Cyclone Heat Potential (TCHP)",
      parameter: "TCHP & D26 Thermal Reservoirs",
      description: "A storm passing over a shallow thermocline cools the sea surface and self-arrests. Over a deep, unseen warm pocket, it deepens by two categories overnight. If TCHP is underestimated, coastal evacuation warnings are issued 12 hours too late."
    },
    {
      id: "fisheries",
      code: "02 // PELAGIC FISHERIES INTELLIGENCE",
      title: "Thermocline Shoaling & Potential Fishing Zones",
      parameter: "Upwelling Fronts & Biological Boundaries",
      description: "Pelagic schools follow sharp thermal boundaries where nutrient upwelling concentrates biomass. Relying only on surface chlorophyll sends artisan fleets on 40-nautical-mile blind searches; subsurface thermocline depth pinpoints active feeding fronts directly."
    },
    {
      id: "defense",
      code: "03 // MARITIME DEFENSE & SONAR ACOUSTICS",
      title: "Sound Velocity Profiles & Shadow Zones",
      parameter: "Sonic Layer Depth & Acoustic Refraction",
      description: "Sonar waves bend away from warmer layers, creating acoustic shadow zones where submarines disappear from active hull-mounted sonar. Without real-time vertical temperature profiles, naval acoustic propagation models calculate false detection ranges."
    },
    {
      id: "assimilation",
      code: "04 // NUMERICAL MODEL INITIALIZATION",
      title: "Operational Ocean Forecasting Initial States",
      parameter: "Continuous 3D State Vector for ROMS/HYCOM",
      description: "Circulation models suffer severe forecast drift during the first 72 hours when initialized with cold, smoothed monthly climatologies. Assimilating daily reconstructed 3D temperature fields constrains baroclinic instability before errors compound basin-wide."
    },
    {
      id: "science",
      code: "05 // CLIMATE DYNAMICS & MONSOON PREDICTION",
      title: "Internal Wave & Dipole Dynamics (IOD / MJO)",
      parameter: "Thermocline Slope across Equatorial Waveguides",
      description: "Equatorial Kelvin and Rossby waves tilt the thermocline across the basin weeks before Indian Ocean Dipole anomalies flip the monsoon. Missing the subsurface thermal displacement blinds seasonal rainfall models to imminent drought or unseasonal deluge."
    }
  ];
  var ApplicationsGrid = () => {
    return /* @__PURE__ */ import_react6.default.createElement(
      "section",
      {
        className: "min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10",
        id: "section-applications"
      },
      /* @__PURE__ */ import_react6.default.createElement("div", { className: "max-w-6xl mx-auto w-full space-y-12" }, /* @__PURE__ */ import_react6.default.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ import_react6.default.createElement("div", { className: "font-mono text-xs tracking-widest text-[#00f0ff]" }, "NATIONAL OCEAN APPLICATIONS"), /* @__PURE__ */ import_react6.default.createElement("h2", { className: "text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]" }, "A BETTER VIEW OF THE OCEAN BELOW THE SURFACE.")), /* @__PURE__ */ import_react6.default.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-4" }, APPLICATIONS.map((app, idx) => /* @__PURE__ */ import_react6.default.createElement(
        "div",
        {
          key: app.id,
          className: `space-y-2 border-t border-white/10 pt-4 group hover:border-[#00f0ff]/40 transition-colors ${idx === 4 ? "sm:col-span-2 lg:col-span-2" : ""}`
        },
        /* @__PURE__ */ import_react6.default.createElement("div", { className: "text-[#00f0ff] font-mono text-xs uppercase tracking-wider" }, app.code),
        /* @__PURE__ */ import_react6.default.createElement("div", { className: "text-lg font-['Space_Grotesk'] font-medium text-[#dbfcff] group-hover:text-[#00dbe9] transition-colors" }, app.title),
        /* @__PURE__ */ import_react6.default.createElement("p", { className: "text-xs text-[#94a9be] font-light leading-relaxed" }, app.description)
      ))))
    );
  };

  // src/components/InstitutionalRoadmap.tsx
  var import_react7 = __toESM(__require("react"));
  var ROADMAP_PHASES = [
    {
      phase: "PHASE 01 // TELEMETRY HARVESTING",
      title: "COPERNICUS + INSAT-3D + ARGO",
      organization: "INCOIS DATA HARVEST",
      description: "Automated ingestion pipeline gathering satellite radar swaths, radiometers, and in-situ ARGO profiles across the Indian Ocean basin.",
      status: "prototype"
    },
    {
      phase: "PHASE 02 // NEURAL CLOUD",
      title: "KYOGRE INFERENCE RUNNER",
      organization: "NEURAL STRATIFICATION",
      description: "Continuous 24-hour neural generation producing gridded 4D subsurface temperature datasets across sovereign territorial waters.",
      status: "roadmap"
    },
    {
      phase: "PHASE 03 // DISSEMINATION",
      title: "INCOIS & MoES ADVISORIES",
      organization: "OPERATIONAL INSTITUTION",
      description: "Exporting actionable feeds directly into cyclone warnings, naval operational tactical models, and commercial fisheries advisories.",
      status: "planned"
    }
  ];
  var InstitutionalRoadmap = () => {
    return /* @__PURE__ */ import_react7.default.createElement(
      "section",
      {
        className: "min-h-screen w-full flex flex-col justify-center px-6 lg:px-20 py-24 relative z-10",
        id: "section-deployment"
      },
      /* @__PURE__ */ import_react7.default.createElement("div", { className: "max-w-5xl mx-auto w-full space-y-12" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "font-mono text-xs tracking-widest text-[#00f0ff]" }, "INSTITUTIONAL ROADMAP"), /* @__PURE__ */ import_react7.default.createElement("h2", { className: "text-3xl sm:text-5xl font-['Space_Grotesk'] font-medium tracking-tight text-[#dbfcff]" }, "FROM PROTOTYPE TO OCEAN INTELLIGENCE INFRASTRUCTURE."), /* @__PURE__ */ import_react7.default.createElement("p", { className: "text-base sm:text-lg text-[#94a9be] font-light leading-relaxed" }, "Designed for frictionless integration into India's premier ocean science institutes (INCOIS, NIOT, and MoES).")), /* @__PURE__ */ import_react7.default.createElement("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-8 border-y border-white/10 py-10 font-mono text-xs" }, ROADMAP_PHASES.map((phase) => /* @__PURE__ */ import_react7.default.createElement("div", { key: phase.phase, className: "space-y-2.5 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-[#00f0ff]/30 transition-all" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "text-[#00dbe9] text-[10px]" }, phase.phase), /* @__PURE__ */ import_react7.default.createElement("div", { className: "text-[#dbfcff] font-bold text-sm tracking-tight" }, phase.title), /* @__PURE__ */ import_react7.default.createElement("p", { className: "text-[#94a9be] font-light text-[11px] leading-relaxed" }, phase.description)))))
    );
  };

  // src/components/FinalCTA.tsx
  var import_react8 = __toESM(__require("react"));
  var FinalCTA = () => {
    return /* @__PURE__ */ import_react8.default.createElement(
      "section",
      {
        className: "min-h-screen w-full flex flex-col justify-between px-6 lg:px-20 pt-28 pb-12 relative text-center z-10 select-none",
        id: "section-final"
      },
      /* @__PURE__ */ import_react8.default.createElement("div", { className: "max-w-4xl mx-auto my-auto space-y-8" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "font-mono text-xs tracking-widest text-[#00f0ff] uppercase" }, "KYOGRE // 2026 OCEAN EMBED \xB7 SIH26066"), /* @__PURE__ */ import_react8.default.createElement("h2", { className: "text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-['Space_Grotesk'] font-bold tracking-tighter text-[#dbfcff] drop-shadow-[0_0_40px_rgba(0,240,255,0.45)] uppercase leading-none" }, "THE SURFACE IS ONLY THE BEGINNING."), /* @__PURE__ */ import_react8.default.createElement("p", { className: "text-xl sm:text-2xl font-['Space_Grotesk'] font-light text-[#94a9be] max-w-xl mx-auto" }, "Seeing Beneath the Surface"), /* @__PURE__ */ import_react8.default.createElement("div", { className: "pt-6 flex flex-wrap items-center justify-center gap-4" }, /* @__PURE__ */ import_react8.default.createElement(
        "a",
        {
          href: "explore.html",
          className: "px-8 py-3.5 rounded-full bg-[#00f0ff] text-[#02060d] font-['Space_Grotesk'] font-semibold tracking-wider text-sm shadow-[0_0_25px_rgba(0,240,255,0.6)] hover:shadow-[0_0_40px_rgba(0,240,255,0.9)] hover:scale-105 transition-all duration-300"
        },
        "EXPLORE KYOGRE CONSOLE"
      ), /* @__PURE__ */ import_react8.default.createElement(
        "a",
        {
          href: "#section-prototype",
          className: "px-8 py-3.5 rounded-full border border-white/20 text-[#dde2f3] hover:text-[#00f0ff] hover:border-[#00f0ff]/50 text-sm font-['Space_Grotesk'] tracking-wider transition-all duration-200 backdrop-blur-sm bg-black/20"
        },
        "WATCH PROTOTYPE VIDEO"
      ), /* @__PURE__ */ import_react8.default.createElement(
        "a",
        {
          href: "argo.html",
          className: "px-6 py-3.5 rounded-full border border-white/10 text-[#48627e] hover:text-[#00f0ff] hover:border-[#00f0ff]/30 text-xs font-mono tracking-wider transition-all"
        },
        "ARGO VALIDATION"
      ))),
      /* @__PURE__ */ import_react8.default.createElement("footer", { className: "w-full border-t border-white/10 pt-8 mt-16 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-[#48627e]" }, /* @__PURE__ */ import_react8.default.createElement("div", null, "\xA9 2025\u20132026 KYOGRE // SIH26066 \u2014 Team NeuroTide, Kumaraguru College of Technology."), /* @__PURE__ */ import_react8.default.createElement("div", { className: "flex items-center gap-6 flex-wrap justify-center" }, /* @__PURE__ */ import_react8.default.createElement("a", { className: "hover:text-[#00f0ff] transition-colors", href: "explore.html" }, "Ocean Explorer"), /* @__PURE__ */ import_react8.default.createElement("a", { className: "hover:text-[#00f0ff] transition-colors", href: "fisheries.html" }, "Fisheries PFZ"), /* @__PURE__ */ import_react8.default.createElement("a", { className: "hover:text-[#00f0ff] transition-colors", href: "marine-ecology.html" }, "Marine Ecology"), /* @__PURE__ */ import_react8.default.createElement("a", { className: "hover:text-[#00f0ff] transition-colors", href: "argo.html" }, "Argo Matchups")))
    );
  };

  // src/App.tsx
  var DEPTH_PROGRESS_TARGETS = {
    hero: 0,
    "section-surface": 0.15,
    "section-problem": 0.27,
    "section-gap": 0.39,
    "section-question": 0.51,
    "section-kyogre": 0.64,
    "section-reconstruction": 0.85
  };
  var App = () => {
    const lenisRef = (0, import_react9.useRef)(null);
    (0, import_react9.useEffect)(() => {
      let lenis = null;
      if (typeof Lenis !== "undefined") {
        let raf = function(time) {
          lenis.raf(time);
          requestAnimationFrame(raf);
        };
        lenis = new Lenis({
          lerp: 0.08,
          // smooth, continuous cinematic damping
          wheelMultiplier: 0.82,
          // slow, controlled response to mouse wheel
          touchMultiplier: 1.2,
          smoothWheel: true
        });
        lenisRef.current = lenis;
        requestAnimationFrame(raf);
      }
      if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
        gsap.registerPlugin(ScrollTrigger);
        if (lenis) {
          lenis.on("scroll", ScrollTrigger.update);
          gsap.ticker.add((time) => {
            lenis.raf(time * 1e3);
          });
          gsap.ticker.lagSmoothing(0);
        }
      }
      return () => {
        if (lenis) lenis.destroy();
      };
    }, []);
    const handleNavigate = (targetId) => {
      const lenis = lenisRef.current;
      if (targetId in DEPTH_PROGRESS_TARGETS) {
        const track = document.getElementById("cinematic-track");
        if (track) {
          const targetFraction = DEPTH_PROGRESS_TARGETS[targetId];
          const trackTop = track.offsetTop;
          const trackScrollable = track.offsetHeight - window.innerHeight;
          const targetScrollY = trackTop + targetFraction * trackScrollable;
          if (lenis) {
            lenis.scrollTo(targetScrollY, {
              duration: 1.6,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
            });
          } else {
            window.scrollTo({ top: targetScrollY, behavior: "smooth" });
          }
          return;
        }
      }
      const el = document.getElementById(targetId);
      if (el) {
        if (lenis) {
          lenis.scrollTo(el, {
            duration: 1.6,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
          });
        } else {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }
    };
    return /* @__PURE__ */ import_react9.default.createElement("div", { className: "bg-[#02060d] text-[#dde2f3] min-h-screen relative font-['Inter'] selection:bg-[#00f0ff] selection:text-[#02060d] overflow-x-hidden" }, /* @__PURE__ */ import_react9.default.createElement(Navigation, { onNavigate: handleNavigate }), /* @__PURE__ */ import_react9.default.createElement("div", { id: "cinematic-track", className: "relative w-full", style: { height: "1000vh" } }, /* @__PURE__ */ import_react9.default.createElement(
      CinematicVideoDive,
      {
        onExplore: () => handleNavigate("section-console"),
        onViewPrototype: () => handleNavigate("section-prototype"),
        onScrollDown: () => handleNavigate("section-surface"),
        onSelectDepth: handleNavigate
      }
    )), /* @__PURE__ */ import_react9.default.createElement("main", { className: "relative z-10 w-full bg-gradient-to-b from-transparent via-[#02060d]/70 to-[#02060d]/85" }, /* @__PURE__ */ import_react9.default.createElement(ResearchConsole, null), /* @__PURE__ */ import_react9.default.createElement(ScientificPipeline, null), /* @__PURE__ */ import_react9.default.createElement(PrototypeShowcase, null), /* @__PURE__ */ import_react9.default.createElement(ApplicationsGrid, null), /* @__PURE__ */ import_react9.default.createElement(InstitutionalRoadmap, null), /* @__PURE__ */ import_react9.default.createElement(FinalCTA, null)));
  };

  // src/index.tsx
  var rootElement = document.getElementById("root");
  if (rootElement) {
    const root = import_client.default.createRoot(rootElement);
    root.render(/* @__PURE__ */ import_react10.default.createElement(App, null));
  }
})();
