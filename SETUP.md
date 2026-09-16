# OceanEmbed — Local Setup & Deployment Guide

Welcome to **OceanEmbed** (Kyogre Dashboard). This guide provides everything needed to clone, configure, and run both the FastAPI ML inference backend and the MapLibre frontend dashboard on your local machine.

---

## 1. Prerequisites

Ensure you have the following installed:
- **Python 3.10 – 3.12**: [Download Python](https://www.python.org/downloads/) (tick "Add python.exe to PATH" on Windows).
- **Node.js 18+ & npm**: [Download Node.js](https://nodejs.org/) (for serving the client dashboard).
- **Git**: [Download Git](https://git-scm.com/).

---

## 2. Clone the Repository

```bash
git clone https://github.com/bharath-987/ocean-embed.git
cd ocean-embed
```

---

## 3. Backend Setup (FastAPI & PyTorch)

### Step 3.1: Create and Activate Virtual Environment

**On Windows (PowerShell / Command Prompt):**
```powershell
python -m venv backend/venv
.\backend\venv\Scripts\activate
```

**On Linux / macOS:**
```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
```

### Step 3.2: Install Python Dependencies

```bash
pip install -r backend/requirements.txt
```

> **Packages installed**: `torch`, `numpy<2.0`, `pandas`, `fastapi`, `uvicorn[standard]`, `pydantic`.

### Step 3.3: Environment Variables (`.env`)
No environment variables or API keys are required for default operation. All paths are automatically resolved relative to `backend/`.

Optional environment variables:
- `ENABLE_INFERENCE_CACHE`: (Default: `true`) Controls startup pre-warming and runtime in-memory LRU prediction caching. Set to `false` to disable caching and force live PyTorch CNN-LSTM inference on every request (ideal for profiling, benchmarking, and rigorous accuracy verification).
- `MIN_BASIN_SAMPLE_SIZE`: (Default: `10`) Minimum sample size required per sub-basin for statistical reporting in ARGO skill evaluations.
- `USE_FULL_FLOAT16_DATA`: (Default: `true` if `backend/data/float16/` exists) Toggle full 3-year (2021–2023) continuous float16 dataset mode vs trimmed mode.
- `HF_DATASET_REPO_ID`: Target Hugging Face repository for automated remote array streaming fallback.
- `HF_TOKEN`: Optional Hugging Face access token for private dataset repositories.

---

## 4. Dataset Files & Model Weights

### Included in the Git Repository:
- **PyTorch Model Checkpoint**: `backend/model_v6_satswap_anom_best.pt` (~275 KB, 27 channels, 65,967 params; `backend/model_v4_dilated_checkpoint_epoch30.pt` retained as local fallback)
- **ARGO Floats Database**: `backend/data/argo_profiles.json` (~65 KB)

### Large Binary Datasets (`.npy` files):
Because GitHub enforces a strict **100MB per-file limit** and Git LFS free tier is capped at 2GB, the large precomputed numerical grids (~6.24 GB total) are excluded from git via `.gitignore`:

| Filename | Description | Size | Location |
|---|---|---|---|
| `temp_target_clim.npy` | 3-year baseline subsurface climatology (15 depths, 0.25° grid) | ~4.07 GB | `backend/data/` |
| `sst.npy` | Absolute Daily Sea Surface Temperature (SST) | ~271 MB | `backend/data/` |
| `sst_anom.npy` | SST Anomaly | ~271 MB | `backend/data/` |
| `sss_anom.npy` | Sea Surface Salinity (SSS) Anomaly | ~271 MB | `backend/data/` |
| `ssh_anom.npy` | Sea Surface Height (SSH) Anomaly | ~271 MB | `backend/data/` |
| `u_cur_anom.npy` | Zonal Surface Current Anomaly | ~271 MB | `backend/data/` |
| `v_cur_anom.npy` | Meridional Surface Current Anomaly | ~271 MB | `backend/data/` |
| `u_wind_anom.npy` | Zonal Surface Wind Anomaly | ~271 MB | `backend/data/` |
| `v_wind_anom.npy` | Meridional Surface Wind Anomaly | ~271 MB | `backend/data/` |

> **How to get the `.npy` files**:
> 1. Download the `data/` folder archive from the project team's shared cloud drive (Google Drive / OneDrive / S3 shared by your teammate).
> 2. Extract the 9 `.npy` files directly into `ocean-embed/backend/data/`.

---

## 5. Running the Application

### Option A: Automated One-Command Startup

**On Windows:**
Double-click or run:
```powershell
.\start.bat
```

**On Linux / macOS:**
```bash
chmod +x start.sh
./start.sh
```

The script automatically:
1. Launches the FastAPI backend on `http://localhost:8000` with demo cache pre-warming.
2. Starts the frontend web server on `http://localhost:5500`.
3. Opens `http://localhost:5500/explore` in your browser.

---

### Option B: Manual Startup (Two Terminals)

**Terminal 1 — Backend (FastAPI ML Server):**
```bash
cd backend
python -m uvicorn api_server:app --host 0.0.0.0 --port 8000
```
*Wait ~1.5 seconds for startup cache pre-warming across the 4 live demo dates.*

**Terminal 2 — Frontend:**
```bash
# From repository root:
npm install
npm run dev
# Or with any static web server:
# npx serve -l 5500 .
```

---

## 6. Accessing the Modules

Once running, navigate to:
- **Kyogre Explore & Inference Dashboard**: [`http://localhost:5500/explore.html`](http://localhost:5500/explore.html)
- **ARGO Float Validation & Comparison**: [`http://localhost:5500/argo.html`](http://localhost:5500/argo.html)
- **Fisheries Advisory & PFZ Explorer**: [`http://localhost:5500/fisheries.html`](http://localhost:5500/fisheries.html)
- **FastAPI Interactive Swagger Docs**: [`http://localhost:8000/docs`](http://localhost:8000/docs)

---

## 7. Verifying the System

To verify that all components are functioning correctly:

```bash
# 1. Run backend and system integration tests:
python test_system.py

# 2. Run frontend functional and regression test suites:
node test_argo_page.js
node test_d20_card.js
node test_interactions.js
node test_region_mask.js
node test_fisheries.js
node test_error_component.js
node test_start_script.js
```
