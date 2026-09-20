# Canonical Video Asset Specification for Kyogre

## Primary File Location
Place the master continuous ocean descent video at:
```
public/media/kyogre-ocean-dive.mp4
```
(A mirrored copy or symlink at `media/kyogre-ocean-dive.mp4` is also supported for universal server resolution).

---

## Required Video Characteristics

| Parameter | Specification | Notes |
| :--- | :--- | :--- |
| **Container / Codec** | MP4 (H.264 / AVC or H.265 / HEVC) | Fast seekable profile with regular or all-I keyframes |
| **Preferred Resolution** | **4K (3840 × 2160)** or **2.5K (2560 × 1440)** | 1080p (1920 × 1080) minimum |
| **Frame Rate** | 24–30 fps | Smooth photographic cadence |
| **Audio** | Optional / Muted | Video element is muted for silent cinematic immersion |
| **Color Grading** | Natural Indian Ocean sunlight, realistic blue attenuation | No heavy artificial color grading or digital filters |
| **Cuts / Text** | **Zero cuts, zero watermarks, zero text** | Continuous camera movement |

---

## Required Cinematic Narrative Progression (The Continuous Shot)

```
00:00 - 00:04 (000m - 050m) : HIGH AERIAL DRONE VIEW
                              Wide horizon, sky, sun glare, ocean surface swell below.
                              Camera angles downwards and descends toward the water.

00:04 - 00:06 (050m - 150m) : APPROACHING & BREAKING THE SURFACE
                              Water texture expands, horizon tilts off the top of the frame.
                              Camera punches through the waterline into the water column.
                              Real bubbles, refraction, and optical water entry.

00:06 - 00:10 (150m - 400m) : SHALLOW UNDERWATER PHOTIC ZONE
                              Downward sun rays (god rays) streaming from the surface ceiling.
                              Surface caustics shimmering overhead.
                              Suspended marine snow particles drifting upwards.
                              2 to 4 subtle, tiny distant pelagic fish silhouettes in the far background.

00:10 - 00:13 (400m - 750m) : DEEPENING MESOPELAGIC TWILIGHT
                              Warm light completely absorbed; sunlight rays naturally fade to zero.
                              Ocean transitions to rich, deep indigo and navy blue.
                              Fish disappear. Vast, quiet, dark ocean volume.

00:13 - 00:15 (750m - 1000m): BATHYPELAGIC ABYSS & RECONSTRUCTION TRANSITION
                              Deep ocean blue-black with faint particulate luminescence.
                              The Kyogre digital twin isotherm field and bathymetric mesh
                              emerge directly from this water volume.
```

---

## Scroll Engine Synchronization
The video is scrubbed 1:1 via GSAP ScrollTrigger and Lenis smooth inertia scrolling:
$$\text{video.currentTime} = \text{scrollProgress} \times \text{video.duration}$$
When the user moves the mouse wheel slightly, the video seeks smoothly to that exact moment. When the user stops scrolling, the video holds that frame without snapping.
