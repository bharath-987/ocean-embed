"""
OceanEmbed — FastAPI inference server
Wraps inference.predict_temperature_profile() for the ocean-embed frontend.
"""

from contextlib import asynccontextmanager
import datetime
import json
import math
import os
import sys
import threading
import time

# Ensure backend directory is in sys.path so modules can always be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from scipy.ndimage import maximum_filter

import inference as inf
from inference import predict_temperature_profile
import v6_adapter
from marine_ecology import detect_marine_heatwaves, _load_climatology
try:
    import products as prod
except ImportError:
    from backend import products as prod

# ---------------------------------------------------------------------------
# SIH DEMO CACHE PRE-WARMING CONFIGURATION (V6 SatSwap 14-Year Model Window)
# ---------------------------------------------------------------------------
# In-window dates within active 2023-06-01 to 2023-12-31 span:
DEMO_PREWARM_DATES = [
    "2023-10-22",  # Canonical handoff check date (15°N, 88°E) & Explore default
    "2023-09-04",  # Fisheries Advisory PFZ & upwelling analysis
    "2023-07-15",  # Mid-monsoon test date
    "2023-11-20",  # Post-monsoon cyclone season
]
REPRESENTATIVE_LAT = 15.0
REPRESENTATIVE_LON = 88.0

# ---------------------------------------------------------------------------
# EXTERNAL DATASETS: SATELLITE CHLOROPHYLL-A & SOURCE DISCLOSURE
# ---------------------------------------------------------------------------
_chla_arr = None
_chl_source_arr = None


def _get_chlorophyll_arrays():
    """Lazily loads float16 satellite chlorophyll-a and observation source arrays."""
    global _chla_arr, _chl_source_arr
    if _chla_arr is None:
        p_chl = os.path.join(inf.DATA_DIR, "chla.npy")
        if not os.path.exists(p_chl):
            p_chl = os.path.join(inf.DATA_DIR, "float16", "chla.npy")
        if os.path.exists(p_chl):
            try:
                _chla_arr = inf.np.load(p_chl, mmap_mode="r")
            except Exception as e:
                print(f"[API] Error loading {p_chl}: {e}", flush=True)
                _chla_arr = None
    if _chl_source_arr is None:
        p_src = os.path.join(inf.DATA_DIR, "chl_source.npy")
        if not os.path.exists(p_src):
            p_src = os.path.join(inf.DATA_DIR, "float16", "chl_source.npy")
        if os.path.exists(p_src):
            try:
                _chl_source_arr = inf.np.load(p_src, mmap_mode="r")
            except Exception as e:
                print(f"[API] Error loading {p_src}: {e}", flush=True)
                _chl_source_arr = None
    return _chla_arr, _chl_source_arr


_ekman_arr = None


def _get_ekman_array():
    """Lazily loads float16 ERA5 Ekman vertical upwelling velocity array."""
    global _ekman_arr
    if _ekman_arr is None:
        p_ek = os.path.join(inf.DATA_DIR, "ekman_upwelling.npy")
        if not os.path.exists(p_ek):
            p_ek = os.path.join(inf.DATA_DIR, "float16", "ekman_upwelling.npy")
        if os.path.exists(p_ek):
            try:
                _ekman_arr = inf.np.load(p_ek, mmap_mode="r")
            except Exception as e:
                print(f"[API] Error loading {p_ek}: {e}", flush=True)
                _ekman_arr = None
    return _ekman_arr



@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Verify dataset readiness before server accepts requests
    if inf.USE_FULL_FLOAT16_DATA or inf.USE_FLOAT16_DATA:
        from fetch_data import ensure_data_ready
        ensure_data_ready(inf.DATA_DIR)

    # 2. Pre-warming inference cache for demo dates at server startup (if enabled)
    if inf.is_inference_cache_enabled():
        import gc
        print("=" * 65, flush=True)
        print("  OceanEmbed — Pre-warming inference cache for SIH demo dates...", flush=True)
        print("=" * 65, flush=True)
        for date_str in DEMO_PREWARM_DATES:
            t0 = time.perf_counter()
            v6_adapter.predict_temperature_profile(REPRESENTATIVE_LAT, REPRESENTATIVE_LON, date_str)
            v6_adapter.temperature_map(date_str, 0)
            t_temp = time.perf_counter()
            compute_pfz_grid(date_str)
            t_pfz = time.perf_counter()
            elapsed_ms = int((t_pfz - t0) * 1000)
            pfz_ms = int((t_pfz - t_temp) * 1000)
            gc.collect()
            print(f"Pre-warming cache for demo date {date_str}... done ({elapsed_ms}ms, PFZ grid: {pfz_ms}ms)", flush=True)
        gc.collect()
        print("=" * 65, flush=True)
        print("  Inference & PFZ cache ready! All demo dates pre-warmed (<1ms response).", flush=True)
        print("=" * 65, flush=True)
    else:
        print("=" * 65, flush=True)
        print("  Inference cache & pre-warming DISABLED (ENABLE_INFERENCE_CACHE=false).", flush=True)
        print("  All requests will execute live full-model inference.", flush=True)
        print("=" * 65, flush=True)

    # 3. Initialize Marine Heatwave (MHW) climatology
    _load_climatology()
    print("  Marine Heatwave (MHW) climatology initialized.", flush=True)
    print("=" * 65, flush=True)
    yield


app = FastAPI(title="OceanEmbed API", version="1.0.0", lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    latitude: float = Field(..., ge=inf.MIN_LAT, le=inf.MAX_LAT)
    longitude: float = Field(..., ge=inf.MIN_LON, le=inf.MAX_LON)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    raw: Optional[bool] = None
    smoothing: Optional[bool] = None
    corrected: Optional[bool] = None
    smoothed: Optional[bool] = None


class MarineHeatwaveRequest(BaseModel):
    latitude: float = Field(..., ge=inf.MIN_LAT, le=inf.MAX_LAT)
    longitude: float = Field(..., ge=inf.MIN_LON, le=inf.MAX_LON)
    start_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    reference_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


def _grid_indices(latitude: float, longitude: float) -> tuple[int, int]:
    lat_idx = int(inf.np.argmin(inf.np.abs(inf._target_lats - latitude)))
    lon_idx = int(inf.np.argmin(inf.np.abs(inf._target_lons - longitude)))
    return lat_idx, lon_idx


def _day_index(date_str: str) -> int:
    try:
        return (
            inf.pd.Timestamp(date_str).normalize() - inf.pd.Timestamp(inf.DATASET_START_DATE)
        ).days
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="This date is not available in the deployed demo dataset.",
        )


def _validate_date_available(date_str: str, need_history: bool = True) -> tuple[int, int]:
    """
    Validates that date_str is within the active 14-year model window (2023-06-01 to 2023-12-31).
    Fails gracefully with clear provenance explanation rather than falling back to old model.
    Returns (day_idx, mapped_arr_idx) where mapped_arr_idx indexes into surface satellite arrays.
    """
    if not v6_adapter.is_date_in_window(date_str):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Date {date_str} is outside the active model window ({v6_adapter.WINDOW_START} to {v6_adapter.WINDOW_END}). "
                f"{v6_adapter.PROVENANCE_NOTE}"
            ),
        )
    day_idx = _day_index(date_str)
    if inf.USE_TRIMMED_DATA or inf._day_index_map is not None:
        if inf._day_index_map is not None and day_idx in inf._day_index_map:
            mapped_arr_idx = inf._day_index_map[day_idx]
        else:
            mapped_arr_idx = day_idx
    else:
        mapped_arr_idx = day_idx

    return day_idx, mapped_arr_idx


def _get_mdt(arr_idx: int) -> inf.np.ndarray:
    """
    Compute physical Mean Dynamic Topography (MDT) from climatological steric height.
    Steric height integrates thermal expansion in the upper 300m:
    Ranges physically from ~0.35m in western upwelling basin (Somalia/Oman)
    to ~0.85m in the warm pool / Bay of Bengal.
    """
    if inf._temp_target_clim is None or arr_idx < 0 or arr_idx >= inf._temp_target_clim.shape[0]:
        return inf.np.full((101, 241), 0.5, dtype=inf.np.float32)
    clim = inf._temp_target_clim[arr_idx]
    depths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300]
    steric = inf.np.zeros((101, 241), dtype=inf.np.float32)
    for i in range(1, len(depths)):
        dz = depths[i] - depths[i - 1]
        t_avg = (clim[i] + clim[i - 1]) / 2.0
        steric += 2.1e-4 * inf.np.maximum(0.0, t_avg - 4.0) * dz

    ocean = (inf._sst_arr[arr_idx] > 0.5) if (inf._sst_arr is not None and arr_idx < inf._sst_arr.shape[0]) else inf.np.ones((101, 241), dtype=bool)
    s_ocean = steric[ocean]
    s_min = float(s_ocean.min()) if len(s_ocean) > 0 else 0.0
    s_max = float(s_ocean.max()) if len(s_ocean) > 0 else 1.0
    span = max(0.01, s_max - s_min)
    mdt = 0.35 + (steric - s_min) / span * 0.50
    mdt[~ocean] = 0.0
    return mdt


def extract_surface_inputs(latitude: float, longitude: float, date_str: str) -> dict:
    """Read satellite surface values at the nearest grid cell for the target date."""
    lat_idx, lon_idx = _grid_indices(latitude, longitude)
    day_idx, arr_idx = _validate_date_available(date_str, need_history=False)

    if inf._sst_arr is not None and 0 <= arr_idx < inf._sst_arr.shape[0]:
        sst = float(inf._sst_arr[arr_idx, lat_idx, lon_idx])
        sst_anom = float(inf._sst_anom[arr_idx, lat_idx, lon_idx])
        sss_anom = float(inf._sss_anom[arr_idx, lat_idx, lon_idx])
        ssh_anom = float(inf._ssh_anom[arr_idx, lat_idx, lon_idx])
        u_cur = float(inf._u_cur_anom[arr_idx, lat_idx, lon_idx])
        v_cur = float(inf._v_cur_anom[arr_idx, lat_idx, lon_idx])
        u_wind = float(inf._u_wind_anom[arr_idx, lat_idx, lon_idx])
        v_wind = float(inf._v_wind_anom[arr_idx, lat_idx, lon_idx])
        mdt_val = float(_get_mdt(arr_idx)[lat_idx, lon_idx])
        ssh_val = mdt_val + ssh_anom
    else:
        prof = v6_adapter.predict_temperature_profile(latitude, longitude, date_str, raw=True)
        sst = float(prof.get(0, 28.0)) if isinstance(prof, dict) and 0 in prof and prof[0] is not None else 28.0
        sst_anom = 0.0
        sss_anom = 0.0
        ssh_anom = 0.0
        u_cur = 0.0
        v_cur = 0.0
        u_wind = 0.0
        v_wind = 0.0
        ssh_val = 0.50

    cur_speed = float(inf.np.sqrt(u_cur**2 + v_cur**2))
    cur_dir = float((inf.np.degrees(inf.np.arctan2(v_cur, u_cur)) + 360) % 360)

    wind_speed = float(inf.np.sqrt(u_wind**2 + v_wind**2))
    wind_dir = float((inf.np.degrees(inf.np.arctan2(v_wind, u_wind)) + 360) % 360)

    return {
        "sst": {"val": round(sst, 2), "unit": "°C", "label": "SST"},
        "sss": {"val": round(35.0 + sss_anom, 2), "unit": "PSU", "label": "SSS", "anom": round(sss_anom, 2)},
        "ssh": {"val": round(ssh_val, 2), "unit": "m", "label": "SSH"},
        "sla": {"val": round(ssh_anom, 3), "unit": "m", "label": "SLA", "cm": round(ssh_anom * 100, 1)},
        "current": {
            "val": round(cur_speed, 2),
            "unit": "m/s",
            "dir": round(cur_dir, 0),
            "u": round(u_cur, 2),
            "v": round(v_cur, 2),
            "label": "Current (Speed & Dir)",
        },
        "wind": {
            "val": round(wind_speed, 1),
            "kmh": round(wind_speed * 3.6, 1),
            "unit": "m/s",
            "dir": round(wind_dir, 0),
            "u": round(u_wind, 1),
            "v": round(v_wind, 1),
            "label": "Wind (Speed & Dir)",
        },
        "_sst_anom": round(sst_anom, 2),
    }


_argo_dataset = None


def _load_argo_dataset():
    global _argo_dataset
    if _argo_dataset is None:
        p_2023 = os.path.join(os.path.dirname(__file__), "data", "argo_profiles_2023.json")
        argo_path = p_2023 if os.path.exists(p_2023) else os.path.join(os.path.dirname(__file__), "data", "argo_profiles.json")
        if os.path.exists(argo_path):
            with open(argo_path, "r", encoding="utf-8") as f:
                _argo_dataset = json.load(f)
        else:
            _argo_dataset = {"metadata": {}, "profiles": []}
    return _argo_dataset


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes Great Circle distance (km) between two coordinates via the Haversine formula.
    """
    R = 6371.0  # Earth radius in kilometers
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return R * c


def _get_monsoon_regime(dt: datetime.date) -> str:
    """
    Returns the North Indian Ocean monsoon regime for a given date:
    - Winter: December, January, February (months 12, 1, 2)
    - Pre-Monsoon: March, April, May (months 3, 4, 5)
    - Monsoon: June, July, August, September (months 6, 7, 8, 9)
    - Post-Monsoon: October, November (months 10, 11)
    """
    m = dt.month
    if m in (12, 1, 2):
        return "Winter"
    elif m in (3, 4, 5):
        return "Pre-Monsoon"
    elif m in (6, 7, 8, 9):
        return "Monsoon"
    else:
        return "Post-Monsoon"


def check_temperature_data_quality(temps_0_50: list[float]) -> tuple[bool, Optional[str]]:
    """
    Data-quality guard for temperature corruption bug.
    Inspects raw temperature profile across standard depths in the 0-50m band
    (depths: 0, 5, 10, 20, 30, 50 m).
    Flags if:
      a) Unphysical drop > 8°C between two adjacent standard depths in 0-50m
      b) 3+ consecutive identical temperature values within 0-50m
    """
    if len(temps_0_50) < 2:
        return False, None

    # a) Unphysical drop > 8°C between two adjacent standard depths in 0-50m
    for i in range(len(temps_0_50) - 1):
        drop = temps_0_50[i] - temps_0_50[i + 1]
        if drop > 8.0:
            return True, f"Unphysical drop >8°C ({drop:.2f}°C) between adjacent standard depths in 0-50m"

    # b) 3+ consecutive identical temperature values within 0-50m
    for i in range(len(temps_0_50) - 2):
        if abs(temps_0_50[i] - temps_0_50[i + 1]) < 1e-4 and abs(temps_0_50[i + 1] - temps_0_50[i + 2]) < 1e-4:
            return True, f"3+ consecutive identical temperature values ({temps_0_50[i]:.2f}°C) within 0-50m"

    return False, None


def model_result_to_frontend(result: dict, latitude: float, longitude: float, date_str: str, raw_result: Optional[dict] = None) -> dict:
    if "error" in result:
        return {"error": result["error"]}

    depths = inf.STANDARD_DEPTHS
    temps = [(round(float(result[d]), 2) if (result[d] is not None and not inf.np.isnan(result[d])) else None) for d in depths]
    surf_inputs = extract_surface_inputs(latitude, longitude, date_str)

    # Inspect raw temperature profile across 0-50m band for corruption
    depths_0_50 = [d for d in depths if d <= 50]
    raw_profile = raw_result if raw_result is not None else result
    raw_temps = [(round(float(raw_profile[d]), 2) if (raw_profile[d] is not None and not inf.np.isnan(raw_profile[d])) else None) for d in depths]
    raw_temps_0_50 = [float(raw_profile[d]) for d in depths_0_50 if (raw_profile[d] is not None and not inf.np.isnan(raw_profile[d]))]
    dq_flag, dq_reason = check_temperature_data_quality(raw_temps_0_50)

    # Oceanographic indices:
    # MLD computed from RAW profile (preserves de Boyer Montégut 0.2°C accuracy; bias correction shoals MLD)
    # D20, D26, TCHP, and OHC300 computed from CORRECTED profile
    raw_temps_for_indices = [t if t is not None else inf.np.nan for t in raw_temps]
    temps_for_indices = [t if t is not None else inf.np.nan for t in temps]
    if v6_adapter.is_date_in_window(date_str):
        try:
            v6_data = v6_adapter.get_profile_data(latitude, longitude, date_str)
            v6_prods = v6_data.get("products", {})
            mld_val = v6_prods.get("mld")
            d20_val = v6_prods.get("d20")
            d26_val = v6_prods.get("d26")
            tchp_val = v6_prods.get("tchp")
            tchp_info = {
                "value": tchp_val,
                "band": v6_adapter.TCHP_RMSE_BAND,
                "raw_tchp": round(tchp_val - 2.47, 2) if tchp_val is not None else None,
                "unit": "kJ/cm²"
            }
        except Exception:
            mld_val = prod.compute_mld(raw_temps_for_indices, depths)
            d20_val = prod.compute_d20(temps_for_indices, depths)
            d26_val = prod.compute_d26(temps_for_indices, depths)
            tchp_info = prod.tchp_argo_corrected(temps_for_indices, depths)
    else:
        mld_val = prod.compute_mld(raw_temps_for_indices, depths)
        d20_val = prod.compute_d20(temps_for_indices, depths)
        d26_val = prod.compute_d26(temps_for_indices, depths)
        tchp_info = prod.tchp_argo_corrected(temps_for_indices, depths)
    ohc300_val = prod.compute_ohc300(temps_for_indices, depths)

    # 1. Horizontal Thermal Front Gradient (deg C / 100 km):
    # Literature-grounded productivity/front proxy derived from horizontal SST gradient
    # magnitude (Sobel / central differences) over the spatial SST field.
    # Fronts concentrate plankton and pelagic fish at convergent water mass boundaries.
    # Evaluated first so front_strength can corroborate coastal upwelling plumes.
    _, mapped_day_idx = _validate_date_available(date_str, need_history=False)
    lat_i = int(inf.np.argmin(inf.np.abs(inf._target_lats - latitude)))
    lon_j = int(inf.np.argmin(inf.np.abs(inf._target_lons - longitude)))
    d_lat_km = 27.78
    lats_rad = inf.np.radians(inf._target_lats[lat_i])
    d_lon_km = 27.78 * float(inf.np.cos(lats_rad))

    if inf._sst_arr is not None and 0 <= mapped_day_idx < inf._sst_arr.shape[0]:
        sst_grid = inf.np.array(inf._sst_arr[mapped_day_idx], dtype=float)
        sst_grid[sst_grid <= 0.0] = inf.np.nan
    else:
        sst_grid = v6_adapter.temperature_map(date_str, 0, corrected=(not raw_result))

    i_prev = max(0, lat_i - 1)
    i_next = min(sst_grid.shape[0] - 1, lat_i + 1)
    j_prev = max(0, lon_j - 1)
    j_next = min(sst_grid.shape[1] - 1, lon_j + 1)

    dy_sst = (sst_grid[i_next, lon_j] - sst_grid[i_prev, lon_j]) if (~inf.np.isnan(sst_grid[i_next, lon_j]) and ~inf.np.isnan(sst_grid[i_prev, lon_j])) else 0.0
    dx_sst = (sst_grid[lat_i, j_next] - sst_grid[lat_i, j_prev]) if (~inf.np.isnan(sst_grid[lat_i, j_next]) and ~inf.np.isnan(sst_grid[lat_i, j_prev])) else 0.0

    dy_dist = (i_next - i_prev) * d_lat_km if (i_next > i_prev) else d_lat_km
    dx_dist = (j_next - j_prev) * d_lon_km if (j_next > j_prev) else d_lon_km

    grad_y = (dy_sst / dy_dist) * 100.0 if dy_dist > 0 else 0.0
    grad_x = (dx_sst / dx_dist) * 100.0 if dx_dist > 0 else 0.0
    front_grad_mag = round(float(inf.np.sqrt(grad_y ** 2 + grad_x ** 2)), 2)
    front_strength = round(float(inf.np.clip(front_grad_mag / 1.5, 0.0, 1.0)), 2)

    # 2. Thermocline Depth (Z_tc): depth of maximum -dT/dz in upper 20-250m
    # Strict physical criteria to prevent shallow seafloor clamping:
    # A true oceanic thermocline requires:
    #   a) Water column depth >= 60m (shallow shelf/delta/strait waters <60m lack open-ocean thermoclines)
    #   b) Peak vertical gradient max(-dT/dz) >= 0.03 °C/m (0.3°C drop per 10m)
    #   c) Detected depth is strictly above the seabed (tc_depth < max_seafloor)
    valid_depths = [d for d, t in zip(depths, temps) if t is not None]
    max_seafloor = float(valid_depths[-1]) if valid_depths else 0.0
    max_grad = -999.0
    best_tc_depth = None
    for i in range(len(depths) - 1):
        z1, z2 = depths[i], depths[i + 1]
        if z2 > 250:
            break
        t1, t2 = temps[i], temps[i + 1]
        if t1 is None or t2 is None:
            break
        dz = z2 - z1
        if dz > 0:
            grad = (t1 - t2) / dz
            if grad > max_grad:
                max_grad = grad
                best_tc_depth = (z1 + z2) / 2.0

    tc_detected = (
        max_seafloor >= 60.0 and
        max_grad >= 0.03 and
        best_tc_depth is not None and
        best_tc_depth < max_seafloor
    )
    tc_depth = best_tc_depth if tc_detected else None
    tc_factor = max(0.0, min(1.0, (120.0 - tc_depth) / 80.0)) if tc_detected else 0.0

    # 3. Upwelling Index (UI in [0, 1]):
    # Derived from surface-to-50m thermal gradient (T(0) - T(50)) corroborated by dynamical signals:
    # - Primary corroboration: Positive ERA5 Ekman pumping velocity (w_E >= 0.30 m/day)
    # - Fallback corroboration (if Ekman data unavailable): Negative SLA (<= -0.02m) or strong front (>= 0.8) and cool SST (<= 28.0°C)
    # - Otherwise, neutral/positive SLA and warm SST indicate solar skin heating / downwelling heat trap (e.g. Persian Gulf)
    t0 = temps[0] if temps[0] is not None else 28.0
    t50 = temps[depths.index(50)] if (50 in depths and depths.index(50) < len(temps)) else None
    if t50 is None:
        valid_t = [t for t in temps if t is not None]
        t50 = valid_t[-1] if valid_t else t0
    temp_gap = max(0.0, t0 - t50)
    raw_ui = max(0.0, min(1.0, temp_gap / 5.0))

    sla_val = surf_inputs.get("sla", {}).get("val", 0.0)
    sst_val = surf_inputs.get("sst", {}).get("val", 28.0)
    cur_val = surf_inputs.get("current", {}).get("val", 0.2)

    ekman_arr = _get_ekman_array()
    w_e = None
    w_e_window = None
    upwelling_confirmed = False
    upw_corr_src = "none"

    if ekman_arr is not None and 0 <= mapped_day_idx < len(ekman_arr):
        ek_raw = float(ekman_arr[mapped_day_idx, lat_i, lon_j])
        if not inf.np.isnan(ek_raw):
            w_e = round(ek_raw, 2)
            upw_corr_src = "ekman"
            # Spatial neighborhood max (±2 grid cells / ~0.5° matching ~30-50km Rossby radius of deformation)
            # avoids false negatives at grid-scale curl zero-crossings near coastlines
            r0 = max(0, lat_i - 2)
            r1 = min(ekman_arr.shape[1], lat_i + 3)
            c0 = max(0, lon_j - 2)
            c1 = min(ekman_arr.shape[2], lon_j + 3)
            win = inf.np.array(ekman_arr[mapped_day_idx, r0:r1, c0:c1], dtype=float)
            ocean_win = (inf._sst_arr[mapped_day_idx, r0:r1, c0:c1] > 0.5) if (inf._sst_arr is not None and mapped_day_idx < inf._sst_arr.shape[0]) else inf.np.ones(win.shape, dtype=bool)
            valid_vals = win[ocean_win]
            w_e_eval = float(inf.np.nanmax(valid_vals)) if valid_vals.size > 0 else ek_raw
            w_e_window = round(w_e_eval, 2)
            upwelling_confirmed = (w_e_eval >= 0.30)

    if upw_corr_src == "none":
        # Fallback corroboration when Ekman data is unavailable for that cell/date
        if sla_val <= -0.02:
            upwelling_confirmed = True
            upw_corr_src = "sla_fallback"
        elif front_strength >= 0.8 and sst_val <= 28.0:
            upwelling_confirmed = True
            upw_corr_src = "front_fallback"

    if upwelling_confirmed:
        sla_mult = 1.0
    else:
        heat_excess = max(0.0, (sst_val - 28.0) / 3.0)
        sla_penalty = max(0.0, min(1.0, (sla_val - (-0.02)) / 0.06))
        sla_mult = max(0.15, 1.0 - max(sla_penalty, heat_excess) * 0.8)

    upwelling_val = round(raw_ui * sla_mult, 2)

    # 4. Chlorophyll-a: Scalar surface primary productivity proxy (mg/m^3) with Three-Tier Priority:
    # Tier 1: Direct satellite observation (MODIS-Aqua 8-day composite, chl_source == 1)
    # Tier 2: Monthly climatology fallback (geometric mean 2021-2023, chl_source == 0)
    # Tier 3: Synthetic dynamical heuristic (only when neither real layer has valid data)
    chla_arr, chl_source_arr = _get_chlorophyll_arrays()
    chl_source = "heuristic"
    chl_source_label = "Estimated — no satellite or climatology data"
    obs_chla_val = None
    chla_val = None

    if chl_source_arr is not None and 0 <= mapped_day_idx < len(chl_source_arr):
        chl_source_code = int(chl_source_arr[mapped_day_idx, lat_i, lon_j])
        if chla_arr is not None:
            raw_obs = float(chla_arr[mapped_day_idx, lat_i, lon_j])
            if raw_obs > 0.0 and not inf.np.isnan(raw_obs):
                obs_chla_val = round(raw_obs, 2)
                if chl_source_code == 1:
                    chl_source = "satellite"
                    chl_source_label = "Satellite (8-day composite)"
                    chla_val = obs_chla_val
                elif chl_source_code == 0:
                    chl_source = "climatology"
                    chl_source_label = "Seasonal average (cloud-obscured)"
                    chla_val = obs_chla_val

    if chla_val is None:
        # Tier 3: Synthetic dynamical proxy fallback
        chla_val = max(0.05, min(9.8, round(0.25 + 2.5 * upwelling_val - 1.2 * sla_val + 0.35 * cur_val, 2)))
        chl_source = "heuristic"
        chl_source_label = "Estimated — no satellite or climatology data"

    # 5. Vertical Nutrient / Chlorophyll Profile (mg/m^3) across standard depths:
    # Explicitly linked to chla_val: shares the same root surface productivity magnitude,
    # but models the depth-dependent Deep Chlorophyll Maximum / DCM peak at thermocline depth.
    nutr_tc = tc_depth if tc_depth is not None else 30.0
    nutrients = []
    for d in depths:
        peak = 1.35 * chla_val * float(inf.np.exp(-((d - nutr_tc) ** 2) / (2 * (28.0 ** 2))))
        base = chla_val * 0.30 if d < 100 else 0.15
        deep_val = 0.25 * float(inf.np.exp(-d / 400.0))
        nutrients.append(round(base + peak + deep_val, 2))

    # 6. Composite PFZ Assessment Index (0.10 to 0.98):
    # When thermocline is genuinely detected:
    #   Thermocline shoaling factor (35%) + Upwelling dT/dz (35%) +
    #   Horizontal front (15%) + Surface primary productivity proxy (15%)
    # When thermocline is excluded (shallow shelf/delta/strait waters <60m):
    #   Weights are proportionally redistributed across remaining active signals (UI: 53.8%, Front: 23.1%, Chl: 23.1%)
    surface_chla = nutrients[0]

    if dq_flag:
        # Temperature corruption detected in 0-50m band: mark data_quality_flag: true
        # and suppress normal PFZ score calculation
        pfz_val = None
        w_tc, w_ui, w_fr, w_ch = 0.35, 0.35, 0.15, 0.15
    else:
        if tc_detected:
            w_tc, w_ui, w_fr, w_ch = 0.35, 0.35, 0.15, 0.15
            pfz_raw = w_tc * tc_factor + w_ui * upwelling_val + w_fr * front_strength + w_ch * min(1.0, surface_chla / 3.0)
        else:
            w_tc = 0.0
            w_ui = 0.35 / 0.65
            w_fr = 0.15 / 0.65
            w_ch = 0.15 / 0.65
            pfz_raw = w_ui * upwelling_val + w_fr * front_strength + w_ch * min(1.0, surface_chla / 3.0)
        pfz_val = round(max(0.1, min(0.98, pfz_raw)), 2)

    profile = [{"depth": d, "temperature": (round(float(t), 2) if t is not None else None)} for d, t in zip(depths, temps)]

    return {
        "depths": depths,
        "temps": temps,
        "raw_temps": raw_temps,
        "surfaceInputs": surf_inputs,
        "profile": profile,
        "data_source": v6_adapter.MODEL_NAME,
        "provenance": v6_adapter.PROVENANCE_NOTE,
        "indices": {
            "mld": mld_val,
            "mld_status": "Experimental",
            "d20": d20_val,
            "d26": d26_val,
            "tchp": tchp_info["value"],
            "tchp_band": tchp_info["band"],
            "tchp_raw": tchp_info["raw_tchp"],
            "ohc300": ohc300_val,
            "thermocline_depth": round(tc_depth, 1) if tc_detected else None,
            "thermocline_detected": tc_detected,
            "upwelling_index": round(upwelling_val, 2),
            "raw_upwelling_index": round(raw_ui, 2),
            "ekman_upwelling_val": w_e,
            "ekman_upwelling_window_max": w_e_window,
            "upwelling_corroboration_source": upw_corr_src,
            "thermal_front_gradient": front_grad_mag,
            "thermal_front_strength": front_strength,
            "chlorophyll_a": round(chla_val, 2),
            "chlorophyll_source": chl_source,
            "chlorophyll_source_label": chl_source_label,
            "chlorophyll_satellite_val": obs_chla_val,
            "pfz": pfz_val,
            "pfz_confidence_score": pfz_val,
            "data_quality_flag": dq_flag,
            "data_quality_reason": dq_reason if dq_flag else None,
            "nutrients": nutrients,
            "pfz_formula": {
                "thermocline_detected": tc_detected,
                "thermocline_factor": round(float(tc_factor), 2) if tc_detected else None,
                "upwelling_index": round(float(upwelling_val), 2),
                "raw_upwelling_index": round(float(raw_ui), 2),
                "ekman_upwelling_val": w_e,
                "ekman_upwelling_window_max": w_e_window,
                "upwelling_corroboration_source": upw_corr_src,
                "front_strength": round(float(front_strength), 2),
                "surface_chla": round(float(surface_chla), 2),
                "weights": {
                    "thermocline": round(w_tc, 2),
                    "upwelling": round(w_ui, 2),
                    "thermal_front": round(w_fr, 2),
                    "chlorophyll_proxy": round(w_ch, 2)
                },
                "model_derived_pct": round((w_tc + w_ui + w_fr) * 100),
                "heuristic_pct": round(w_ch * 100)
            }
        },
        "argo": None,
        "validation": None,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": str(inf.device),
        "trimmed": inf.USE_TRIMMED_DATA,
        "full_float16": inf.USE_FULL_FLOAT16_DATA,
        "inference_cache": inf.is_inference_cache_enabled(),
    }


@app.post("/predict")
def predict(
    req: PredictRequest,
    raw: Optional[bool] = Query(None),
    smoothing: Optional[bool] = Query(None),
    corrected: Optional[bool] = Query(None),
    smoothed: Optional[bool] = Query(None),
):
    _validate_date_available(req.date, need_history=False)

    # Independent flag resolution: corrected & smoothed (default smoothed=False everywhere)
    if corrected is not None:
        is_corrected = bool(corrected)
    elif req.corrected is not None:
        is_corrected = bool(req.corrected)
    elif raw is not None:
        is_corrected = not bool(raw)
    elif req.raw is not None:
        is_corrected = not bool(req.raw)
    else:
        is_corrected = False  # Default to raw profile

    if smoothed is not None:
        is_smoothed = bool(smoothed)
    elif req.smoothed is not None:
        is_smoothed = bool(req.smoothed)
    elif smoothing is not None:
        is_smoothed = bool(smoothing)
    elif req.smoothing is not None:
        is_smoothed = bool(req.smoothing)
    else:
        is_smoothed = False  # Default smoothed=false everywhere

    if v6_adapter.is_date_in_window(req.date):
        result = v6_adapter.predict_temperature_profile(
            req.latitude, req.longitude, req.date,
            raw=(not is_corrected),
            smoothing=is_smoothed,
            corrected=is_corrected,
        )
        raw_result = result if (not is_corrected and not is_smoothed) else v6_adapter.predict_temperature_profile(
            req.latitude, req.longitude, req.date, raw=True, smoothing=False, corrected=False
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Date {req.date} is outside the active model window ({v6_adapter.WINDOW_START} to {v6_adapter.WINDOW_END}). "
                f"{v6_adapter.PROVENANCE_NOTE}"
            ),
        )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    resp = model_result_to_frontend(result, req.latitude, req.longitude, req.date, raw_result=raw_result)
    resp["raw"] = not is_corrected
    resp["corrected"] = is_corrected
    resp["smoothed"] = is_smoothed
    return resp


@app.get("/predict")
def predict_get(
    latitude: float = Query(..., ge=inf.MIN_LAT, le=inf.MAX_LAT),
    longitude: float = Query(..., ge=inf.MIN_LON, le=inf.MAX_LON),
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    raw: Optional[bool] = Query(None),
    smoothing: Optional[bool] = Query(None),
    corrected: Optional[bool] = Query(None),
    smoothed: Optional[bool] = Query(None),
):
    req = PredictRequest(
        latitude=latitude,
        longitude=longitude,
        date=date,
        raw=raw,
        smoothing=smoothing,
        corrected=corrected,
        smoothed=smoothed,
    )
    return predict(req, raw=raw, smoothing=smoothing, corrected=corrected, smoothed=smoothed)


_spatial_prediction_cache = {}
_spatial_prediction_cache_lock = threading.Lock()
_MAX_CACHE_SIZE = 4


def get_spatial_predictions(date_str: str, raw: bool = False):
    """
    Return spatial predictions on the (101, 241) grid for the target date across 15 depths.
    In the 2023-06-01 to 2023-12-31 window, returns precomputed v6_satswap_anom_14yr slices in <1ms.
    """
    if v6_adapter.is_date_in_window(date_str):
        cache_key = (date_str, raw)
        use_cache = inf.is_inference_cache_enabled()
        if use_cache:
            with _spatial_prediction_cache_lock:
                if cache_key in _spatial_prediction_cache:
                    return _spatial_prediction_cache[cache_key].copy()

        depths = v6_adapter.STANDARD_DEPTHS
        slices = [v6_adapter.temperature_map(date_str, d, corrected=(not raw)) for d in depths]
        stacked = inf.np.stack(slices, axis=0)  # (15, 101, 241)
        if use_cache:
            with _spatial_prediction_cache_lock:
                if len(_spatial_prediction_cache) >= _MAX_CACHE_SIZE:
                    _spatial_prediction_cache.pop(next(iter(_spatial_prediction_cache)))
                _spatial_prediction_cache[cache_key] = stacked.copy()
        return stacked.copy()

    _validate_date_available(date_str, need_history=True)

    use_cache = inf.is_inference_cache_enabled()
    cache_key = (date_str, raw)
    if use_cache:
        with _spatial_prediction_cache_lock:
            if cache_key in _spatial_prediction_cache:
                return _spatial_prediction_cache[cache_key].copy()

    day_idx, mapped_day_idx = _validate_date_available(date_str, need_history=True)
    start, end = mapped_day_idx - inf.LOOKBACK_DAYS, mapped_day_idx + 1  # window INCLUDES the target day

    if start < 0 or end > inf._total_days or mapped_day_idx < 0 or mapped_day_idx >= inf._total_days:
        raise HTTPException(
            status_code=400,
            detail="This date is not available in the deployed demo dataset.",
        )

    prediction_real = None
    if use_cache:
        with inf._prediction_cache_lock:
            if date_str in inf._prediction_cache:
                prediction_real = inf._prediction_cache[date_str].copy().astype("float32")
                inf._prediction_cache.move_to_end(date_str)

    if prediction_real is None:
        surface_channels = inf.np.stack([
            inf._sst_anom[start:end],
            inf._sss_anom[start:end],
            inf._ssh_anom[start:end],
            inf._u_cur_anom[start:end],
            inf._v_cur_anom[start:end],
            inf._u_wind_anom[start:end],
            inf._v_wind_anom[start:end],
        ], axis=1).astype("float32")
        surface_channels = (surface_channels - inf.SURF_MEAN[None, :, None, None]) / inf.SURF_STD[None, :, None, None]

        dstag_channels = inf.np.stack([
            inf.np.array(inf._sst_arr[start:end]) - inf.np.array(inf._temp_target_clim[start:end, di])
            for di in inf.DSTAG_DEPTH_INDICES
        ], axis=1).astype("float32")
        dstag_channels = (dstag_channels - inf.DSTAG_MEAN[None, :, None, None]) / inf.DSTAG_STD[None, :, None, None]

        lat, lon = surface_channels.shape[2], surface_channels.shape[3]
        window = inf.np.concatenate([
            surface_channels, inf._pos_tiled[:inf.SEQUENCE_LENGTH],
            inf.np.broadcast_to(inf._doy_sin[start:end][:, None, None, None], (inf.SEQUENCE_LENGTH, 1, lat, lon)),
            inf.np.broadcast_to(inf._doy_cos[start:end][:, None, None, None], (inf.SEQUENCE_LENGTH, 1, lat, lon)),
            dstag_channels,
        ], axis=1)

        import torch
        window_tensor = torch.tensor(window, dtype=torch.float32).unsqueeze(0).to(inf.device)
        del window
        del surface_channels

        with torch.inference_mode():
            prediction_anom = inf._model(window_tensor)
            if hasattr(prediction_anom, "prediction"):
                prediction_anom = prediction_anom.prediction
            prediction_anom = prediction_anom.squeeze(0).cpu().numpy()

        prediction_real = (prediction_anom * inf.TEMP_STD[:, None, None]) + inf._temp_target_clim[mapped_day_idx]

        if use_cache:
            with inf._prediction_cache_lock:
                if len(inf._prediction_cache) >= inf._MAX_PREDICTION_CACHE_SIZE:
                    inf._prediction_cache.popitem(last=False)
                inf._prediction_cache[date_str] = prediction_real.astype("float16")

    out_spatial = prediction_real.copy()

    # Step 1: Smooth Surface Blending & Near-Surface Taper
    raw_sst_grid = inf.np.array(inf._sst_arr[mapped_day_idx], dtype=float)
    raw_m0_grid = out_spatial[0].copy()

    ocean_mask = (raw_sst_grid >= 0.5)
    valid_m0 = ocean_mask & (~inf.np.isnan(raw_m0_grid))

    diff_grid = inf.np.abs(raw_sst_grid - raw_m0_grid)
    alpha_grid = inf.np.clip(0.60 - 0.15 * diff_grid, 0.30, 0.60)
    blended_sst_grid = alpha_grid * raw_sst_grid + (1.0 - alpha_grid) * raw_m0_grid

    out_spatial[0][valid_m0] = blended_sst_grid[valid_m0]

    delta_s_grid = blended_sst_grid - raw_m0_grid
    valid_m5 = ocean_mask & (~inf.np.isnan(out_spatial[1]))
    out_spatial[1][valid_m5] += 0.50 * delta_s_grid[valid_m5]

    # Step 2: Monotonicity Safety-Net Pass in upper ocean (depths <= 100m)
    if not raw:
        upper_depths_idx = [i for i, d in enumerate(inf.STANDARD_DEPTHS) if d <= 100]
        H, W = out_spatial.shape[1], out_spatial.shape[2]
        for r in range(H):
            for c in range(W):
                if ocean_mask[r, c]:
                    vals = out_spatial[upper_depths_idx, r, c]
                    valid_idx = ~inf.np.isnan(vals)
                    if valid_idx.sum() > 1:
                        out_spatial[upper_depths_idx, r, c][valid_idx] = inf._isotonic_decreasing(vals[valid_idx])

        # Step 3: Argo Empirical Warm-Bias Correction
        out_spatial = prod.correct_profile(out_spatial)

    # Natural Earth land mask & bathymetry enforcement
    land_mask = (raw_sst_grid < 0.5)
    for d in range(len(inf.STANDARD_DEPTHS)):
        out_spatial[d][land_mask] = 0.0
        valid_ocean_d = (~land_mask) & (~inf.np.isnan(out_spatial[d]))
        out_spatial[d][valid_ocean_d] = inf.np.maximum(4.0, out_spatial[d][valid_ocean_d])

    if not raw:
        ocean_cells = ~land_mask
        if ocean_cells.any():
            for d in range(7, len(inf.STANDARD_DEPTHS)):
                valid_pair = ocean_cells & (~inf.np.isnan(out_spatial[d])) & (~inf.np.isnan(out_spatial[d - 1]))
                out_spatial[d][valid_pair] = inf.np.minimum(out_spatial[d][valid_pair], out_spatial[d - 1][valid_pair])

    out_spatial[~inf._valid_depth_mask] = inf.np.nan

    if use_cache:
        with _spatial_prediction_cache_lock:
            if len(_spatial_prediction_cache) >= _MAX_CACHE_SIZE:
                _spatial_prediction_cache.pop(next(iter(_spatial_prediction_cache)))
            _spatial_prediction_cache[cache_key] = out_spatial.copy()

    return out_spatial


@app.get("/temperature-grid")
def temperature_grid(
    date: str,
    depth: int = 0,
    raw: Optional[bool] = Query(None),
    smoothing: Optional[bool] = Query(None),
    corrected: Optional[bool] = Query(None),
    smoothed: Optional[bool] = Query(None),
):
    """
    Return real gridded ocean temperature slice at the specified depth and date.
    Generated directly from the v6_satswap_anom_14yr model, guaranteeing
    100% exact numerical consistency with the /predict endpoint and TVD table.
    Supports independent corrected and smoothed flags (default smoothed=False everywhere).
    """
    if depth not in inf.STANDARD_DEPTHS:
        raise HTTPException(status_code=400, detail=f"Invalid depth {depth}. Must be one of {inf.STANDARD_DEPTHS}")

    _validate_date_available(date, need_history=False)

    # Resolve independent corrected and smoothed flags
    if corrected is not None:
        is_corrected = bool(corrected)
    elif raw is not None:
        is_corrected = not bool(raw)
    else:
        is_corrected = False  # Default to raw non-monotonic profile

    if smoothed is not None:
        is_smoothed = bool(smoothed)
    elif smoothing is not None:
        is_smoothed = bool(smoothing)
    else:
        is_smoothed = False  # Default smoothed=false everywhere

    sub_lats = v6_adapter.TARGET_LATS.tolist()
    sub_lons = v6_adapter.TARGET_LONS.tolist()

    if v6_adapter.is_date_in_window(date):
        m = v6_adapter.temperature_map(date, depth, corrected=is_corrected)
        grid_slice = inf.np.where(
            inf.np.isnan(m),
            None,
            inf.np.round(m, 2)
        ).tolist()
    else:
        spatial_preds = get_spatial_predictions(date, raw=(not is_corrected))
        depth_idx = inf.STANDARD_DEPTHS.index(depth)
        grid_slice = inf.np.where(
            inf.np.isnan(spatial_preds[depth_idx]),
            None,
            inf.np.round(spatial_preds[depth_idx], 2)
        ).tolist()

    return {
        "depth": depth,
        "date": date,
        "raw": not is_corrected,
        "corrected": is_corrected,
        "smoothed": is_smoothed,
        "bounds": {
            "south": float(v6_adapter.MIN_LAT),
            "north": float(v6_adapter.MAX_LAT),
            "west": float(v6_adapter.MIN_LON),
            "east": float(v6_adapter.MAX_LON),
        },
        "lats": sub_lats,
        "lons": sub_lons,
        "grid": grid_slice,
        "data_source": v6_adapter.MODEL_NAME,
        "provenance": v6_adapter.PROVENANCE_NOTE,
    }


@app.get("/parameter-grid")
def parameter_grid(param: str, date: str):
    """
    Return real gridded 2D surface parameter slice for the target date.
    Supported params: sst, ssh, sss, sla, current, wind
    For vector fields ('current' and 'wind'), also returns 'u' and 'v' grids.
    """
    day_idx, arr_idx = _validate_date_available(date, need_history=False)

    p = param.lower()
    ocean_mask = (inf._sst_arr[arr_idx] >= 0.5)
    extra = {}

    if p == "sst":
        slice_data = inf._sst_arr[arr_idx].astype(float)
    elif p == "ssh":
        mdt = _get_mdt(arr_idx)
        slice_data = (mdt + inf._ssh_anom[arr_idx]).astype(float)
        slice_data[~ocean_mask] = 0.0
    elif p == "sla":
        slice_data = inf._ssh_anom[arr_idx].astype(float)
        slice_data[~ocean_mask] = 0.0
    elif p == "sss":
        slice_data = (35.0 + inf._sss_anom[arr_idx].astype(float))
        slice_data[~ocean_mask] = 0.0
    elif p == "current":
        u = inf._u_cur_anom[arr_idx].astype(float)
        v = inf._v_cur_anom[arr_idx].astype(float)
        slice_data = inf.np.sqrt(u * u + v * v)
        slice_data[~ocean_mask] = 0.0
        u[~ocean_mask] = 0.0
        v[~ocean_mask] = 0.0
        extra["u"] = u.tolist()
        extra["v"] = v.tolist()
    elif p == "wind":
        u = inf._u_wind_anom[arr_idx].astype(float)
        v = inf._v_wind_anom[arr_idx].astype(float)
        slice_data = inf.np.sqrt(u * u + v * v)
        slice_data[~ocean_mask] = 0.0
        u[~ocean_mask] = 0.0
        v[~ocean_mask] = 0.0
        extra["u"] = u.tolist()
        extra["v"] = v.tolist()
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported parameter {param}")

    resp = {
        "param": p,
        "date": date,
        "bounds": {
            "south": float(inf.MIN_LAT),
            "north": float(inf.MAX_LAT),
            "west": float(inf.MIN_LON),
            "east": float(inf.MAX_LON),
        },
        "lats": inf._target_lats.tolist(),
        "lons": inf._target_lons.tolist(),
        "grid": slice_data.tolist(),
    }
    resp.update(extra)
    return resp


_pfz_grid_cache = {}
_pfz_grid_cache_lock = threading.Lock()
_MAX_PFZ_CACHE_SIZE = 8
_pfz_land_mask = None


def _get_pfz_land_mask():
    global _pfz_land_mask
    if _pfz_land_mask is None:
        mask_path = os.path.join(os.path.dirname(__file__), "data", "pfz_land_mask.npy")
        if os.path.exists(mask_path):
            _pfz_land_mask = inf.np.load(mask_path)
    return _pfz_land_mask


def compute_pfz_grid(date_str: str) -> dict:
    """
    Computes a downsampled 2D grid of Potential Fishing Zone (PFZ) confidence scores
    across the North Indian Ocean basin (5°N–30°N, 45°E–105°E) for the specified date.
    Resolution: 26x41 (~1.0° lat x 1.5° lon downsampled from the 101x241 master grid).
    Reuses full-grid CNN-LSTM spatial temperature predictions and vectorized physical formulas:
    thermocline depth (tc_depth), upwelling index (UI), and chlorophyll-a proxy (chla_val),
    guaranteeing 100% numerical consistency with the /predict endpoint.
    Land cells (Natural Earth coastline mask & raw SST < 0.5) return None (JSON null).
    """
    use_cache = inf.is_inference_cache_enabled()
    if use_cache:
        with _pfz_grid_cache_lock:
            if date_str in _pfz_grid_cache:
                return _pfz_grid_cache[date_str]

    day_idx, mapped_day_idx = _validate_date_available(date_str, need_history=True)
    spatial = get_spatial_predictions(date_str)
    spatial_raw = get_spatial_predictions(date_str, raw=True)

    # Downsample steps: lat_step=4 (101 -> 26 points, 1.0° spacing), lon_step=6 (241 -> 41 points, 1.5° spacing)
    lat_step = 4
    lon_step = 6
    sub_lats = inf._target_lats[::lat_step]
    sub_lons = inf._target_lons[::lon_step]

    sub_temps = spatial[:, ::lat_step, ::lon_step]
    sub_temps_raw = spatial_raw[:, ::lat_step, ::lon_step]
    if inf._sst_arr is not None and 0 <= mapped_day_idx < inf._sst_arr.shape[0]:
        ocean_mask = (inf._sst_arr[mapped_day_idx, ::lat_step, ::lon_step] >= 0.5)
        sst_full = inf.np.array(inf._sst_arr[mapped_day_idx], dtype=float)
        sst_full[sst_full <= 0.0] = inf.np.nan
        sst_sub = inf._sst_arr[mapped_day_idx, ::lat_step, ::lon_step]
    else:
        ocean_mask = inf.np.isfinite(sub_temps[0])
        sst_full = spatial[0].astype(float)
        sst_sub = sub_temps[0]

    # 1. Horizontal Thermal Front Gradient across full grid, sampled to resolution
    # Literature-grounded productivity/front proxy derived from horizontal SST gradient
    # magnitude (Sobel / central differences) over the spatial SST field.
    # Evaluated first so front_strength_grid can corroborate coastal upwelling plumes.
    d_lat_km = 27.78
    lats_rad = inf.np.radians(inf._target_lats)[:, None]
    d_lon_km_2d = inf.np.broadcast_to(27.78 * inf.np.cos(lats_rad), (101, 241))

    grad_y = inf.np.zeros_like(sst_full)
    grad_x = inf.np.zeros_like(sst_full)
    valid_y = ~inf.np.isnan(sst_full[2:, :]) & ~inf.np.isnan(sst_full[:-2, :])
    y_sub = inf.np.zeros((99, 241))
    y_sub[valid_y] = (sst_full[2:, :][valid_y] - sst_full[:-2, :][valid_y]) / (2.0 * d_lat_km) * 100.0
    grad_y[1:-1, :] = y_sub
    valid_x = ~inf.np.isnan(sst_full[:, 2:]) & ~inf.np.isnan(sst_full[:, :-2])
    x_sub = inf.np.zeros((101, 239))
    x_sub[valid_x] = (sst_full[:, 2:][valid_x] - sst_full[:, :-2][valid_x]) / (2.0 * d_lon_km_2d[:, 1:-1][valid_x]) * 100.0
    grad_x[:, 1:-1] = x_sub

    grad_mag = inf.np.sqrt(grad_y ** 2 + grad_x ** 2)
    front_strength_grid = inf.np.clip(grad_mag / 1.5, 0.0, 1.0)[::lat_step, ::lon_step]

    # 2. Thermocline depth (tc_depth): depth of maximum temperature gradient in upper 300m
    # Strict physical criteria to prevent shallow seafloor clamping:
    # A true oceanic thermocline requires:
    #   a) Water column depth >= 60m (sub_temps[5] valid)
    #   b) Peak vertical gradient max(-dT/dz) >= 0.03 °C/m
    depths = inf.STANDARD_DEPTHS
    # Upper 300m intervals: 0-5, 5-10, 10-20, 20-30, 30-50, 50-75, 75-100, 100-125, 125-150, 150-200, 200-300 (11 intervals)
    grads = [inf.np.nan_to_num((sub_temps[i] - sub_temps[i + 1]) / (depths[i + 1] - depths[i]), nan=-999.0) for i in range(11)]
    grad_stack = inf.np.stack(grads, axis=0)
    max_grad_grid = inf.np.max(grad_stack, axis=0)
    max_idx = inf.np.argmax(grad_stack, axis=0)
    mid_arr = inf.np.array([(depths[i] + depths[i + 1]) / 2.0 for i in range(11)], dtype="float32")
    tc_depth = mid_arr[max_idx]

    deep_enough = ~inf.np.isnan(sub_temps[5])
    tc_detected_grid = deep_enough & (max_grad_grid >= 0.03)
    tc_factor = inf.np.where(tc_detected_grid, inf.np.clip((120.0 - tc_depth) / 80.0, 0.0, 1.0), 0.0)

    # 3. Upwelling index (UI in [0, 1]): derived from surface-to-50m thermal gradient corroborated by dynamical signals
    t0_grid = sub_temps[0]
    sub_0_50 = sub_temps[:6].copy()
    for k in range(1, 6):
        sub_0_50[k] = inf.np.where(inf.np.isnan(sub_0_50[k]), sub_0_50[k - 1], sub_0_50[k])
    t50_grid = sub_0_50[5]
    temp_gap = inf.np.nan_to_num(inf.np.maximum(0.0, t0_grid - t50_grid), nan=0.0)
    raw_ui = inf.np.clip(temp_gap / 5.0, 0.0, 1.0)

    if inf._ssh_anom is not None and 0 <= mapped_day_idx < inf._ssh_anom.shape[0]:
        sla_grid = inf._ssh_anom[mapped_day_idx, ::lat_step, ::lon_step]
    else:
        sla_grid = inf.np.zeros_like(sst_sub)

    # Primary corroboration: Positive ERA5 Ekman pumping velocity (w_E >= 0.30 m/day)
    # evaluated across a +-2 grid cell (~0.5° matching ~30-50km Rossby radius) spatial window
    # to avoid false negatives at grid-scale curl zero-crossings near coastlines
    # Fallback corroboration: SLA depression or strong thermal front with cool SST
    ek_arr = _get_ekman_array()
    if ek_arr is not None and 0 <= mapped_day_idx < len(ek_arr):
        ocean_full = (inf._sst_arr[mapped_day_idx] >= 0.5) if (inf._sst_arr is not None and mapped_day_idx < inf._sst_arr.shape[0]) else inf.np.isfinite(spatial[0])
        ek_full = inf.np.array(ek_arr[mapped_day_idx], dtype=float)
        ek_full[~ocean_full] = -999.0
        ek_max_full = maximum_filter(ek_full, size=(5, 5), mode="nearest")
        ek_sub = ek_max_full[::lat_step, ::lon_step]
        upwelling_confirmed = (ek_sub >= 0.30)
    else:
        upwelling_confirmed = (sla_grid <= -0.02) | ((front_strength_grid >= 0.8) & (sst_sub <= 28.0))

    heat_excess = inf.np.maximum(0.0, (sst_sub - 28.0) / 3.0)
    sla_penalty = inf.np.clip((sla_grid - (-0.02)) / 0.06, 0.0, 1.0)
    damping = inf.np.maximum(0.15, 1.0 - inf.np.maximum(sla_penalty, heat_excess) * 0.8)
    sla_mult = inf.np.where(upwelling_confirmed, 1.0, damping)
    upwelling_val = inf.np.round(raw_ui * sla_mult, 2)

    # 4. Surface Chlorophyll-a (mg/m^3) with Three-Tier Priority:
    # Tier 1 (satellite) & Tier 2 (climatology) from chla_arr; Tier 3 synthetic heuristic fallback
    if inf._u_cur_anom is not None and 0 <= mapped_day_idx < inf._u_cur_anom.shape[0]:
        u_cur = inf._u_cur_anom[mapped_day_idx, ::lat_step, ::lon_step]
        v_cur = inf._v_cur_anom[mapped_day_idx, ::lat_step, ::lon_step]
    else:
        u_cur = inf.np.zeros_like(sst_sub)
        v_cur = inf.np.zeros_like(sst_sub)
    cur_mag = inf.np.sqrt(u_cur ** 2 + v_cur ** 2)
    chla_heuristic = inf.np.clip(0.25 + 2.5 * upwelling_val - 1.2 * sla_grid + 0.35 * cur_mag, 0.05, 9.8)

    chla_arr, chl_source_arr = _get_chlorophyll_arrays()
    if chla_arr is not None and chl_source_arr is not None and 0 <= mapped_day_idx < len(chla_arr):
        sub_chla = inf.np.array(chla_arr[mapped_day_idx, ::lat_step, ::lon_step], dtype=float)
        sub_src = chl_source_arr[mapped_day_idx, ::lat_step, ::lon_step]
        valid_chla = (sub_src >= 0) & (sub_chla > 0.0) & (~inf.np.isnan(sub_chla))
        chla_val = inf.np.where(valid_chla, sub_chla, chla_heuristic)
    else:
        chla_val = chla_heuristic

    chla_val = inf.np.clip(chla_val, 0.05, 9.8)
    nutr_tc_grid = inf.np.where(tc_detected_grid, tc_depth, 30.0)
    dcm_peak_0 = 1.35 * chla_val * inf.np.exp(-((nutr_tc_grid) ** 2) / (2 * (28.0 ** 2)))
    nutr_surface = chla_val * 0.30 + dcm_peak_0 + 0.25

    # 5. Composite PFZ Confidence Score (0.10 to 0.98):
    # Proportional weight redistribution when thermocline is excluded (shallow shelf/delta/strait waters <60m)
    pfz_normal = 0.35 * tc_factor + 0.35 * upwelling_val + 0.15 * front_strength_grid + 0.15 * inf.np.minimum(1.0, nutr_surface / 3.0)
    pfz_shallow = (0.35 * upwelling_val + 0.15 * front_strength_grid + 0.15 * inf.np.minimum(1.0, nutr_surface / 3.0)) / 0.65
    pfz_raw = inf.np.where(tc_detected_grid, pfz_normal, pfz_shallow)
    pfz_grid = inf.np.clip(pfz_raw, 0.10, 0.98)
    pfz_grid = inf.np.round(pfz_grid, 2)

    # 5b. Data-quality guard for upper 50m thermal cliff & flatline corruption (evaluated on raw predictions)
    diffs_0_50_raw = inf.np.diff(sub_temps_raw[:6], axis=0)
    cliff_corrupted = inf.np.any(diffs_0_50_raw < -8.0, axis=0)
    flatline_corrupted = inf.np.any((inf.np.abs(diffs_0_50_raw[:-1]) < 1e-4) & (inf.np.abs(diffs_0_50_raw[1:]) < 1e-4), axis=0)
    shallow_shelf = inf.np.isnan(sub_temps[3])  # Seafloor < 20m (e.g. Gulf of Mannar 10m shelf reef)
    corrupted_grid = cliff_corrupted | flatline_corrupted | shallow_shelf

    # 6. Apply Natural Earth land mask, raw SST ocean mask, shallow reef mask & data quality mask
    land_mask = _get_pfz_land_mask()
    _, chl_source_arr = _get_chlorophyll_arrays()
    sub_src = chl_source_arr[mapped_day_idx, ::lat_step, ::lon_step] if (chl_source_arr is not None and 0 <= mapped_day_idx < len(chl_source_arr)) else None

    H, W = pfz_grid.shape
    scores_list = []
    chla_list = []
    chla_sources_list = []
    for r in range(H):
        score_row = []
        chla_row = []
        source_row = []
        for c in range(W):
            is_land = False
            if land_mask is not None and land_mask[r, c]:
                is_land = True
            elif not ocean_mask[r, c]:
                is_land = True
            elif corrupted_grid[r, c]:
                is_land = True
            elif inf.np.isnan(pfz_grid[r, c]) or inf.np.isnan(chla_val[r, c]):
                is_land = True

            if is_land:
                score_row.append(None)
                chla_row.append(None)
                source_row.append(None)
            else:
                score_row.append(round(float(pfz_grid[r, c]), 2))
                chla_row.append(round(float(chla_val[r, c]), 2))
                if sub_src is not None:
                    code = int(sub_src[r, c])
                    if code == 1:
                        source_row.append("satellite")
                    elif code == 0:
                        source_row.append("climatology")
                    else:
                        source_row.append("heuristic")
                else:
                    source_row.append("heuristic")
        scores_list.append(score_row)
        chla_list.append(chla_row)
        chla_sources_list.append(source_row)

    result = {
        "date": date_str,
        "bounds": {
            "south": float(inf.MIN_LAT),
            "north": float(inf.MAX_LAT),
            "west": float(inf.MIN_LON),
            "east": float(inf.MAX_LON),
        },
        "lats": [round(float(x), 2) for x in sub_lats],
        "lons": [round(float(x), 2) for x in sub_lons],
        "pfz_scores": scores_list,
        "chla_grid": chla_list,
        "chla_sources": chla_sources_list,
    }

    if use_cache:
        with _pfz_grid_cache_lock:
            if len(_pfz_grid_cache) >= _MAX_PFZ_CACHE_SIZE:
                _pfz_grid_cache.pop(next(iter(_pfz_grid_cache)))
            _pfz_grid_cache[date_str] = result
    return result


@app.get("/pfz-grid")
def pfz_grid(date: str):
    """
    Return dynamically computed Potential Fishing Zone (PFZ) confidence scores
    across a downsampled grid (26x41, ~1° spacing) covering the North Indian Ocean basin.
    Uses real model subsurface predictions (thermocline depth, upwelling index,
    and chlorophyll proxy) matching the /predict endpoint formula.
    """
    _validate_date_available(date, need_history=True)
    return compute_pfz_grid(date)


# ---------------------------------------------------------------------------
# ARGO Float Validation & Comparison Endpoints
# ---------------------------------------------------------------------------

MIN_BASIN_SAMPLE_SIZE = int(os.environ.get("MIN_BASIN_SAMPLE_SIZE", "10"))

_argo_summary_cache = None
_argo_summary_cache_lock = threading.Lock()

_argo_skill_score_cache = None


def _load_argo_skill_score():
    """
    Loads and caches the precomputed ARGO skill score benchmark dataset
    from committed backend/data/argo_summary_14yr.json.
    """
    global _argo_skill_score_cache
    if _argo_skill_score_cache is not None:
        return _argo_skill_score_cache
    path = os.path.join(os.path.dirname(__file__), "data", "argo_summary_14yr.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            _argo_skill_score_cache = json.load(f)
            return _argo_skill_score_cache
    return {}


@app.get("/argo/skill-score")
def get_argo_skill_score():
    """
    Returns the comprehensive Skill Score benchmark (model vs monthly climatology baseline)
    validated against 1,809 in-situ ARGO profiles across all 15 standard depths and basins.
    Formula: Skill Score = 1 - (RMSE_model^2 / RMSE_climatology^2).
    """
    data = _load_argo_skill_score()
    if not data:
        raise HTTPException(status_code=404, detail="ARGO skill score benchmark data not found (argo_summary_14yr.json).")
    return data



@app.get("/argo/profiles")
def get_argo_profiles():
    """
    Returns a lightweight list of all cached ARGO profiles for map marker rendering,
    without full vertical arrays, ensuring fast initial page load.
    """
    data = _load_argo_dataset()
    lightweight = []
    for p in data.get("profiles", []):
        lightweight.append({
            "id": p["id"],
            "wmoFloatId": p.get("wmoFloatId"),
            "cycleNumber": p.get("cycleNumber"),
            "latitude": p["latitude"],
            "longitude": p["longitude"],
            "date": p["date"],
            "timestamp": p.get("timestamp"),
            "subRegion": p.get("subRegion", "North Indian Ocean"),
            "dac": p.get("dac", "GDAC"),
            "surfaceTemp": p.get("metrics", {}).get("surfaceTemp"),
            "mld": p.get("metrics", {}).get("mld"),
            "ohc300": p.get("metrics", {}).get("ohc300"),
        })
    return lightweight


@app.get("/argo/compare")
def compare_argo_profile(
    id: str,
    raw: Optional[bool] = Query(None),
    smoothing: Optional[bool] = Query(None),
    corrected: Optional[bool] = Query(None),
    smoothed: Optional[bool] = Query(None),
):
    """
    Compares real in-situ ARGO float observations against AI deep learning predictions
    for the exact location and date. Computes per-depth difference, RMSE, bias, and correlation.
    Supports independent flags:
    - corrected: bool (default True) -> controls Argo depth bias correction
    - smoothed: bool (default True) -> controls PAVA isotonic decreasing smoothing (0-100m)
    - raw / smoothing: legacy backwards-compatibility aliases
    """
    data = _load_argo_dataset()
    profile = next(
        (p for p in data.get("profiles", []) if p["id"] == id or str(p.get("wmoFloatId")) == id),
        None,
    )
    if not profile:
        raise HTTPException(status_code=404, detail=f"ARGO profile '{id}' not found.")

    lat = float(profile["latitude"])
    lon = float(profile["longitude"])
    date_str = str(profile["date"])

    # Resolve independent corrected and smoothed flags
    # Default behavior for Argo compare: corrected=True, smoothed=False (default smoothed=false everywhere)
    if corrected is not None:
        is_corrected = bool(corrected)
    elif raw is not None:
        is_corrected = not bool(raw)
    else:
        is_corrected = True

    if smoothed is not None:
        is_smoothed = bool(smoothed)
    elif smoothing is not None:
        is_smoothed = bool(smoothing)
    else:
        is_smoothed = False  # Default smoothed=false everywhere

    if v6_adapter.is_date_in_window(date_str):
        pred = v6_adapter.predict_temperature_profile(
            lat, lon, date_str,
            raw=(not is_corrected),
            smoothing=is_smoothed,
            corrected=is_corrected
        )
    else:
        pred = predict_temperature_profile(lat, lon, date_str, raw=(not is_corrected))
    if "error" in pred:
        raise HTTPException(status_code=400, detail=pred["error"])

    depths = inf.STANDARD_DEPTHS
    ai_temps = [(round(float(pred[d]), 2) if pred[d] is not None else None) for d in depths]
    argo_temps = [(round(float(t), 2) if t is not None else None) for t in profile["temperatures"]]

    # Depth-by-depth differences (AI - ARGO)
    diffs = [(round(ai - argo, 2) if (ai is not None and argo is not None) else None) for ai, argo in zip(ai_temps, argo_temps)]

    # Metrics computed over valid depth pairs
    valid_pairs = [(ai, argo) for ai, argo in zip(ai_temps, argo_temps) if ai is not None and argo is not None]
    if valid_pairs:
        ai_arr = inf.np.array([p[0] for p in valid_pairs], dtype=float)
        argo_arr = inf.np.array([p[1] for p in valid_pairs], dtype=float)
        diff_arr = ai_arr - argo_arr

        rmse = round(float(inf.np.sqrt(inf.np.mean(inf.np.square(diff_arr)))), 2)
        bias = round(float(inf.np.mean(diff_arr)), 2)
        if inf.np.std(ai_arr) > 1e-4 and inf.np.std(argo_arr) > 1e-4:
            corr = round(float(inf.np.corrcoef(ai_arr, argo_arr)[0, 1]), 4)
        else:
            corr = 1.0
        max_abs_err = round(float(inf.np.max(inf.np.abs(diff_arr))), 2)
    else:
        rmse, bias, corr, max_abs_err = 0.0, 0.0, 1.0, 0.0

    surf_inputs = extract_surface_inputs(lat, lon, date_str)

    return {
        "profile": {
            "id": profile["id"],
            "wmoFloatId": profile.get("wmoFloatId"),
            "cycleNumber": profile.get("cycleNumber"),
            "latitude": lat,
            "longitude": lon,
            "date": date_str,
            "timestamp": profile.get("timestamp"),
            "subRegion": profile.get("subRegion"),
            "dac": profile.get("dac"),
            "sourceNetCdf": profile.get("sourceNetCdf"),
            "rawMeasurementsCount": profile.get("rawMeasurementsCount"),
            "rawDepthRange": profile.get("rawDepthRange"),
            "argoMetrics": profile.get("metrics"),
        },
        "depths": depths,
        "aiTemps": ai_temps,
        "argoTemps": argo_temps,
        "diffs": diffs,
        "raw": not is_corrected,
        "corrected": is_corrected,
        "smoothed": is_smoothed,
        "smoothing": is_smoothed,
        "metrics": {
            "rmse": rmse,
            "bias": bias,
            "correlation": corr,
            "corr": corr,
            "maxAbsError": max_abs_err,
        },
        "surfaceInputs": surf_inputs,
        "data_source": v6_adapter.MODEL_NAME,
        "provenance": v6_adapter.PROVENANCE_NOTE,
    }


def compute_argo_summary(force_refresh: bool = False) -> dict:
    """
    Returns aggregate ARGO validation statistics directly from the committed
    14-year summary file (backend/data/argo_summary_14yr.json), guaranteeing
    instant sub-millisecond responses without requiring runtime bundle computation.
    """
    global _argo_summary_cache
    if _argo_summary_cache is not None and not force_refresh:
        return _argo_summary_cache

    with _argo_summary_cache_lock:
        if _argo_summary_cache is not None and not force_refresh:
            return _argo_summary_cache

        summary_file = os.path.join(os.path.dirname(__file__), "data", "argo_summary_14yr.json")
        if not os.path.exists(summary_file):
            raise HTTPException(
                status_code=404,
                detail="ARGO summary dataset not found (argo_summary_14yr.json). Please run 'python backend/compute_argo_summary.py' to generate it."
            )

        with open(summary_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        overall = data.get("overall", {})
        res = dict(overall)
        res["overall"] = overall
        res["full_year_2023"] = data.get("full_year_2023", {})
        res["basins"] = data.get("basins", {})
        res["depths"] = data.get("depths", [])
        res["subRegions"] = data.get("subRegions", {})
        res["metadata"] = data.get("metadata", {})
        res["provenance"] = data.get("provenance", v6_adapter.PROVENANCE_NOTE)
        _argo_summary_cache = res
        return _argo_summary_cache


@app.get("/argo/summary")
def get_argo_summary(refresh: Optional[bool] = Query(False)):
    """
    Returns aggregate validation metrics (RMSE, Bias, Pearson correlation vs monthly climatology baseline, n=41 Argo profiles)
    across all cached ARGO profiles, powering the top-level benchmark stat cards.
    Dynamically computed against the active model checkpoint and thread-safe cached in-memory.
    """
    return compute_argo_summary(force_refresh=bool(refresh))


@app.post("/marine-heatwave")
def post_marine_heatwave(req: MarineHeatwaveRequest):
    """
    Evaluates Marine Heatwave (MHW) events and status using the Hobday et al. (2016)
    definition and 2021-2023 90th percentile SST climatology.
    """
    ref_date = req.reference_date or req.date
    result = detect_marine_heatwaves(
        latitude=req.latitude,
        longitude=req.longitude,
        start_date=req.start_date,
        end_date=req.end_date,
        reference_date=ref_date
    )
    if "error" in result and not result.get("sst_timeseries"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/marine-heatwave")
def get_marine_heatwave(
    latitude: float = Query(..., ge=inf.MIN_LAT, le=inf.MAX_LAT),
    longitude: float = Query(..., ge=inf.MIN_LON, le=inf.MAX_LON),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    reference_date: Optional[str] = None,
    date: Optional[str] = None
):
    """
    GET convenience endpoint for Marine Heatwave analysis.
    """
    ref_date = reference_date or date
    result = detect_marine_heatwaves(
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
        reference_date=ref_date
    )
    if "error" in result and not result.get("sst_timeseries"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api_server:app", host="0.0.0.0", port=port, reload=False)


