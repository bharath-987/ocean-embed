---
title: Kyogre Backend
emoji: 🌊
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Kyogre Backend — OceanEmbed AI Subsurface Temperature Inference Engine

High-resolution 3D ocean temperature reconstruction engine for the North Indian Ocean (5.0°N–30.0°N, 45.0°E–105.0°E) down to 1,000 meters depth across 15 standard oceanographic depth levels.

## Overview
This Space hosts the containerized FastAPI inference service powered by the OceanEmbed CNN-LSTM deep learning model. The service ingests multi-satellite surface observations (SST, SSS, SSH, SLA, surface current vectors, and wind vectors) over a 10-day lookback window to reconstruct 3D vertical temperature profiles, mixed layer depth (MLD), ocean heat content ($OHC_{300}$), thermocline depth, and acoustic sound velocity profiles.

## Space Configuration
- **SDK**: Docker (`python:3.11-slim`)
- **Port**: `7860`
- **User**: Non-root UID `1000` (`user`)
- **Dataset Mode**: `USE_FULL_FLOAT16_DATA=true` (continuous 1,095 days covering 2021-01-01 through 2023-12-31)
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
- `GET /argo/profiles` — Catalog of independent in-situ ARGO profiling float surfacings.
- `GET /argo/compare` — Point-by-point validation metrics (RMSE, Bias, Pearson correlation) comparing AI predictions against in-situ ARGO observations.
- `GET /argo/summary` — Aggregate basin-wide validation statistics.
