"""
Marine Ecology & Heatwave Mode — Hobday et al. (2016) Detection Engine
Analyzes reconstructed SST time series to detect, characterize, and categorize
Marine Heatwaves (MHWs) across the North Indian Ocean.
"""

import os
import math
import numpy as np
import pandas as pd
from typing import Optional, Dict, Any, List

# Ensure backend directory is accessible
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
CLIM_PATH = os.path.join(DATA_DIR, 'mhw_climatology.npz')

import inference as inf

# Module-level cached climatology arrays
_clim_data = None
_mean_clim = None
_pct90_clim = None

def _load_climatology():
    global _clim_data, _mean_clim, _pct90_clim
    if _clim_data is None:
        if not os.path.exists(CLIM_PATH):
            from compute_mhw_climatology import compute_climatology
            compute_climatology()
        _clim_data = np.load(CLIM_PATH)
        _mean_clim = _clim_data['mean_sst']    # (12, 101, 241)
        _pct90_clim = _clim_data['pct90_sst']  # (12, 101, 241)
    return _mean_clim, _pct90_clim

# Full 3-year baseline date range
_DATES_3YR = pd.date_range('2021-01-01', periods=1095, freq='D')
_DATES_STR = [_d.strftime('%Y-%m-%d') for _d in _DATES_3YR]
_DATE_TO_IDX = {d_str: i for i, d_str in enumerate(_DATES_STR)}

CATEGORY_LABELS = {
    1: "Category I (Moderate)",
    2: "Category II (Strong)",
    3: "Category III (Severe)",
    4: "Category IV (Extreme)"
}

def detect_marine_heatwaves(
    latitude: float,
    longitude: float,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    reference_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Detect Marine Heatwaves (MHWs) per Hobday et al. (2016).
    
    1. Compares daily reconstructed SST against monthly 90th percentile threshold.
    2. Identifies continuous runs of exceedance lasting >= 5 consecutive days.
    3. Categorizes each event using Hobday's threshold distance multiplier:
       M = (SST_peak - Mean) / (Threshold_90 - Mean)
       Category = min(4, max(1, floor(M)))
    """
    mean_clim, pct90_clim = _load_climatology()
    
    # 1. Coordinate lookup and validation
    lat_idx = int(np.argmin(np.abs(inf._target_lats - latitude)))
    lon_idx = int(np.argmin(np.abs(inf._target_lons - longitude)))
    grid_lat = float(inf._target_lats[lat_idx])
    grid_lon = float(inf._target_lons[lon_idx])
    
    # 2. Date normalization and clamping
    if not start_date or start_date < '2021-01-01':
        start_date = '2021-01-01'
    if not end_date or end_date > '2023-12-31':
        end_date = '2023-12-31'
    if start_date > end_date:
        start_date, end_date = end_date, start_date
        
    if not reference_date:
        reference_date = end_date
    elif reference_date < '2021-01-01':
        reference_date = '2021-01-01'
    elif reference_date > '2023-12-31':
        reference_date = '2023-12-31'
        
    # Slicing index bounds
    start_idx = _DATE_TO_IDX.get(start_date, 0)
    end_idx = _DATE_TO_IDX.get(end_date, len(_DATES_STR) - 1)
    
    # 3. Extract SST time series across full 3-year baseline (1,095 days)
    sst_full = inf._sst_arr[0:len(_DATES_STR), lat_idx, lon_idx]
    
    # Land check: if raw SST is masked / invalid (< 0.5°C) across the entire record
    if np.all(sst_full < 0.5):
        return {
            "error": "Land coordinate selected. Marine heatwave analysis requires open ocean coordinates.",
            "location": {"lat": round(latitude, 4), "lon": round(longitude, 4)},
            "events": [],
            "current_status": {
                "in_heatwave": False,
                "category": None,
                "category_label": None,
                "days_elapsed": None,
                "event": None
            },
            "climatology_method": "Monthly 90th percentile SST baseline computed from 2021-2023 CNN-LSTM reconstructed SST fields (1,095 days).",
            "sst_timeseries": []
        }
        
    full_timeseries = []
    exceed_flags = []
    
    for global_idx in range(len(_DATES_STR)):
        dt = _DATES_3YR[global_idx]
        month_idx = dt.month - 1
        d_str = _DATES_STR[global_idx]
        
        sst_val = float(sst_full[global_idx])
        m_val = float(mean_clim[month_idx, lat_idx, lon_idx])
        p_val = float(pct90_clim[month_idx, lat_idx, lon_idx])
        
        is_exceed = bool(sst_val > p_val)
        exceed_flags.append(is_exceed)
        
        full_timeseries.append({
            "date": d_str,
            "sst": round(sst_val, 2),
            "climatological_mean": round(m_val, 2),
            "climatological_threshold": round(p_val, 2),
            "in_heatwave": False
        })
        
    # 4. Hobday Detection: Group contiguous runs of exceedance >= 5 days
    all_events: List[Dict[str, Any]] = []
    i = 0
    n = len(exceed_flags)
    
    while i < n:
        if exceed_flags[i]:
            j = i
            while j < n and exceed_flags[j]:
                j += 1
            duration = j - i
            
            # Strict Hobday condition: 5+ consecutive days
            if duration >= 5:
                # Mark days in full_timeseries
                for k in range(i, j):
                    full_timeseries[k]["in_heatwave"] = True
                    
                ev_days = full_timeseries[i:j]
                
                # Identify peak anomaly above climatological mean
                peak_entry = max(ev_days, key=lambda d: d["sst"] - d["climatological_mean"])
                peak_sst = peak_entry["sst"]
                peak_mean = peak_entry["climatological_mean"]
                peak_thresh = peak_entry["climatological_threshold"]
                
                peak_anomaly = peak_sst - peak_mean
                thresh_dist = peak_thresh - peak_mean
                
                # Category multiplier M = (T_peak - Mean) / (Threshold_90 - Mean)
                if thresh_dist > 1e-4:
                    mult = round(float(peak_anomaly / thresh_dist), 2)
                    cat_num = min(4, max(1, math.floor(mult)))
                else:
                    mult = 1.0
                    cat_num = 1
                    
                all_events.append({
                    "start_date": ev_days[0]["date"],
                    "end_date": ev_days[-1]["date"],
                    "duration_days": duration,
                    "peak_date": peak_entry["date"],
                    "peak_sst": round(peak_sst, 2),
                    "peak_mean": round(peak_mean, 2),
                    "peak_threshold": round(peak_thresh, 2),
                    "threshold_distance_c": round(thresh_dist, 2),
                    "peak_anomaly_c": round(peak_anomaly, 2),
                    "multiplier": round(mult, 2),
                    "category": cat_num,
                    "category_label": CATEGORY_LABELS[cat_num]
                })
            i = j
        else:
            i += 1
            
    # Filter events to those overlapping the requested range [start_date, end_date]
    events = [ev for ev in all_events if ev["end_date"] >= start_date and ev["start_date"] <= end_date]
    
    # Slice requested window for timeseries chart
    timeseries = full_timeseries[start_idx:end_idx + 1]
    
    # 5. Evaluate current status for reference_date
    in_hw = False
    cur_cat = None
    cur_label = None
    days_elapsed = None
    active_ev = None
    
    for ev in events:
        if ev["start_date"] <= reference_date <= ev["end_date"]:
            in_hw = True
            cur_cat = ev["category"]
            cur_label = ev["category_label"]
            start_dt = pd.Timestamp(ev["start_date"])
            ref_dt = pd.Timestamp(reference_date)
            days_elapsed = int((ref_dt - start_dt).days) + 1
            active_ev = ev
            break
            
    current_status = {
        "in_heatwave": in_hw,
        "category": cur_cat,
        "category_label": cur_label,
        "days_elapsed": days_elapsed,
        "event": active_ev
    }
    
    return {
        "location": {
            "latitude": round(latitude, 4),
            "longitude": round(longitude, 4),
            "grid_latitude": round(grid_lat, 2),
            "grid_longitude": round(grid_lon, 2)
        },
        "reference_date": reference_date,
        "start_date": start_date,
        "end_date": end_date,
        "events": events,
        "current_status": current_status,
        "climatology_method": "Monthly 90th percentile SST baseline computed from 2021-2023 CNN-LSTM reconstructed SST fields (1,095 days). Short 3-year baseline; indicative only.",
        "sst_timeseries": timeseries
    }
