"""
Marine Ecology & Heatwave Mode — Hobday et al. (2016) Detection Engine
Analyzes Observed satellite SST (OSTIA) time series to detect, characterize, and categorize
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
HEATWAVE_DEPTH_DIR = os.path.join(DATA_DIR, 'heatwave_depth')
THRESH_PATH = os.path.join(HEATWAVE_DEPTH_DIR, 'thresh.npy')
MEAN_PATH = os.path.join(HEATWAVE_DEPTH_DIR, 'mean.npy')
NODE_DAYS_PATH = os.path.join(HEATWAVE_DEPTH_DIR, 'node_days.npy')
COUNT_PATH = os.path.join(HEATWAVE_DEPTH_DIR, 'count.npy')

import inference as inf

# Module-level cached climatology arrays
_thresh_ext = None
_mean_ext = None
_nodes_x = None

def _load_climatology():
    global _thresh_ext, _mean_ext, _nodes_x
    if _thresh_ext is None:
        if os.path.exists(THRESH_PATH) and os.path.exists(MEAN_PATH) and os.path.exists(NODE_DAYS_PATH):
            thresh = np.load(THRESH_PATH)       # (61, 101, 241) float16
            mean = np.load(MEAN_PATH)           # (61, 101, 241) float16
            node_days = np.load(NODE_DAYS_PATH) # (61,) int64
            _nodes_x = np.append(node_days, 366)
            _thresh_ext = np.concatenate([thresh, thresh[0:1]], axis=0).astype(np.float32)
            _mean_ext = np.concatenate([mean, mean[0:1]], axis=0).astype(np.float32)
        else:
            # Baseline fallback
            _nodes_x = np.linspace(0, 366, 62, dtype=np.int64)
            _thresh_ext = np.full((62, 101, 241), 29.5, dtype=np.float32)
            _mean_ext = np.full((62, 101, 241), 28.0, dtype=np.float32)
    return _thresh_ext, _mean_ext, _nodes_x

def _get_timeline():
    """
    Returns (dates_arr, dates_str, date_to_idx) dynamically adapting to
    either full 1095-day float16 dataset or trimmed 343-day dataset.
    """
    total_days = int(inf._sst_arr.shape[0])
    if inf.USE_TRIMMED_DATA and inf._day_index_map is not None:
        ordered_orig_indices = [orig for orig, trim in sorted(inf._day_index_map.items(), key=lambda x: x[1])]
        dates = [pd.Timestamp(inf.DATASET_START_DATE) + pd.Timedelta(days=int(i)) for i in ordered_orig_indices[:total_days]]
    else:
        dates = list(pd.date_range(inf.DATASET_START_DATE, periods=total_days, freq='D'))
    dates_str = [d.strftime('%Y-%m-%d') for d in dates]
    date_to_idx = {d_str: i for i, d_str in enumerate(dates_str)}
    return dates, dates_str, date_to_idx


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
    
    1. Compares daily Observed satellite SST (OSTIA) against 14-year smooth daily 90th percentile threshold.
    2. Identifies continuous runs of exceedance lasting >= 5 consecutive days.
    3. Categorizes each event using Hobday's threshold distance multiplier:
       M = (SST_peak - Mean) / (Threshold_90 - Mean)
       Category = min(4, max(1, floor(M)))
    """
    thresh_ext, mean_ext, nodes_x = _load_climatology()

    # 1. Coordinate lookup and validation
    if not (inf.MIN_LAT <= latitude <= inf.MAX_LAT and inf.MIN_LON <= longitude <= inf.MAX_LON):
        return {
            "error": f"Coordinates out of bounds ({latitude}, {longitude}). Latitude must be between {inf.MIN_LAT} and {inf.MAX_LAT}, longitude between {inf.MIN_LON} and {inf.MAX_LON}.",
            "location": {"lat": round(latitude, 4), "lon": round(longitude, 4)},
            "events": [],
            "current_status": {
                "in_heatwave": False,
                "category": None,
                "category_label": None,
                "days_elapsed": None,
                "event": None
            },
            "climatology_method": "Threshold: 90th percentile of observed satellite SST, 2010–2023, daily and smoothed (Hobday et al. 2016).",
            "sst_timeseries": []
        }

    lat_idx = int(np.argmin(np.abs(inf._target_lats - latitude)))
    lon_idx = int(np.argmin(np.abs(inf._target_lons - longitude)))
    grid_lat = float(inf._target_lats[lat_idx])
    grid_lon = float(inf._target_lons[lon_idx])

    dates_arr, dates_str, date_to_idx = _get_timeline()
    num_days = len(dates_str)
    min_date = dates_str[0]
    max_date = dates_str[-1]

    # 2. Date normalization and clamping
    if not start_date or start_date < min_date:
        start_date = min_date
    if not end_date or end_date > max_date:
        end_date = max_date
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    if not reference_date:
        reference_date = end_date
    elif reference_date < min_date:
        reference_date = min_date
    elif reference_date > max_date:
        reference_date = max_date

    # Slicing index bounds
    start_idx = date_to_idx.get(start_date, 0)
    end_idx = date_to_idx.get(end_date, num_days - 1)

    # 3. Extract SST time series across available baseline (num_days)
    sst_full = inf._sst_arr[0:num_days, lat_idx, lon_idx]

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
            "climatology_method": "Threshold: 90th percentile of observed satellite SST, 2010–2023, daily and smoothed (Hobday et al. 2016).",
            "sst_timeseries": []
        }

    # Interpolate smooth daily threshold & mean across 366-day calendar
    th_pt = thresh_ext[:, lat_idx, lon_idx]
    mn_pt = mean_ext[:, lat_idx, lon_idx]

    doys = np.array([dt.dayofyear - 1 if (dt.month <= 2) else dt.dayofyear for dt in dates_arr], dtype=np.int32)
    segs = doys // 6
    ws = (doys - nodes_x[segs]) / 6.0

    p_vals = (1.0 - ws) * th_pt[segs] + ws * th_pt[segs + 1]
    m_vals = (1.0 - ws) * mn_pt[segs] + ws * mn_pt[segs + 1]

    full_timeseries = []
    exceed_flags = []

    for global_idx in range(num_days):
        d_str = dates_str[global_idx]
        sst_val = float(sst_full[global_idx])
        m_val = float(m_vals[global_idx])
        p_val = float(p_vals[global_idx])
        
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
        "climatology_method": "Threshold: 90th percentile of observed satellite SST, 2010–2023, daily and smoothed (Hobday et al. 2016).",
        "sst_timeseries": timeseries
    }
