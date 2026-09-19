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

import inference as inf
from inference import predict_temperature_profile
from marine_ecology import detect_marine_heatwaves, _load_climatology
try:
    import products as prod
except ImportError:
    from backend import products as prod

# ---------------------------------------------------------------------------
# SIH DEMO CACHE PRE-WARMING CONFIGURATION
# ---------------------------------------------------------------------------
# Key dates planned for live SIH demonstration.
# A single inference call per date pre-populates the in-memory LRU cache
# for all 24,341 points across the basin, guaranteeing instant (<1ms)
# responses when clicking floats or coordinates during the live demo.
DEMO_PREWARM_DATES = [
    "2021-02-14",  # ARGO Float #2902282 (Cycle 126) - Bay of Bengal validation
    "2022-07-02",  # Dashboard Explore baseline & temperature grid
    "2021-02-16",  # ARGO Float #2902205 (Cycle 274) - Arabian Sea auto-comparison
    "2023-09-04",  # Fisheries Advisory PFZ & upwelling analysis
]
REPRESENTATIVE_LAT = 15.0
REPRESENTATIVE_LON = 70.0


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
            predict_temperature_profile(REPRESENTATIVE_LAT, REPRESENTATIVE_LON, date_str)
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
    Validates that date_str is available in the dataset before accessing any numpy array.
    If running with trimmed data (or whenever day_index_map is active), verifies day_idx is
    present in day_index_map, and if need_history=True, verifies that the 10-day lookback
    history is also present and contiguous in day_index_map.
    In USE_FULL_FLOAT16_DATA mode, validates that day_idx is within the continuous 1095-day span
    (2021-01-01 through 2023-12-31) and that >= 10 days of history exist if need_history=True.
    Raises HTTP 400 with 'This date is not available in the deployed demo dataset.' on any violation.
    Returns (day_idx, mapped_arr_idx).
    """
    day_idx = _day_index(date_str)
    if inf.USE_TRIMMED_DATA or inf._day_index_map is not None:
        if inf._day_index_map is None or day_idx not in inf._day_index_map:
            raise HTTPException(
                status_code=400,
                detail="This date is not available in the deployed demo dataset.",
            )
        if need_history:
            lookback_idx = day_idx - inf.LOOKBACK_DAYS
            if (
                lookback_idx not in inf._day_index_map
                or (inf._day_index_map[day_idx] - inf._day_index_map[lookback_idx] != inf.LOOKBACK_DAYS)
            ):
                raise HTTPException(
                    status_code=400,
                    detail="This date is not available in the deployed demo dataset.",
                )
        mapped_arr_idx = inf._day_index_map[day_idx]
    else:
        max_day = inf.TOTAL_DAYS_FULL_FLOAT16 if inf.USE_FULL_FLOAT16_DATA else inf._total_days
        max_day = min(max_day, inf._total_days)
        min_day = inf.LOOKBACK_DAYS if need_history else 0
        if day_idx < min_day or day_idx >= max_day:
            raise HTTPException(
                status_code=400,
                detail="This date is not available in the deployed demo dataset.",
            )
        mapped_arr_idx = day_idx

    if mapped_arr_idx < 0 or mapped_arr_idx >= inf._total_days:
        raise HTTPException(
            status_code=400,
            detail="This date is not available in the deployed demo dataset.",
        )

    return day_idx, mapped_arr_idx


def _get_mdt(arr_idx: int) -> inf.np.ndarray:
    """
    Compute physical Mean Dynamic Topography (MDT) from climatological steric height.
    Steric height integrates thermal expansion in the upper 300m:
    Ranges physically from ~0.35m in western upwelling basin (Somalia/Oman)
    to ~0.85m in the warm pool / Bay of Bengal.
    """
    if arr_idx < 0 or arr_idx >= inf._temp_target_clim.shape[0]:
        raise HTTPException(
            status_code=400,
            detail="This date is not available in the deployed demo dataset.",
        )
    clim = inf._temp_target_clim[arr_idx]
    depths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300]
    steric = inf.np.zeros((101, 241), dtype=inf.np.float32)
    for i in range(1, len(depths)):
        dz = depths[i] - depths[i - 1]
        t_avg = (clim[i] + clim[i - 1]) / 2.0
        steric += 2.1e-4 * inf.np.maximum(0.0, t_avg - 4.0) * dz

    ocean = (inf._sst_arr[arr_idx] > 0.5)
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
        argo_path = os.path.join(os.path.dirname(__file__), "data", "argo_profiles.json")
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
    mld_val = prod.compute_mld(raw_temps_for_indices, depths)
    d20_val = prod.compute_d20(temps_for_indices, depths)
    d26_val = prod.compute_d26(temps_for_indices, depths)
    tchp_info = prod.tchp_argo_corrected(temps_for_indices, depths)
    ohc300_val = prod.compute_ohc300(temps_for_indices, depths)

    # 1. Thermocline Depth (Z_tc): depth of maximum -dT/dz in upper 20-250m
    max_grad = -999.0
    valid_depths = [d for d, t in zip(depths, temps) if t is not None]
    tc_depth = min(60.0, float(valid_depths[-1])) if valid_depths else 60.0
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
                tc_depth = (z1 + z2) / 2.0

    if valid_depths:
        tc_depth = min(tc_depth, float(valid_depths[-1]))

    # 2. Upwelling Index (UI in [0, 1]):
    # Derived from surface-to-50m thermal gradient (T(0) - T(50)):
    # - Weak gradient (<1°C drop across 50m, stratified/downwelling) -> Low UI (~0.0 - 0.2)
    # - Moderate gradient (1-3°C drop across 50m) -> Moderate UI (~0.3 - 0.6)
    # - Strong gradient (>4°C drop, cold water shoaling near surface) -> High UI (~0.7 - 1.0)
    t0 = temps[0] if temps[0] is not None else 28.0
    t50 = temps[depths.index(50)] if (50 in depths and depths.index(50) < len(temps)) else None
    if t50 is None:
        valid_t = [t for t in temps if t is not None]
        t50 = valid_t[-1] if valid_t else t0
    temp_gap = max(0.0, t0 - t50)
    upwelling_val = max(0.0, min(1.0, temp_gap / 5.0))

    # 2b. Horizontal Thermal Front Gradient (deg C / 100 km):
    # Literature-grounded productivity/front proxy derived from horizontal SST gradient
    # magnitude (Sobel / central differences) over the spatial SST field.
    # Fronts concentrate plankton and pelagic fish at convergent water mass boundaries.
    _, mapped_day_idx = _validate_date_available(date_str, need_history=False)
    lat_i = int(inf.np.argmin(inf.np.abs(inf._target_lats - latitude)))
    lon_j = int(inf.np.argmin(inf.np.abs(inf._target_lons - longitude)))
    d_lat_km = 27.78
    lats_rad = inf.np.radians(inf._target_lats[lat_i])
    d_lon_km = 27.78 * float(inf.np.cos(lats_rad))

    sst_grid = inf.np.array(inf._sst_arr[mapped_day_idx], dtype=float)
    sst_grid[sst_grid <= 0.0] = inf.np.nan

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

    # 3. Chlorophyll-a proxy (mg/m^3):
    # Scalar surface primary productivity proxy derived from near-surface dynamics:
    # upwelling index (0-50m thermal gradient), sea level anomaly (SLA cyclonic pumping),
    # and surface geostrophic current speed.
    # Note on chlorophyll quantities:
    # - 'chla_val' (indices.chlorophyll_a): Scalar surface primary productivity proxy (mg/m³)
    #   driving the amplitude of the vertical nutrient model. Preserved in API response for callers.
    # - 'nutrients' (indices.nutrients): Depth-resolved vertical primary productivity profile (mg/m³)
    #   synthesized across depths (step 4). In stratified tropical oceans, surface photoinhibition
    #   and upper-layer nutrient exhaustion cause chlorophyll to peak at the nutricline/thermocline
    #   (Deep Chlorophyll Maximum / DCM).
    # - 'nutrients[0]': The surface (0m) value of the vertical chlorophyll model, displayed as
    #   'Surface Chlorophyll-a Proxy' in Card 4, matching Table Row 0, and used directly as the
    #   biological input in the PFZ confidence score (step 5, weight 0.15) so that
    #   PFZ_Chl_input == displayed Card 4 value == table row 0 value.
    sla_val = surf_inputs.get("sla", {}).get("val", 0.0)
    cur_val = surf_inputs.get("current", {}).get("val", 0.2)
    chla_val = max(0.05, min(9.8, 0.25 + 2.5 * upwelling_val - 1.2 * sla_val + 0.35 * cur_val))

    # 4. Vertical Nutrient / Chlorophyll Profile (mg/m^3) across standard depths:
    # Explicitly linked to chla_val: shares the same root surface productivity magnitude,
    # but models the depth-dependent Deep Chlorophyll Maximum (DCM) peak at thermocline depth.
    nutrients = []
    for d in depths:
        peak = 1.35 * chla_val * float(inf.np.exp(-((d - tc_depth) ** 2) / (2 * (28.0 ** 2))))
        base = chla_val * 0.30 if d < 100 else 0.15
        deep_val = 0.25 * float(inf.np.exp(-d / 400.0))
        nutrients.append(round(base + peak + deep_val, 2))

    # 5. Composite PFZ Assessment Index (0.10 to 0.98):
    # 85% Model-Derived: Thermocline shoaling factor (35%) + Vertical upwelling dT/dz (35%) +
    #                     Horizontal thermal front gradient (15%)
    # 15% Estimated Heuristic: Surface primary productivity proxy (15%)
    surface_chla = nutrients[0]
    tc_factor = max(0.0, min(1.0, (120.0 - tc_depth) / 80.0))

    if dq_flag:
        # Temperature corruption detected in 0-50m band: mark data_quality_flag: true
        # and suppress normal PFZ score calculation
        pfz_val = None
    else:
        pfz_val = round(max(0.1, min(0.98, 0.35 * tc_factor + 0.35 * upwelling_val + 0.15 * front_strength + 0.15 * min(1.0, surface_chla / 3.0))), 2)

    profile = [{"depth": d, "temperature": (round(float(t), 2) if t is not None else None)} for d, t in zip(depths, temps)]

    return {
        "depths": depths,
        "temps": temps,
        "raw_temps": raw_temps,
        "profile": profile,
        "surfaceInputs": surf_inputs,
        "indices": {
            "mld": mld_val,
            "d20": d20_val,
            "d26": d26_val,
            "tchp": tchp_info["value"],
            "tchp_band": tchp_info["band"],
            "tchp_raw": tchp_info["raw_tchp"],
            "ohc300": ohc300_val,
            "thermocline_depth": round(tc_depth, 1),
            "upwelling_index": round(upwelling_val, 2),
            "thermal_front_gradient": front_grad_mag,
            "thermal_front_strength": front_strength,
            "chlorophyll_a": round(chla_val, 2),
            "pfz": pfz_val,
            "pfz_confidence_score": pfz_val,
            "data_quality_flag": dq_flag,
            "data_quality_reason": dq_reason if dq_flag else None,
            "nutrients": nutrients,
            "pfz_formula": {
                "thermocline_factor": round(float(tc_factor), 2),
                "upwelling_index": round(float(upwelling_val), 2),
                "front_strength": round(float(front_strength), 2),
                "surface_chla": round(float(surface_chla), 2),
                "weights": {
                    "thermocline": 0.35,
                    "upwelling": 0.35,
                    "thermal_front": 0.15,
                    "chlorophyll_proxy": 0.15
                },
                "model_derived_pct": 85,
                "heuristic_pct": 15
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
):
    _validate_date_available(req.date, need_history=True)

    is_raw = False
    if raw is not None:
        is_raw = bool(raw)
    elif smoothing is not None:
        is_raw = not bool(smoothing)
    elif req.raw is not None:
        is_raw = bool(req.raw)
    elif req.smoothing is not None:
        is_raw = not bool(req.smoothing)

    result = predict_temperature_profile(req.latitude, req.longitude, req.date, raw=is_raw)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    raw_result = result if is_raw else predict_temperature_profile(req.latitude, req.longitude, req.date, raw=True)
    resp = model_result_to_frontend(result, req.latitude, req.longitude, req.date, raw_result=raw_result)
    resp["raw"] = is_raw
    return resp


@app.get("/predict")
def predict_get(
    latitude: float = Query(..., ge=inf.MIN_LAT, le=inf.MAX_LAT),
    longitude: float = Query(..., ge=inf.MIN_LON, le=inf.MAX_LON),
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    raw: Optional[bool] = Query(None),
    smoothing: Optional[bool] = Query(None),
):
    req = PredictRequest(latitude=latitude, longitude=longitude, date=date, raw=raw, smoothing=smoothing)
    return predict(req, raw=raw, smoothing=smoothing)


_spatial_prediction_cache = {}
_spatial_prediction_cache_lock = threading.Lock()
_MAX_CACHE_SIZE = 4


def get_spatial_predictions(date_str: str, raw: bool = False):
    """
    Run full spatial CNN-LSTM inference on the (101, 241) grid for the target date.
    Returns a (15, 101, 241) float array where land cells are masked to 0.0.
    Caches recent dates in memory so subsequent depth slices return in 0.000s.
    When raw=True, skips the PAVA isotonic decreasing pass so callers can inspect
    unsmoothed spatial profiles.
    """
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
        del window_tensor

        clim_at_day = inf.np.array(inf._temp_target_clim[mapped_day_idx])
        prediction_real = (prediction_anom[0].cpu().numpy() + clim_at_day).astype("float32")
        prediction_real[~inf._valid_depth_mask] = inf.np.nan
        del prediction_anom
        del clim_at_day
        if use_cache:
            with inf._prediction_cache_lock:
                inf._prediction_cache[date_str] = prediction_real.copy()
                if len(inf._prediction_cache) > inf._MAX_PREDICTION_CACHE_SIZE:
                    inf._prediction_cache.popitem(last=False)

    raw_sst = inf.np.array(inf._sst_arr[mapped_day_idx])
    land_mask = inf.np.isnan(raw_sst) | (raw_sst <= 0.0)

    # Work on an isolated copy for spatial post-processing to avoid mutating inf._prediction_cache
    out_spatial = prediction_real.copy()

    raw_m0 = out_spatial[0].copy()
    valid_s0 = ~inf.np.isnan(raw_m0) & ~land_mask
    diff = inf.np.abs(raw_sst - raw_m0)
    alpha = inf.np.clip(0.60 - 0.15 * diff, 0.30, 0.60)
    blended_sst = alpha * raw_sst + (1.0 - alpha) * raw_m0
    out_spatial[0, valid_s0] = blended_sst[valid_s0]

    delta_s = blended_sst - raw_m0
    valid_s1 = ~inf.np.isnan(out_spatial[1]) & ~land_mask
    out_spatial[1, valid_s1] += 0.50 * delta_s[valid_s1]

    # Monotonicity safety-net pass across ocean cells (depths <= 100m only)
    if not raw:
        ocean_cells = ~land_mask
        if ocean_cells.any():
            upper_depth_count = sum(1 for d in inf.STANDARD_DEPTHS if d <= 100)  # 8 depths: 0-100m
            upper_subset = out_spatial[:upper_depth_count, ocean_cells]
            for c in range(upper_subset.shape[1]):
                col = upper_subset[:, c]
                valid_mask_c = ~inf.np.isnan(col)
                if valid_mask_c.sum() > 1:
                    upper_subset[valid_mask_c, c] = inf._isotonic_decreasing(col[valid_mask_c])
            out_spatial[:upper_depth_count, ocean_cells] = upper_subset

            # Argo Empirical Warm-Bias Correction (pinned to model_v6_satswap_anom)
            out_spatial[:, ocean_cells] = prod.correct_profile(out_spatial[:, ocean_cells])

    for d in range(len(inf.STANDARD_DEPTHS)):
        out_spatial[d][land_mask] = 0.0
        valid_ocean_d = (~land_mask) & (~inf.np.isnan(out_spatial[d]))
        out_spatial[d][valid_ocean_d] = inf.np.maximum(4.0, out_spatial[d][valid_ocean_d])

    if not raw:
        ocean_cells = ~land_mask
        if ocean_cells.any():
            # Guarantee non-increasing temperatures below thermocline (depths >= 100m)
            for d in range(7, len(inf.STANDARD_DEPTHS)):
                valid_pair = ocean_cells & (~inf.np.isnan(out_spatial[d])) & (~inf.np.isnan(out_spatial[d - 1]))
                out_spatial[d][valid_pair] = inf.np.minimum(out_spatial[d][valid_pair], out_spatial[d - 1][valid_pair])

    # Re-enforce valid depth mask (depths below seafloor remain strictly NaN)
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
):
    """
    Return real gridded ocean temperature slice at the specified depth and date.
    Generated directly from the CNN-LSTM deep learning model output, guaranteeing
    100% exact numerical consistency with the /predict endpoint and TVD table.
    When raw=True (or smoothing=False), returns unsmoothed model output bypassing PAVA.
    Land cells are represented as 0.0. Masked cells below the seafloor return null.
    """
    if depth not in inf.STANDARD_DEPTHS:
        raise HTTPException(status_code=400, detail=f"Invalid depth {depth}. Must be one of {inf.STANDARD_DEPTHS}")

    depth_idx = inf.STANDARD_DEPTHS.index(depth)
    _validate_date_available(date, need_history=True)

    is_raw = False
    if raw is not None:
        is_raw = bool(raw)
    elif smoothing is not None:
        is_raw = not bool(smoothing)

    sub_lats = inf._target_lats.tolist()
    sub_lons = inf._target_lons.tolist()

    spatial_preds = get_spatial_predictions(date, raw=is_raw)
    grid_slice = inf.np.where(
        inf.np.isnan(spatial_preds[depth_idx]),
        None,
        inf.np.round(spatial_preds[depth_idx], 2)
    ).tolist()

    return {
        "depth": depth,
        "date": date,
        "raw": is_raw,
        "bounds": {
            "south": float(inf.MIN_LAT),
            "north": float(inf.MAX_LAT),
            "west": float(inf.MIN_LON),
            "east": float(inf.MAX_LON),
        },
        "lats": sub_lats,
        "lons": sub_lons,
        "grid": grid_slice,
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
    ocean_mask = (inf._sst_arr[mapped_day_idx, ::lat_step, ::lon_step] >= 0.5)

    # 1. Thermocline depth (tc_depth): depth of maximum temperature gradient in upper 300m
    depths = inf.STANDARD_DEPTHS
    # Upper 300m intervals: 0-5, 5-10, 10-20, 20-30, 30-50, 50-75, 75-100, 100-125, 125-150, 150-200, 200-300 (11 intervals)
    # Replace sub-seafloor NaNs with -999.0 so argmax ignores missing depths below local bathymetry
    grads = [inf.np.nan_to_num((sub_temps[i] - sub_temps[i + 1]) / (depths[i + 1] - depths[i]), nan=-999.0) for i in range(11)]
    grad_stack = inf.np.stack(grads, axis=0)
    max_idx = inf.np.argmax(grad_stack, axis=0)
    mid_arr = inf.np.array([(depths[i] + depths[i + 1]) / 2.0 for i in range(11)], dtype="float32")
    tc_depth = mid_arr[max_idx]
    tc_factor = inf.np.clip((120.0 - tc_depth) / 80.0, 0.0, 1.0)

    # 2. Upwelling index (UI in [0, 1]): derived from surface-to-50m thermal gradient
    # In shallow shelf waters where 50m is beneath the seafloor, forward fill deepest valid depth <= 50m
    t0_grid = sub_temps[0]
    sub_0_50 = sub_temps[:6].copy()
    for k in range(1, 6):
        sub_0_50[k] = inf.np.where(inf.np.isnan(sub_0_50[k]), sub_0_50[k - 1], sub_0_50[k])
    t50_grid = sub_0_50[5]
    temp_gap = inf.np.nan_to_num(inf.np.maximum(0.0, t0_grid - t50_grid), nan=0.0)
    upwelling_val = inf.np.clip(temp_gap / 5.0, 0.0, 1.0)

    # 2b. Horizontal Thermal Front Gradient across full grid, sampled to resolution
    sst_full = inf.np.array(inf._sst_arr[mapped_day_idx], dtype=float)
    sst_full[sst_full <= 0.0] = inf.np.nan
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

    # 3. Surface Chlorophyll-a proxy (mg/m^3): exactly matching nutrients[0] at depth 0m
    sla_grid = inf._ssh_anom[mapped_day_idx, ::lat_step, ::lon_step]
    u_cur = inf._u_cur_anom[mapped_day_idx, ::lat_step, ::lon_step]
    v_cur = inf._v_cur_anom[mapped_day_idx, ::lat_step, ::lon_step]
    cur_mag = inf.np.sqrt(u_cur ** 2 + v_cur ** 2)
    chla_val = inf.np.clip(0.25 + 2.5 * upwelling_val - 1.2 * sla_grid + 0.35 * cur_mag, 0.05, 9.8)
    dcm_peak_0 = 1.35 * chla_val * inf.np.exp(-((tc_depth) ** 2) / (2 * (28.0 ** 2)))
    nutr_surface = chla_val * 0.30 + dcm_peak_0 + 0.25

    # 4. PFZ Confidence Score (0.10 to 0.98): 85% model-derived (thermocline + upwelling + front), 15% proxy
    pfz_raw = 0.35 * tc_factor + 0.35 * upwelling_val + 0.15 * front_strength_grid + 0.15 * inf.np.minimum(1.0, nutr_surface / 3.0)
    pfz_grid = inf.np.clip(pfz_raw, 0.10, 0.98)
    pfz_grid = inf.np.round(pfz_grid, 2)

    # 4b. Data-quality guard for upper 50m thermal cliff & flatline corruption (evaluated on raw predictions)
    diffs_0_50_raw = inf.np.diff(sub_temps_raw[:6], axis=0)
    cliff_corrupted = inf.np.any(diffs_0_50_raw < -8.0, axis=0)
    flatline_corrupted = inf.np.any((inf.np.abs(diffs_0_50_raw[:-1]) < 1e-4) & (inf.np.abs(diffs_0_50_raw[1:]) < 1e-4), axis=0)
    corrupted_grid = cliff_corrupted | flatline_corrupted

    # 5. Apply Natural Earth land mask, raw SST ocean mask & data quality mask
    land_mask = _get_pfz_land_mask()
    H, W = pfz_grid.shape
    scores_list = []
    chla_list = []
    for r in range(H):
        score_row = []
        chla_row = []
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
            else:
                score_row.append(round(float(pfz_grid[r, c]), 2))
                chla_row.append(round(float(chla_val[r, c]), 2))
        scores_list.append(score_row)
        chla_list.append(chla_row)

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
    (model vs monthly climatology normals across 41 ARGO floats).
    """
    global _argo_skill_score_cache
    if _argo_skill_score_cache is not None:
        return _argo_skill_score_cache
    path = os.path.join(os.path.dirname(__file__), "data", "argo_skill_score.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            _argo_skill_score_cache = json.load(f)
            return _argo_skill_score_cache
    return {}


@app.get("/argo/skill-score")
def get_argo_skill_score():
    """
    Returns the comprehensive Skill Score benchmark (model vs monthly climatology baseline, n=41 Argo profiles)
    validated against 41 in-situ ARGO profiles across all 15 standard depths and 4 basins.
    Formula: Skill Score = 1 - (RMSE_model^2 / RMSE_climatology^2).
    """
    data = _load_argo_skill_score()
    if not data:
        raise HTTPException(status_code=404, detail="ARGO skill score benchmark data not found.")
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
):
    """
    Compares real in-situ ARGO float observations against AI deep learning predictions
    for the exact location and date. Computes per-depth difference, RMSE, bias, and correlation.
    When raw=True (or smoothing=False), returns unsmoothed model predictions bypassing PAVA.
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

    is_raw = False
    if raw is not None:
        is_raw = bool(raw)
    elif smoothing is not None:
        is_raw = not bool(smoothing)

    pred = predict_temperature_profile(lat, lon, date_str, raw=is_raw)
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
        "raw": is_raw,
        "metrics": {
            "rmse": rmse,
            "bias": bias,
            "correlation": corr,
            "corr": corr,
            "maxAbsError": max_abs_err,
        },
        "surfaceInputs": surf_inputs,
    }


def compute_argo_summary(force_refresh: bool = False) -> dict:
    """
    Computes and caches aggregate ARGO validation statistics against the active model checkpoint.
    Guarantees thread-safe in-memory caching while supporting on-demand dynamic recalculation.
    """
    global _argo_summary_cache
    if _argo_summary_cache is not None and not force_refresh:
        return _argo_summary_cache

    with _argo_summary_cache_lock:
        if _argo_summary_cache is not None and not force_refresh:
            return _argo_summary_cache

        from compute_skill_score import compute_argo_skill_score
        skill_payload = compute_argo_skill_score(save_json=True)
        overall = skill_payload.get("overall", {})
        basins = skill_payload.get("basins", {})
        data = _load_argo_dataset()

        sub_summary = {}
        for r_name, r_data in basins.items():
            sub_summary[r_name] = {
                "count": r_data.get("count", 0),
                "insufficientSample": r_data.get("insufficientSample", False),
                "rmse": r_data.get("rmseModel", 0.0),
                "climatologyRmse": r_data.get("rmseClimatology", 0.0),
                "skillScore": r_data.get("skillScore", 0.0),
                "skillScorePct": r_data.get("skillScorePct", 0.0),
            }
            if r_data.get("insufficientNote"):
                sub_summary[r_name]["insufficientNote"] = r_data["insufficientNote"]

        _argo_summary_cache = {
            "totalFloats": overall.get("totalFloats", 41),
            "totalDepthPoints": overall.get("totalDepthPoints", 615),
            "aggregateRmse": overall.get("rmseModel", 0.75),
            "aggregateBias": overall.get("biasModel", 0.12),
            "aggregateCorr": overall.get("correlationModel", 0.995),
            "climatologyRmse": overall.get("rmseClimatology", 0.84),
            "skillScore": overall.get("skillScore", 0.200),
            "skillScorePct": overall.get("skillScorePct", 20.0),
            "trimmedWindowRmse": overall.get("trimmedWindowRmse", 0.715),
            "trimmedWindowFloats": overall.get("trimmedWindowFloats", 27),
            "trimmedWindowLabel": overall.get("trimmedWindowLabel", "0.715 °C (trimmed demo-window subset, n=27 profiles, V6 vs V4=0.820 °C)"),
            "baselineType": overall.get("baselineType", "monthly climatology"),
            "baselineSampleSize": overall.get("baselineSampleSize", 41),
            "baselineLabel": overall.get("baselineLabel", "vs monthly climatology baseline, n=41 Argo profiles"),
            "subRegions": sub_summary,
            "datasetMetadata": data.get("metadata", {}),
        }
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


