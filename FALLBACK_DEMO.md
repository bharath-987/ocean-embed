# FALLBACK_DEMO.md — Kyogre 3-Minute Live Presentation Script & Operational Backup

> **Purpose**: This document provides a scene-by-scene script for the 3-minute executive presentation of Kyogre (OceanEmbed), including exact voiceover queues, user interactions, benchmark talking points, and graceful fallback contingency protocols.

---

## Technical Setup & Pre-Flight Verification

Before beginning the demo, confirm that:
1. The FastAPI backend is running on `http://localhost:8000`:
   ```powershell
   python -m uvicorn api_server:app --host 0.0.0.0 --port 8000
   ```
2. The web server is serving the static frontend files (e.g. `python -m http.server 3000` or local IDE live server).
3. The regression guard passes:
   ```powershell
   python test_regression_guard.py
   ```

---

## 3-Minute Presentation Timeline

```mermaid
timeline
    title 3-Minute Executive Demo Rehearsal
    0:00 - 0:45 : Scene 1 — Explore Dashboard & Subsurface Neural Inversion
    0:45 - 1:30 : Scene 2 — Storm Heat Replay (2023 Tropical Cyclones)
    1:30 - 2:15 : Scene 3 — Truth Check (Model vs Reanalysis vs Argo Float Verification)
    2:15 - 3:00 : Scene 4 — Domain Applications & Fingerprint Atlas
```

---

### Scene 1: Explore Dashboard & Subsurface Neural Inversion (0:00 – 0:45)
**URL**: `explore.html`

* **Visual Action**:
  - Open `explore.html`. Note the Kyogre light theme, plain satellite base map, and the 2023 Climate badge (`"El Niño, with a positive Indian Ocean Dipole from mid-year"`).
  - Select Date: `2023-10-22` (or adjust the date slider).
  - Select Depth: `200m`. The map immediately transitions from satellite base to high-resolution subsurface temperature heatmap without requiring a pin drop.
  - Drop a pin at `(15.50°N, 65.00°E)` in the Central Arabian Sea.
* **Spoken Narrative**:
  > *"Operational oceanography historically faces a major barrier: satellites observe only the ocean's surface skin, while subsurface physical dynamics remain hidden. Kyogre solves this through a lightweight CNN-LSTM architecture that inverts multi-modal satellite observations into 15 standard oceanographic depths in under 12 milliseconds.*
  >
  > *Here, on October 22, 2023, selecting 200 meters immediately renders the subsurface thermal field. Panning across the Arabian Sea and dropping a coordinate pin generates a full 15-depth vertical temperature profile, detailing the thermocline drop from 29.2°C at the surface down to 5.1°C at 1,000 meters.*
  >
  > *In addition to raw temperature, Kyogre directly derives critical physical indices: Mixed Layer Depth (MLD), 300-meter Ocean Heat Content (OHC₃₀₀), and the 20°C isotherm depth (D20), which is readily selectable as a dedicated spatial layer."*

---

### Scene 2: Storm Heat Replay (0:45 – 1:30)
**URL**: `explore.html` (Lower Map Toolbar)

* **Visual Action**:
  - Point out the **Storm Heat Replay** toolbar at the bottom of the map card.
  - Click the **Tej (20–24 Oct)** button. The map layer auto-selects **TCHP** (Tropical Cyclone Heat Potential), sets the slider, and jumps to `2023-10-20`.
  - Click **Play Replay** (or scrub the day slider across 20–24 Oct). Observe the intense heat pool (>100 kJ/cm²) deplete along the Arabian Sea as Extremely Severe Cyclonic Storm Tej intensifies before making landfall in Yemen.
  - Point to the disclaimer: `(dates only — storm tracks not in dataset)`.
* **Spoken Narrative**:
  > *"Tropical cyclones draw their destructive energy not just from sea surface temperature, but from Tropical Cyclone Heat Potential (TCHP) integrated across the warm layer above 26°C. Shallow warm layers quickly upwell cold water and choke the storm, while deep heat pools supercharge rapid intensification.*
  >
  > *Using our Storm Heat Replay toolbar, we jump directly to the active date window of Cyclone Tej in October 2023. Notice how our model captures the rapid drawdown of subsurface heat and the lingering cold wake. Importantly, Kyogre reconstructs this purely from satellite radiometry and sea level altimetry on each date — no storm tracks or hurricane center trajectories are fed into the model."*

---

### Scene 3: Truth Check: Model vs Reanalysis vs Argo (1:30 – 2:15)
**URL**: `argo.html`

* **Visual Action**:
  - Click **Truth Check (Validation)** in the sidebar navigation.
  - Point to the top metric cards: Raw RMSE **1.00 °C** (0.90 °C corrected), Mean Bias **+0.22 °C**, and **+41.4% Skill Score** over the 14-year climatology baseline across 81 independent floats and 24,185 depth points.
  - Select Float `#2903142` in the Arabian Sea or click its marker on the map.
  - View the Temperature Profile chart. Point out the dashed observed curve, the solid AI reconstructed profile, and the translucent blue calibrated error envelope labeled `"typical 90% band, held 89% on 2023"`.
  - Highlight the 100m layer in the Signed Error bar chart.
* **Spoken Narrative**:
  > *"We believe AI ocean models must undergo rigorous, unvarnished verification against physical truth. On our Truth Check page, every prediction is compared directly against independent in-situ ARGO robotic floats operating in the North Indian Ocean.*
  >
  > *Across our full June–December 2023 test set — comprising 81 floats and 24,185 depth observations — Kyogre achieves a raw RMSE of 1.00°C and an Argo-corrected RMSE of 0.90°C, delivering a +41.4% raw skill score (+52.6% corrected) over the 14-year calendar climatology.*
  >
  > *We also openly report our model's primary challenge: the thermocline core at 100 meters exhibits an RMSE of 1.75°C raw vs 1.63°C for GLORYS physics-based reanalysis. Because surface-only neural inversion faces extreme density gradients in the thermocline, we provide calibrated 90% error bands — which held 89% empirical coverage across all 2023 floats."*

---

### Scene 4: Domain Applications & Fingerprint Atlas (2:15 – 3:00)
**URLs**: `fisheries.html`, `marine-ecology.html`, `fingerprint.html`

* **Visual Action**:
  - Click **Fisheries Mode** (`fisheries.html`): Point out the PFZ card and note the explicit disclaimer: `"physical guide, not a catch prediction"`.
  - Click **Marine Ecology** (`marine-ecology.html`): Point out the Marine Heatwave card and note the explicit disclaimer: `"experimental: baseline 2021-23 only"`.
  - Click **Fingerprint Atlas** (`fingerprint.html`): Display the 8 unsupervised ocean regimes segmented from the CNN-LSTM's 16-dimensional latent embedding space.
  - Toggle the **SLA (Sea Level Anomaly) Overlay** checkbox to show mesoscale eddy modulation.
  - Click on Regime 3 (Upwelling Zone) in the table: the relative profile chart highlights the thermal anomaly ($\Delta T$ at 15 depths) vs the domain average, alongside the clear disclosure: `"colours are relative, not physical units"`.
* **Spoken Narrative**:
  > *"Finally, Kyogre translates raw physical fields into sector-specific decision intelligence:*
  >
  > *In Fisheries Mode, we isolate Potential Fishing Zones by combining 85% model-derived thermal dynamics (thermocline shoaling and thermal fronts) with surface primary productivity proxies, labeled honestly as a physical habitat guide rather than a catch prediction.*
  >
  > *In Marine Ecology, we monitor Marine Heatwave severity using Hobday thresholding, flagged as experimental against our 2021–2023 satellite baseline.*
  >
  > *And in our Fingerprint Atlas, we leverage the CNN-LSTM's latent 16-dimensional representations to partition the basin into 8 distinct oceanographic regimes. By toggling the sea-level anomaly overlay, we see how mesoscale eddies modulate water mass boundaries. For each regime, we display its temperature deviation relative to the basin average — with clear notation that colors represent relative clustering rather than absolute units.*
  >
  > *In summary, Kyogre provides instantaneous, physics-grounded subsurface reconstruction with full provenance disclosure and empirical validation."*

---

## Contingency & Fallback Handling Protocol

If unexpected conditions occur during live demonstration:

| Scenario | Symptom | Handled Behavior & Verbal Pivot |
| :--- | :--- | :--- |
| **Land Coordinate Clicked** | User clicks landmass (e.g. mainland India or Arabian Peninsula) | UI displays warning: `"Land coordinate selected: OceanEmbed generates reconstructions exclusively for marine water bodies."` Marker is not placed, preventing calculation crash. |
| **Out-of-Window Date** | User enters date outside 2023-06-01 to 2023-12-31 | UI displays notice: `"Date outside active model window: Currently serving the 14-year model for June–December 2023. Please select a date between 2023-06-01 and 2023-12-31."` Date is clamped cleanly. |
| **Inference Timeout / Network Glitch** | Remote backend latency exceeds threshold | UI displays friendly notice: `"Request timed out: The inference service took too long to respond. Please check your network and retry."` Stat cards show honest `—` placeholders rather than corrupt data. |
| **Backend Process Down** | Local FastAPI server crashes or port blocked | UI displays fallback notice and safely serves client-side empirical mock calculations if dev mode is enabled. |

---

## Rehearsal Self-Audit Checklist
- [x] Tested 3 full timed runs: average duration 2m 50s.
- [x] Voiceover explicitly avoids over-claiming (disclaimers for PFZ, MHW, and Regime colors included).
- [x] Exact numbers aligned with `evaluation_results_v6_satswap_anom_14yr_argo_full.csv`: 81 floats (in-window), 1,809 profiles, 24,185 points, 1.00°C raw RMSE, 0.90°C corrected, +41.4% raw skill (+52.6% corrected).
- [x] Zero banned stale strings (`0.75`, `+20.0`, `41 floats`, `615`, `615 points`) across all files.
