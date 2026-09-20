"""
OceanEmbed / Kyogre — V6 SatSwap 14-Year Model Adapter
======================================================
Serves precomputed predictions from the 14-year satellite model
(v6_satswap_anom_14yr) for the available window: 2023-06-01 to 2023-12-31.
Bypasses runtime neural network forward passes for instant sub-millisecond
responses, enforces the raw-vs-corrected split for oceanographic indices,
and applies provenance metadata.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

# Load serving module from local directory
V6_DIR = Path(__file__).parent / "data" / "v6_satswap_anom_14yr"
sys.path.insert(0, str(V6_DIR.resolve()))
import serving

# Model domain definition
MIN_LAT, MAX_LAT = 5.0, 30.0
MIN_LON, MAX_LON = 45.0, 105.0
RESOLUTION_DEG = 0.25

STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]

MODEL_NAME = "model_v6_satswap_anom_14yr"
PROVENANCE_NOTE = "Currently serving the new 14-year model for June–December 2023. Full 2021–2023 coverage coming soon."
WINDOW_START = "2023-06-01"
WINDOW_END = "2023-12-31"

TCHP_RMSE_BAND = 11.8  # New empirical error band (±11.8 kJ/cm², updated from ±15.7)

# Paths to unpacked folders and correction
UNPACKED_DIR = V6_DIR / "unpacked"
FIELD_DIR = UNPACKED_DIR / "field"
PRODUCTS_DIR = UNPACKED_DIR / "products"
EMBEDDINGS_DIR = UNPACKED_DIR / "embeddings"
CORRECTION_FILE = V6_DIR / "correction_v6_satswap_anom_14yr.json"

# Initialize singleton ServingData instance
serving_data = serving.ServingData(
    field_dir=FIELD_DIR,
    products_dir=PRODUCTS_DIR,
    embeddings_dir=EMBEDDINGS_DIR,
    correction=CORRECTION_FILE,
)

AVAILABLE_DATES = set(serving_data.dates("field"))
TARGET_LATS = np.asarray(serving_data.lats, dtype=np.float64)
TARGET_LONS = np.asarray(serving_data.lons, dtype=np.float64)

# Load SST array for smooth surface blending if available
_sst_arr = None
try:
    base_data = Path(__file__).parent / "data"
    p_f16 = base_data / "float16" / "sst.npy"
    p_reg = base_data / "sst.npy"
    if p_f16.exists():
        _sst_arr = np.load(p_f16, mmap_mode="r")
    elif p_reg.exists():
        _sst_arr = np.load(p_reg, mmap_mode="r")
except Exception:
    _sst_arr = None


def is_date_in_window(date_str: str) -> bool:
    """Check if date is within the active 214-day 14-year model window."""
    return date_str in AVAILABLE_DATES


def get_satellite_sst(latitude: float, longitude: float, date_str: str) -> Optional[float]:
    """Retrieve raw satellite SST at nearest grid cell if SST array is loaded."""
    if _sst_arr is None:
        return None
    try:
        start_ts = pd.Timestamp("2021-01-01").normalize()
        target_ts = pd.Timestamp(date_str).normalize()
        d_idx = (target_ts - start_ts).days
        if 0 <= d_idx < _sst_arr.shape[0]:
            lat_idx = int(np.argmin(np.abs(TARGET_LATS - latitude)))
            lon_idx = int(np.argmin(np.abs(TARGET_LONS - longitude)))
            val = float(_sst_arr[d_idx, lat_idx, lon_idx])
            return val if val > 0.5 else None
    except Exception:
        pass
    return None


def _isotonic_decreasing(y: np.ndarray, weights: np.ndarray = None) -> np.ndarray:
    """Pool Adjacent Violators Algorithm (PAVA) for isotonic non-increasing regression."""
    y = np.array(y, dtype=float)
    n = len(y)
    if weights is None:
        weights = np.ones(n, dtype=float)
    else:
        weights = np.array(weights, dtype=float)

    target = -y.copy()
    blocks = [[target[i], weights[i], [i]] for i in range(n)]

    i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] > blocks[i + 1][0]:
            total_weight = blocks[i][1] + blocks[i + 1][1]
            pooled_val = (blocks[i][0] * blocks[i][1] + blocks[i + 1][0] * blocks[i + 1][1]) / total_weight
            pooled_indices = blocks[i][2] + blocks[i + 1][2]
            blocks[i] = [pooled_val, total_weight, pooled_indices]
            blocks.pop(i + 1)
            if i > 0:
                i -= 1
        else:
            i += 1

    res = np.empty(n, dtype=float)
    for val, _, indices in blocks:
        for idx in indices:
            res[idx] = -val
    return res


def predict_temperature_profile(
    latitude: float,
    longitude: float,
    date_str: str,
    raw: bool = True,
    smoothing: bool = False,
    apply_sst_blend: bool = True,
) -> Dict[str, Any]:
    """
    Wrap ServingData.profile() to output {depth: temp} dictionary format expected by frontend.

    By default:
    - raw=True (or smoothing=False): Returns non-monotonic natural profile (preserving inversions).
    - If smoothing=True (or raw=False): Applies PAVA isotonic decreasing smoothing.
    - If date is outside 2023-06-01 to 2023-12-31, fails gracefully without falling back to old model.
    """
    if not is_date_in_window(date_str):
        return {
            "error": (
                f"Date {date_str} is outside the active model window ({WINDOW_START} to {WINDOW_END}). "
                f"{PROVENANCE_NOTE}"
            )
        }

    if not (MIN_LAT <= latitude <= MAX_LAT and MIN_LON <= longitude <= MAX_LON):
        return {
            "error": f"Coordinates ({latitude}, {longitude}) outside domain ({MIN_LAT}–{MAX_LAT}°N, {MIN_LON}–{MAX_LON}°E)."
        }

    try:
        prof = serving_data.profile(latitude, longitude, date_str)
    except Exception as e:
        return {"error": str(e)}

    if not prof.get("is_ocean", False):
        return {"error": "no satellite data available for this location/date (likely land or data gap)"}

    depths = prof["depths_m"]
    raw_vals = [float(v) if v is not None else np.nan for v in prof["raw_c"]]
    corr_vals = [float(v) if v is not None else np.nan for v in prof.get("corrected_c", raw_vals)]

    # SST blend: blend bulk 0m model prediction with satellite SST if available
    sat_sst = get_satellite_sst(latitude, longitude, date_str) if apply_sst_blend else None
    if sat_sst is not None:
        if not np.isnan(raw_vals[0]):
            diff = abs(sat_sst - raw_vals[0])
            alpha = float(np.clip(0.60 - 0.15 * diff, 0.30, 0.60))
            blended_0m = alpha * sat_sst + (1.0 - alpha) * raw_vals[0]
            delta_s = blended_0m - raw_vals[0]
            raw_vals[0] = blended_0m
            if len(raw_vals) > 1 and not np.isnan(raw_vals[1]):
                raw_vals[1] += 0.50 * delta_s
        if not np.isnan(corr_vals[0]):
            diff = abs(sat_sst - corr_vals[0])
            alpha = float(np.clip(0.60 - 0.15 * diff, 0.30, 0.60))
            blended_0m = alpha * sat_sst + (1.0 - alpha) * corr_vals[0]
            delta_s = blended_0m - corr_vals[0]
            corr_vals[0] = blended_0m
            if len(corr_vals) > 1 and not np.isnan(corr_vals[1]):
                corr_vals[1] += 0.50 * delta_s

    # Select working profile: raw vs corrected
    work_profile = np.array(raw_vals if raw else corr_vals, dtype=float)

    # Monotonic smoothing toggle
    if smoothing:
        upper_mask = [i for i, d in enumerate(depths) if d <= 100 and not np.isnan(work_profile[i])]
        if len(upper_mask) > 1:
            work_profile[upper_mask] = _isotonic_decreasing(work_profile[upper_mask])
        for i in range(7, len(depths)):
            if not np.isnan(work_profile[i]) and not np.isnan(work_profile[i - 1]):
                if work_profile[i] > work_profile[i - 1]:
                    work_profile[i] = work_profile[i - 1]

    # Floor physical Indian Ocean temperatures at 4.0°C
    for i in range(len(work_profile)):
        if not np.isnan(work_profile[i]) and work_profile[i] < 4.0:
            work_profile[i] = 4.0

    return {int(d): (round(float(t), 2) if not np.isnan(t) else None) for d, t in zip(depths, work_profile)}


def get_profile_data(
    latitude: float,
    longitude: float,
    date_str: str,
    smoothing: bool = False,
) -> Dict[str, Any]:
    """
    Returns both raw_profile, corrected_profile, and precomputed products at (lat, lon, date).
    """
    if not is_date_in_window(date_str):
        raise ValueError(f"Date {date_str} outside window {WINDOW_START}..{WINDOW_END}")

    prof = serving_data.profile(latitude, longitude, date_str)
    if not prof.get("is_ocean", False):
        raise ValueError("Selected cell is land or masked.")

    depths = prof["depths_m"]
    raw_vals = [float(v) if v is not None else np.nan for v in prof["raw_c"]]
    corr_vals = [float(v) if v is not None else np.nan for v in prof.get("corrected_c", raw_vals)]

    # Apply SST blend to raw and corrected profiles
    sat_sst = get_satellite_sst(latitude, longitude, date_str)
    if sat_sst is not None:
        if not np.isnan(raw_vals[0]):
            diff = abs(sat_sst - raw_vals[0])
            alpha = float(np.clip(0.60 - 0.15 * diff, 0.30, 0.60))
            blended_0m = alpha * sat_sst + (1.0 - alpha) * raw_vals[0]
            delta_s = blended_0m - raw_vals[0]
            raw_vals[0] = blended_0m
            if len(raw_vals) > 1 and not np.isnan(raw_vals[1]):
                raw_vals[1] += 0.50 * delta_s
        if not np.isnan(corr_vals[0]):
            diff = abs(sat_sst - corr_vals[0])
            alpha = float(np.clip(0.60 - 0.15 * diff, 0.30, 0.60))
            blended_0m = alpha * sat_sst + (1.0 - alpha) * corr_vals[0]
            delta_s = blended_0m - corr_vals[0]
            corr_vals[0] = blended_0m
            if len(corr_vals) > 1 and not np.isnan(corr_vals[1]):
                corr_vals[1] += 0.50 * delta_s

    raw_arr = np.array(raw_vals, dtype=float)
    corr_arr = np.array(corr_vals, dtype=float)

    if smoothing:
        upper_mask = [i for i, d in enumerate(depths) if d <= 100 and not np.isnan(corr_arr[i])]
        if len(upper_mask) > 1:
            corr_arr[upper_mask] = _isotonic_decreasing(corr_arr[upper_mask])
        for i in range(7, len(depths)):
            if not np.isnan(corr_arr[i]) and not np.isnan(corr_arr[i - 1]):
                if corr_arr[i] > corr_arr[i - 1]:
                    corr_arr[i] = corr_arr[i - 1]

    for i in range(len(raw_arr)):
        if not np.isnan(raw_arr[i]) and raw_arr[i] < 4.0:
            raw_arr[i] = 4.0
    for i in range(len(corr_arr)):
        if not np.isnan(corr_arr[i]) and corr_arr[i] < 4.0:
            corr_arr[i] = 4.0

    raw_dict = {int(d): (round(float(t), 2) if not np.isnan(t) else None) for d, t in zip(depths, raw_arr)}
    corr_dict = {int(d): (round(float(t), 2) if not np.isnan(t) else None) for d, t in zip(depths, corr_arr)}

    # Precomputed products
    i, j = serving_data.cell(latitude, longitude)
    d = serving_data._day("products", date_str)
    
    def _get_p(name: str):
        val = float(serving_data.products[name][d, i, j])
        return None if (math.isnan(val) or math.isinf(val)) else round(val, 2)

    return {
        "depths": depths,
        "raw_profile": raw_dict,
        "corrected_profile": corr_dict,
        "raw_temps": [raw_dict[d] for d in depths],
        "temps": [corr_dict[d] for d in depths],
        "products": {
            "d20": _get_p("d20"),
            "d26": _get_p("d26"),
            "tchp": _get_p("tchp"),
            "mld": _get_p("mld"),
        },
        "provenance": {
            "data_source": MODEL_NAME,
            "note": PROVENANCE_NOTE,
            "window": f"{WINDOW_START} to {WINDOW_END}",
        },
    }


def temperature_map(date_str: str, depth: int, corrected: bool = True, apply_sst_blend: bool = True) -> np.ndarray:
    """Return 2D (101, 241) float32 temperature grid slice from ServingData with surface blending."""
    if not is_date_in_window(date_str):
        raise ValueError(f"Date {date_str} outside window {WINDOW_START}..{WINDOW_END}")
    m = serving_data.temperature_map(date_str, depth, corrected=corrected).copy()
    if apply_sst_blend and depth in (0, 5) and _sst_arr is not None:
        try:
            start_ts = pd.Timestamp("2021-01-01").normalize()
            target_ts = pd.Timestamp(date_str).normalize()
            d_idx = (target_ts - start_ts).days
            if 0 <= d_idx < len(_sst_arr):
                sat_sst_grid = np.array(_sst_arr[d_idx], dtype=float)
                ocean_mask = (sat_sst_grid >= 0.5)
                m0 = serving_data.temperature_map(date_str, 0, corrected=corrected)
                valid_m0 = ocean_mask & (~np.isnan(m0))
                diff_grid = np.abs(sat_sst_grid - m0)
                alpha_grid = np.clip(0.60 - 0.15 * diff_grid, 0.30, 0.60)
                blended_0m = alpha_grid * sat_sst_grid + (1.0 - alpha_grid) * m0
                delta_s = blended_0m - m0
                if depth == 0:
                    m[valid_m0] = blended_0m[valid_m0]
                elif depth == 5:
                    valid_m5 = ocean_mask & (~np.isnan(m))
                    m[valid_m5] += 0.50 * delta_s[valid_m5]
        except Exception:
            pass
    return m


def product_map(name: str, date_str: str) -> np.ndarray:
    """Return 2D (101, 241) float32 map of d20 / d26 / tchp / mld."""
    if not is_date_in_window(date_str):
        raise ValueError(f"Date {date_str} outside window {WINDOW_START}..{WINDOW_END}")
    return serving_data.product_map(name, date_str)


def regimes(date_str: str) -> Dict[str, Any]:
    """Return ocean regime clusters, RGB map, and cluster profiles from embeddings."""
    if not is_date_in_window(date_str):
        raise ValueError(f"Date {date_str} outside window {WINDOW_START}..{WINDOW_END}")
    return serving_data.regimes(date_str)


def search_vector(latitude: float, longitude: float, date_str: str) -> Optional[np.ndarray]:
    """Return 16-D latent search vector for ocean coordinate."""
    if not is_date_in_window(date_str):
        return None
    return serving_data.search_vector(latitude, longitude, date_str)
