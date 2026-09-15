# Kyogre — AI Digital Twin of the North Indian Ocean

> **High-resolution 3D subsurface ocean temperature reconstruction, marine heatwave tracking, and potential fishing zone intelligence from satellite remote sensing alone.**

---

## 1. Executive Summary & Tagline

* **Project Name**: **Kyogre** *(formerly OceanEmbed)*
* **Tagline**: *Reconstructing the hidden depths of the North Indian Ocean from satellite surface observations.*
* **Geographic Domain**: North Indian Ocean ($5.0^\circ\text{N}\text{ to }30.0^\circ\text{N}$, $45.0^\circ\text{E}\text{ to }105.0^\circ\text{E}$) spanning the Arabian Sea, Bay of Bengal, Equatorial Indian Ocean, and Andaman Sea on a $0.25^\circ \times 0.25^\circ$ spatial grid ($101 \times 241$ cells).
* **Vertical Domain**: Surface down to **1,000 meters depth** across 15 standard oceanographic depth levels: `[0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000] meters`.
* **Temporal Coverage**: Continuous daily reanalysis across 2021–2023 (1,095 days; valid model inferences begin January 11, 2021 following the required 10-day lookback window).

---

## 2. The Problem

1. **The Subsurface Data Void**: Satellites provide comprehensive, high-frequency imaging of the ocean's surface, but optical and infrared radiometers cannot penetrate more than a few millimeters into the water column. In-situ ocean measurement platforms (e.g., shipboard CTD casts, moored buoys, and drifting ARGO floats) are physically sparse, logistically expensive to deploy, vulnerable to harsh monsoonal conditions, and often operate on delayed multi-day surfacing cycles.
2. **Computational Barriers of Traditional Circulation Models**: Traditional physical ocean general circulation models (e.g., ROMS, MOM6, HYCOM) require supercomputing clusters, complex numerical boundary conditions, and hours of computation per single forecast day, making real-time, interactive exploration prohibitively expensive.
3. **Disconnected Marine Decision-Making**: Coastal communities, tuna fisheries, acoustic defense planners, and marine ecologists lack an integrated, instant tool that translates raw physical variables into domain-specific intelligence—such as thermocline shoaling, acoustic shadow zones, and marine heatwave thresholds.

---

## 3. The Solution (Plain-Language Overview)

Kyogre acts as a **virtual CTD sensor drop** anywhere in the North Indian Ocean. A user simply picks a point on an interactive satellite map and selects a date:

* **Instant Depth Profiling**: Kyogre peers beneath the waves, reconstructing the full vertical temperature profile down to 1,000 meters in milliseconds using surface satellite observations alone (sea surface temperature, sea surface height, salinity, ocean currents, and winds).
* **Decoupled Basin Exploration**: Users can peel back the ocean layer-by-layer, viewing 2D temperature heatmaps at any depth (e.g., 50m, 200m, 1,000m) or switching between satellite surface parameter layers.
* **Specialized Operational Modules**:
  1. **Fisheries Mode**: Identifies Potential Fishing Zones (PFZs) by tracking thermocline shoaling, upwelling signatures, and biological primary production proxies where pelagic fish congregate.
  2. **Marine Ecology & Heatwave Mode**: Automatically detects, categorizes, and visualizes Marine Heatwaves (MHWs) using the standardized Hobday et al. (2016) framework to monitor thermal stress on coral reefs and pelagic ecosystems.
  3. **ARGO Ground-Truth Validation**: Directly compares AI predictions against 41 independent, in-situ ARGO profiling floats, providing side-by-side vertical profile graphs, signed depth error distributions, and empirical skill score metrics.

---

## 4. Key Technical Highlights

### 4.1 Deep Learning Architecture (`OceanEmbedModel`)
* **55,247 Trainable Parameters**:
  * **Spatial Feature Extraction (`SurfaceEncoder`)**: Dilated 2D Convolutional neural network (receptive field expanded via dilation rate 2) extracting mesoscale thermal fronts, eddies, and spatial anomalies without spatial downsampling artifacts.
  * **Temporal Sequence Modeling (`TemporalModel`)**: Sequence-to-one LSTM network evaluating a **10-day rolling lookback window** ($t-9$ to $t$) to capture baroclinic wave propagation, wind-driven mixing, and heat transport dynamics. Chunked batch evaluation prevents memory spikes.
  * **Depth Projection (`DepthPredictor`)**: Multi-layer perceptron mapping latent spatiotemporal ocean representations into 15 discrete depth anomaly predictions.
* **13-Channel Input Spatiotemporal Tensor**:
  * 7 Physical Surface Anomaly Fields: Sea Surface Temperature Anomaly ($SST_{\text{anom}}$), Sea Surface Salinity Anomaly ($SSS_{\text{anom}}$), Sea Surface Height Anomaly ($SSH_{\text{anom}}$), Zonal & Meridional Surface Current Anomalies ($u, v_{\text{cur}}$), and Zonal & Meridional 10m Wind Anomalies ($u, v_{\text{wind}}$).
  * 6 Cyclical Spatial & Seasonal Encodings: $\sin(\text{lat})$, $\cos(\text{lat})$, $\sin(\text{lon})$, $\cos(\text{lon})$, $\sin(\text{doy})$, $\cos(\text{doy})$.

### 4.2 Thermodynamically Consistent Post-Processing Pipeline
* **Discrepancy-Tapered Surface Blending**: Dynamically blends satellite skin SST with bulk model predictions ($\alpha \in [0.30, 0.60]$) and diffuses 50% of the surface adjustment into the 5m layer to ensure continuity.
* **PAVA Isotonic Regression Safety-Net**: Enforces thermodynamic non-increasing stability ($T(z_i) \ge T(z_{i+1})$) across the upper mixed layer ($\le 100\text{m}$) using the Pool Adjacent Violators Algorithm, while strictly leaving depths $> 100\text{m}$ unconstrained to preserve real physical subsurface thermal inversions (e.g., warm Red Sea Outflow Water).

### 4.3 Rigorous In-Situ ARGO Float Validation & Skill Score
Validated against **41 independent in-situ ARGO profiling floats** (615 depth observation points) distributed across the Arabian Sea, Bay of Bengal, Equatorial Indian Ocean, and Andaman Sea:
* **Overall Benchmark Skill Score**: **$+45.9\%$ improvement over climatology** ($SS = 1 - \frac{\text{RMSE}_{\text{model}}^2}{\text{RMSE}_{\text{climatology}}^2}$).
* **Basin-Wide Performance**:
  * **Bay of Bengal**: **$+57.0\%$ Skill** ($\text{RMSE}_{\text{model}} = 1.07^\circ\text{C}$ vs. $\text{RMSE}_{\text{clim}} = 1.64^\circ\text{C}$).
  * **Arabian Sea**: **$+52.0\%$ Skill** ($\text{RMSE}_{\text{model}} = 1.11^\circ\text{C}$ vs. $\text{RMSE}_{\text{clim}} = 1.60^\circ\text{C}$).
  * **Equatorial Indian Ocean**: **$+34.8\%$ Skill** ($\text{RMSE}_{\text{model}} = 1.93^\circ\text{C}$ vs. $\text{RMSE}_{\text{clim}} = 2.39^\circ\text{C}$).
  * **Andaman Sea**: **$+19.9\%$ Skill** ($\text{RMSE}_{\text{model}} = 1.23^\circ\text{C}$ vs. $\text{RMSE}_{\text{clim}} = 1.37^\circ\text{C}$).
* **Depth-Wise Accuracy**:
  * Surface (0–10m): $\text{RMSE} \approx 1.12^\circ\text{C}\text{–}1.16^\circ\text{C}$ (**$>71\%$ Skill**).
  * Intermediate & Deep Ocean (500–1000m): $\text{RMSE} \approx 0.61^\circ\text{C}\text{–}0.81^\circ\text{C}$.

### 4.4 Real-Time Derived Oceanographic Indices
* **Mixed Layer Depth (MLD)**: Computed via de Boyer Montégut (2004) criteria ($\Delta T = 0.2^\circ\text{C}$ threshold relative to 10m reference depth).
* **Ocean Heat Content ($OHC_{300}$)**: Absolute thermal energy integration down to 300m ($OHC_{300} = \rho c_p \int_0^{300} T(z) dz \approx 1,800\text{–}2,600\text{ kJ/cm}^2$).
* **Acoustic Shadow Depth / Sonic Layer Depth (SLD)**: Computed using the Mackenzie (1981) 9-term sound velocity equation to determine sound channel axis and surface duct boundaries.
* **$D_{20}$ Isotherm Depth**: Precise linear interpolation of the $20^\circ\text{C}$ thermocline boundary layer.

---

## 5. Target Users & Real-World Use Cases

| User Group | Operational Challenge | How Kyogre Solves It |
| :--- | :--- | :--- |
| **Commercial Tuna & Pelagic Fisheries** | High fuel expenditure searching for migratory pelagic schools in open seas. | Provides dynamic PFZ index maps, cluster centroid coordinates, and thermocline shoaling indicators to pinpoint feeding fronts. |
| **Naval Operations & Sonar Acoustics** | Subsurface acoustic shadow zones hide underwater objects from hull-mounted active sonar. | Computes sound velocity profiles (SVP) and Sonic Layer Depth (SLD) to identify acoustic refraction channels. |
| **Marine Ecologists & Coral Conservators** | Unmonitored thermal accumulation triggers sudden mass bleaching events. | Detects, alerts, and classifies Marine Heatwaves (Categories I–IV) under the Hobday (2016) methodology with duration tracking. |
| **Meteorological & Oceanographic Centers** | Sparse buoy networks leave large observational gaps during cyclone intensification seasons. | Generates synthetic CTD profiles and $OHC_{300}$ estimates across the entire basin on demand. |

---

## 6. Current Operational Status

* **Status**: **Fully Built, Tested & Deployed**.
* **Frontend Modules**:
  * `explore.html`: Interactive MapLibre dashboard with decoupled depth heatmaps, vector stream advection, and point TVD panel.
  * `fisheries.html`: Fisheries Mode with dynamic PFZ cluster identification, speech-bubble zone cards, and 3-column vertical profiles.
  * `marine-ecology.html`: Marine Heatwave monitoring dashboard with time-series envelope charts and category badges.
  * `argo.html`: Empirical validation center with 41 real ARGO float trajectories, side-by-side profile and error charts, and skill benchmarks.
* **Inference Speeds**:
  * Cold Start (CPU): $\sim 1.2\text{ seconds}$ per full basin grid ($101 \times 241$ cells across 15 depths).
  * Cached / Hot Inferences: **$< 1.5\text{ ms}$** execution time.
* **Verification Matrix**:
  * Master Python verification suite (`test_system.py`): **100% PASS**.
  * Specialized test suites (`test_argo_page.js`, `test_fisheries.js`, `test_marine_ecology.js`, `test_interactions.js`, `test_region_mask.js`): **100% PASS** across $>350$ assertions.

---

## 7. Tech Stack Summary

* **Machine Learning & Core Backend**: Python 3.11, PyTorch 2.0+ (optimized CPU inference), NumPy (`mmap_mode='r'`), Pandas.
* **Web Services & API**: FastAPI, Uvicorn, Pydantic, CORS Middleware.
* **Data Sources & Pipelines**: Hugging Face Hub dataset streaming (`bharath-987/ocean-embed-data`), Argovis ARGO GDAC in-situ floats, Natural Earth coastlines.
* **Client & UI Architecture**: Modern vanilla ES6+ JavaScript, HTML5 Canvas 2D raster engine, MapLibre GL JS v4.7.1, Chart.js v4.4.3, custom Kyogre light theme CSS design system.
* **Deployment & Containers**: Docker containerized (`python:3.11-slim`, non-root user UID 1000) for Hugging Face Spaces (Port 7860) and cloud application platforms (Render).
