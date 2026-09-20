---
name: Abyssal Precision
colors:
  surface: '#0e131f'
  surface-dim: '#0e131f'
  surface-bright: '#343946'
  surface-container-lowest: '#080e1a'
  surface-container-low: '#161c28'
  surface-container: '#1a202c'
  surface-container-high: '#242a36'
  surface-container-highest: '#2f3542'
  on-surface: '#dde2f3'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dde2f3'
  inverse-on-surface: '#2b303d'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#aac7ff'
  on-secondary: '#003064'
  secondary-container: '#3e90ff'
  on-secondary-container: '#002957'
  tertiary: '#f6f4ff'
  on-tertiary: '#121f8b'
  tertiary-container: '#d4d6ff'
  on-tertiary-container: '#4854bb'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#aac7ff'
  on-secondary-fixed: '#001b3e'
  on-secondary-fixed-variant: '#00468d'
  tertiary-fixed: '#dfe0ff'
  tertiary-fixed-dim: '#bdc2ff'
  on-tertiary-fixed: '#000965'
  on-tertiary-fixed-variant: '#2e3aa2'
  background: '#0e131f'
  on-background: '#dde2f3'
  surface-variant: '#2f3542'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 64px
    fontWeight: '500'
    lineHeight: 72px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 38px
    fontWeight: '500'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 44px
    fontWeight: '500'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 30px
    fontWeight: '500'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.04em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels the quiet, crushing power and luminous mysteries of the hadal trenches. Built for deep ocean scientific exploration, autonomous underwater vehicle (AUV) telemetry, and computational oceanography, the interface merges high-modernist editorial typography with the clinical clarity of mission-critical laboratory instrumentation.

The visual style combines atmospheric glassmorphism, subtle bathymetric wireframes, and minimalist deep-sea brutalism. It evokes the sensation of piloting an exploratory vessel thousands of meters beneath the photic zone: light is scarce, information is vital, and precision is paramount. Bioluminescent highlights emerge organically from pitch-black and abyssal-navy depths, giving critical telemetry instantaneous visual priority without overwhelming the user.

## Colors

The palette simulates the light spectrum's absorption through descending ocean layers. 

- **Primary (`#00F0FF`)**: Bioluminescent Electric Cyan. Reserved for real-time telemetry, active sensory feeds, live acoustic pings, and focal callouts.
- **Secondary (`#0A84FF`)**: Pelagic Blue. Handles primary actions, active navigational states, and mid-tier interactive elements.
- **Tertiary (`#5E6AD2`)**: Abyssal Indigo. Used for structural datum points, sub-surface vector paths, and secondary metadata accents.
- **Neutral (`#030712`)**: The Midnight Trench. A near-black abyssal core that provides absolute darkness, paired with muted marine slate steps (`#0B132B`, `#111E38`, `#1C2E4A`) for layered depth.

Background surfaces rely on tonal oceanic steps rather than pure monochromatic grays, infusing every surface with cold sub-surface pressure. Bathymetric gridlines and borders utilize translucent variants of cyan and slate (`rgba(0, 240, 255, 0.08)` to `rgba(255, 255, 255, 0.06)`).

## Typography

Typography functions as a scientific instrument. 

- **Space Grotesk** commands display titles and section headings, delivering modern technical authority with engineered geometric quirks.
- **Inter** handles multi-sentence copy, briefings, and telemetry readouts requiring clean, effortless legibility under low-light ambient conditions.
- **JetBrains Mono** governs all scientific telemetry, geo-coordinates, bathymetric depth markers, sensor readings, and state badges. It is always set with deliberate tracking and uppercase styling when used as functional micro-labels.

## Layout & Spacing

The system runs on a 12-column fluid grid calibrated against Cartesian coordinates. Layout lines reference oceanic survey charts, with outer margins providing generous breathing space to emulate expansive ocean depths.

- **Desktop (1200px+)**: 12 columns, 1.5rem gutters, and 3rem margins. Content spans strict modules to align with bathymetric background rules.
- **Tablet (768px - 1199px)**: 8 columns, 1rem gutters, and 2rem margins. Data readouts collapse from side rails into stacked sensor decks.
- **Mobile (< 768px)**: 4 columns, 1rem gutters, and 1.25rem margins. Telemetry ribbons become horizontal scroll carousels with fixed-width data cards.

Spacing between functional groups should prioritize clarity and rhythmic cadence; elements are tethered by hairline data rules rather than excessive blank pads.

## Elevation & Depth

Elevation is rendered not through standard drop shadows, but through atmospheric density and bioluminescent back-projection.

- **Backdrop Grid**: Fine, hairline bathymetric contour lines and coordinate crosshairs (`rgba(0, 240, 255, 0.04)`) sit at the base canvas level.
- **Surface Tier 1 (Hadal Deck)**: Dark slate navy (`#060B18`) with hairline borders (`1px solid rgba(255, 255, 255, 0.07)`).
- **Surface Tier 2 (Bathypelagic Cards)**: Glassmorphic paneling using `backdrop-filter: blur(16px)`, filled with `rgba(11, 19, 43, 0.65)` and outlined with low-contrast oceanic borders (`1px solid rgba(0, 240, 255, 0.12)`).
- **Surface Tier 3 (Tactical Overlays & Modals)**: Deep navy glass (`rgba(3, 7, 18, 0.85)`) with an outer bioluminescent glow: `0 0 32px -8px rgba(0, 240, 255, 0.18)`.
- **Active Accents**: Interactive elements cast a tight, focused cyan bloom (`box-shadow: 0 0 12px rgba(0, 240, 255, 0.35)`), evoking sub-aquatic LEDs cutting through murk.

## Shapes

Shapes mirror precision oceanographic instrumentation: tight, angular, and functional. 

A corner radius value of `1` (Soft: 0.25rem / 4px base) ensures components feel engineered like titanium chassis and waterproof pressure casings rather than soft consumer software. Complex containers and sensor readouts occasionally incorporate subtle chamfered corners or tech-brackets (`corner notches`) via clip-paths to reinforce the research vessel aesthetic.

## Components

### Buttons
- **Primary Telemetry Button**: High-visibility cyan fill (`#00F0FF`) with pure obsidian text (`#030712`), Space Grotesk medium font, 4px corner radius. On hover, shifts to an intense photon glow (`box-shadow: 0 0 20px rgba(0, 240, 255, 0.6)`).
- **Ghost Hydro Button**: Transparent background, hairline border (`1px solid rgba(0, 240, 255, 0.3)`), pristine white text. On hover, background fills with `rgba(0, 240, 255, 0.08)`.
- **Coordinate Trigger**: Monospace micro-button with subtle brackets `[ 48°52.6′S 123°23.6′W ]` that flash cyan when engaged.

### Chips & Badges
- Micro-sized status indicators in `JetBrains Mono` uppercase with an embedded pulsing live-status dot (bioluminescent green for nominal, electric cyan for active telemetry, deep amber for pressure anomalies). Bordered with subtle `rgba(255, 255, 255, 0.1)` on dark translucent bases.

### Lists & Data Tables
- Bathymetric data tables with hairline horizontal borders (`rgba(255, 255, 255, 0.05)`). Rows feature hover highlights using `rgba(0, 240, 255, 0.03)` alongside a dynamic primary cyan coordinate indicator on the leading edge.

### Checkboxes & Radio Buttons
- Precision square checkboxes with a 2px radius and dark indigo base. Checked states exhibit a solid electric cyan fill with a high-contrast dark navy checkmark. Radios employ concentric circle radar-crosshair styling.

### Input Fields
- Understated technical inputs: dark navy backgrounds (`#0B132B`), 1px muted slate borders, and crisp white inputs. On focus, the field border transitions to solid cyan with a faint ambient backlight glow, accompanied by a monospace coordinate tag pinned to the top-right corner.

### Cards & Telemetry Pods
- Modular, glassmorphic instrumentation modules. Each card features an optional top metadata header with coordinate markers, an explicit depth gauge track, and fine structural crosshairs along the perimeter.