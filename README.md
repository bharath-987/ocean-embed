---
title: Kyogre Backend
emoji: 🌊
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Kyogre — AI Digital Twin of the North Indian Ocean
*(formerly OceanEmbed)*

High-resolution 3D ocean temperature reconstruction engine for the North Indian Ocean (5.0°N–30.0°N, 45.0°E–105.0°E), resolving vertical structure down to 1,000 meters across 15 standard oceanographic depth levels.

## Quickstart
```bash
# Windows
start.bat

# Linux / macOS
bash start.sh
```
See [SETUP.md](SETUP.md) for full environment setup, dependency installation, and troubleshooting.

## Overview
This Space hosts the containerized FastAPI inference service powered by the Kyogre CNN-LSTM deep learning model. The service ingests a 13-channel spatiotemporal tensor across a 10-day lookback window—comprising 7 physical surface anomaly fields (SST anomaly, SSS anomaly, SSH anomaly, zonal and meridional current anomalies, and zonal and meridional wind anomalies) combined with 6 cyclical spatiotemporal coordinate and seasonal encodings (sine and cosine of latitude, longitude, and day-of-year)—to reconstruct 3D vertical temperature profiles down to 1,000 meters across 15 standard oceanographic depth levels, mixed layer depth (MLD), ocean heat content (OHC₃₀₀), thermocline depth, and acoustic sound velocity profiles.

## Frontend Modules
The project includes four interactive web dashboard modules:

| Module | File | Description |
|--------|------|-------------|
| **Ocean Explorer** | `explore.html` | Main 2D map with subsurface temperature heatmap, TVD table/graph, and 4 stat cards (MLD, OHC₃₀₀, Sound Velocity Depth, D20 Isotherm). Gated: heatmap needs Date + Depth; TVD/stat cards need Location + Date. |
| **Fisheries Intelligence** | `fisheries.html` | Chlorophyll-a proxy raster, PFZ scoring overlay, fishing zone analysis table, and upwelling index for the North Indian Ocean. All values are estimated heuristics derived from surface anomaly fields. |
| **Marine Ecology** | `marine-ecology.html` | Marine Heatwave (MHW) event detection, category classification (Moderate → Extreme), duration tracking, and peak intensity estimates for each grid cell. |
| **ARGO Validation** | `argo.html` | Independent validation dashboard comparing Kyogre predictions against in-situ ARGO profiling float observations with RMSE, Bias, Pearson correlation, and basin-wide skill scores. |

## Space Configuration
- **SDK**: Docker (`python:3.11-slim`)
- **Port**: `7860`
- **User**: Non-root UID `1000` (`user`)
- **Dataset Mode**: `USE_FULL_FLOAT16_DATA=true` (continuous 1,095 days covering 2021-01-11 through 2023-12-31)
- **Dataset Repository**: [`bharath-987/ocean-embed-data`](https://huggingface.co/datasets/bharath-987/ocean-embed-data)

## Environment Variables & Space Secrets
The following environment variables are pre-configured in the `Dockerfile`:
- `USE_FULL_FLOAT16_DATA=true`: Enables continuous daily float16 dataset access for 2021–2023.
- `HF_DATASET_REPO_ID="bharath-987/ocean-embed-data"`: Target Hugging Face dataset repository for automatic streaming fetch.
- `PORT=7860`: Hugging Face Space HTTP port.

Optional Space Secrets:
- `HF_TOKEN`: (Optional) Hugging Face User Access Token, only required if accessing private dataset repositories.

## API Endpoints
- `GET /health` — Service health and active data mode telemetry (`trimmed`, `full_float16`).
- `POST /predict` — 15-depth vertical temperature profile and oceanographic indices for a coordinate and date.
- `GET /temperature-grid` — 2D spatial temperature grid (101×241 cells) at requested depth and date.
- `GET /parameter-grid` — Surface parameter grids (`sst`, `ssh`, `sss`, `sla`, `current`, `wind`).
- `GET /confidence-grid` — Spatial confidence/uncertainty grid at requested depth and date.
- `GET /confidence-stats` — Basin-wide confidence statistics summary.
- `GET /argo/profiles` — Catalog of independent in-situ ARGO profiling float surfacings.
- `GET /argo/compare` — Point-by-point validation metrics (RMSE, Bias, Pearson correlation) comparing AI predictions against in-situ ARGO observations.
- `GET /argo/summary` — Aggregate basin-wide validation statistics.
- `GET /argo/skill-score` — Climatology-relative skill scores (SS > 0 = beats persistence/climatology).
- `GET /pfz-grid` — Potential Fishing Zone index grid derived from surface anomaly composites.
- `POST /marine-heatwave` — Trigger marine heatwave event detection for a region and date range.
- `GET /marine-heatwave` — Retrieve cached marine heatwave detection results.
