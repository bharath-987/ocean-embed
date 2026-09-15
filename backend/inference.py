"""
OceanEmbed — Standalone Inference Script
==========================================
Predicts subsurface ocean temperature at 15 standard depths (0-1000m)
for a given latitude, longitude, and date, using the trained OceanEmbed
CNN-LSTM model.

WHAT YOU NEED TO RUN THIS:
1. model_v4_dilated_checkpoint_epoch30.pt   -- the trained weights
2. The precomputed data arrays (.npy files) listed below, in a folder
   called `data/` next to this script
3. Python packages: torch, numpy, pandas  (see requirements.txt)

USAGE:
    from inference import predict_temperature_profile
    result = predict_temperature_profile(latitude=13.0, longitude=80.0, date_str="2023-06-15")
    print(result)
    # {0: 29.8, 5: 29.6, 10: 29.5, 20: 29.3, 30: 29.0, 50: 27.9, 75: 24.1,
    #  100: 20.6, 125: 18.2, 150: 16.4, 200: 13.9, 300: 11.2, 500: 9.1,
    #  700: 7.6, 1000: 6.3}
"""

import json
import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F

# ---------------------------------------------------------------------------
# 1. CONFIG -- answers to items 5-10 from your checklist
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_env_full_f16 = os.environ.get("USE_FULL_FLOAT16_DATA")
_env_f16 = os.environ.get("USE_FLOAT16_DATA") or os.environ.get("USE_FLOAT16")
_env_trimmed = os.environ.get("USE_TRIMMED_DATA")

untrimmed_sst = os.path.join(BASE_DIR, "data", "sst.npy")
float16_sst = os.path.join(BASE_DIR, "data", "float16", "sst.npy")
trimmed_sst = os.path.join(BASE_DIR, "data", "trimmed", "sst.npy")

# Determine mode based on environment flags and dataset availability
if _env_trimmed is not None and _env_trimmed.lower() in ("true", "1", "yes"):
    USE_TRIMMED_DATA = True
    USE_FULL_FLOAT16_DATA = False
    USE_FLOAT16_DATA = False
elif _env_full_f16 is not None and _env_full_f16.lower() in ("true", "1", "yes"):
    USE_TRIMMED_DATA = False
    USE_FULL_FLOAT16_DATA = True
    USE_FLOAT16_DATA = True
elif _env_f16 is not None and _env_f16.lower() in ("true", "1", "yes"):
    USE_TRIMMED_DATA = False
    USE_FULL_FLOAT16_DATA = True
    USE_FLOAT16_DATA = True
elif _env_trimmed is not None and _env_trimmed.lower() in ("false", "0", "no"):
    USE_TRIMMED_DATA = False
    USE_FULL_FLOAT16_DATA = False
    USE_FLOAT16_DATA = False
else:
    # Auto-detection when no environment variable is explicitly set
    if (not os.path.exists(untrimmed_sst)) and os.path.exists(trimmed_sst):
        USE_TRIMMED_DATA = True
        USE_FULL_FLOAT16_DATA = False
        USE_FLOAT16_DATA = False
    elif (not os.path.exists(untrimmed_sst)) and os.path.exists(float16_sst):
        USE_TRIMMED_DATA = False
        USE_FULL_FLOAT16_DATA = True
        USE_FLOAT16_DATA = True
    else:
        USE_TRIMMED_DATA = False
        USE_FULL_FLOAT16_DATA = False
        USE_FLOAT16_DATA = False

if USE_TRIMMED_DATA:
    DATA_DIR = os.path.join(BASE_DIR, "data", "trimmed")
    _map_path = os.path.join(DATA_DIR, "day_index_map.json")
    if os.path.exists(_map_path):
        with open(_map_path, "r", encoding="utf-8") as _f:
            _day_index_map = {int(k): int(v) for k, v in json.load(_f).items()}
    else:
        _day_index_map = None
    USE_FULL_FLOAT16_DATA = False
    USE_FLOAT16_DATA = False
elif USE_FULL_FLOAT16_DATA or USE_FLOAT16_DATA:
    DATA_DIR = os.path.join(BASE_DIR, "data", "float16")
    _day_index_map = None
else:
    DATA_DIR = os.path.join(BASE_DIR, "data")          # folder holding the .npy files below
    _day_index_map = None

# Auto-fetch and verify float16 dataset if missing when running in float16 mode
if USE_FULL_FLOAT16_DATA or USE_FLOAT16_DATA:
    from fetch_data import ensure_data_ready
    ensure_data_ready(DATA_DIR)

CHECKPOINT_PATH = os.path.join(BASE_DIR, "model_v4_dilated_checkpoint_epoch30.pt")

MIN_LON, MAX_LON = 45, 105             # region: North Indian Ocean
MIN_LAT, MAX_LAT = 5, 30
YEARS_COVERED = list(range(2021, 2024))  # <- valid date range: 2021-01-01 to 2023-12-31
                                          #    (V4 checkpoint was trained on the 3-year dataset)
DATASET_START_DATE = f"{YEARS_COVERED[0]}-01-01"
SEQUENCE_LENGTH = 10                   # (item 7) model needs the PAST 10 DAYS of data, not just 1 day
STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]  # (item 9)
IN_CHANNELS = 13                       # (item 6) channel order below
TOTAL_DAYS_FULL_FLOAT16 = 1095         # Total continuous days in 2021-01-01 through 2023-12-31


def translate_day_idx(day_idx: int) -> int | None:
    """
    Translates an original day index to the trimmed array index if running with
    USE_TRIMMED_DATA=True. If USE_TRIMMED_DATA=False, returns day_idx as-is.
    Returns None if day_idx is not in the trimmed map or out of range.
    """
    if not USE_TRIMMED_DATA:
        max_days = TOTAL_DAYS_FULL_FLOAT16 if USE_FULL_FLOAT16_DATA else _total_days
        max_days = min(max_days, _total_days)
        if day_idx < 0 or day_idx >= max_days:
            return None
        return day_idx
    if _day_index_map is None:
        return None
    return _day_index_map.get(day_idx)

# Channel order (item 6) -- this is what the model's 13 input channels are, in order:
#  0: SST anomaly          1: SSS anomaly          2: SSH anomaly
#  3: U-current anomaly    4: V-current anomaly
#  5: U-wind anomaly       6: V-wind anomaly
#  7: latitude sin         8: latitude cos
#  9: longitude sin       10: longitude cos
# 11: day-of-year sin     12: day-of-year cos
# (all "anomaly" = value minus the location's seasonal-average climatology)

# Cap PyTorch CPU threads in constrained container environments (e.g. Render 512MB RAM)
# to prevent OpenMP worker thread pool stack bloat.
if torch.get_num_threads() > 2:
    torch.set_num_threads(2)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ---------------------------------------------------------------------------
# 2. MODEL DEFINITION (item 2) -- must match exactly what the checkpoint was trained with
# ---------------------------------------------------------------------------
class SurfaceEncoder(nn.Module):
    def __init__(self, in_channels=13, embedding_channels=32, dropout_p=0.1):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, 16, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, padding=1)
        self.conv_dilated = nn.Conv2d(32, 32, kernel_size=3, padding=2, dilation=2)
        self.conv3 = nn.Conv2d(32, embedding_channels, kernel_size=3, padding=1)
        self.dropout = nn.Dropout2d(dropout_p)

    def forward(self, x):
        x = F.relu(self.conv1(x)); x = self.dropout(x)
        x = F.relu(self.conv2(x)); x = self.dropout(x)
        x = F.relu(self.conv_dilated(x)); x = self.dropout(x)
        x = self.conv3(x)
        return x


class TemporalModel(nn.Module):
    def __init__(self, embedding_channels=32, hidden_size=64):
        super().__init__()
        self.lstm = nn.LSTM(input_size=embedding_channels, hidden_size=hidden_size, batch_first=True)

    def forward(self, x):
        # Process in chunks along batch dimension to prevent PyTorch C++ LSTM from allocating massive scratch buffers
        if x.shape[0] <= 4096:
            _, (h_n, _) = self.lstm(x)
            return h_n[-1]
        outputs = []
        for i in range(0, x.shape[0], 4096):
            chunk = x[i:i + 4096]
            _, (h_n, _) = self.lstm(chunk)
            outputs.append(h_n[-1])
        return torch.cat(outputs, dim=0)


class DepthPredictor(nn.Module):
    def __init__(self, hidden_size=64, num_depths=15, dropout_p=0.1):
        super().__init__()
        self.fc1 = nn.Linear(hidden_size, 64)
        self.fc2 = nn.Linear(64, num_depths)
        self.dropout = nn.Dropout(dropout_p)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x


class OceanEmbedModel(nn.Module):
    def __init__(self, in_channels=13, embedding_channels=32, hidden_size=64, num_depths=15):
        super().__init__()
        self.encoder = SurfaceEncoder(in_channels, embedding_channels)
        self.temporal = TemporalModel(embedding_channels, hidden_size)
        self.predictor = DepthPredictor(hidden_size, num_depths)
        self.num_depths = num_depths

    def forward(self, x):
        # x shape: (batch, time=10, channels=13, lat=101, lon=241)  <- item 5: full input shape
        batch, time, channels, lat, lon = x.shape
        emb_channels = 32
        # Assign slices in-place into pre-allocated tensor to avoid 60+ MB intermediate stacks and permutes
        reshaped = torch.empty((batch * lat * lon, time, emb_channels), dtype=x.dtype, device=x.device)
        for t in range(time):
            emb_t = self.encoder(x[:, t])
            reshaped[:, t, :] = emb_t.permute(0, 2, 3, 1).reshape(batch * lat * lon, emb_channels)
        temporal_summary = self.temporal(reshaped)
        del reshaped
        predictions = self.predictor(temporal_summary)
        del temporal_summary
        predictions_map = predictions.reshape(batch, lat, lon, self.num_depths).permute(0, 3, 1, 2)
        return predictions_map  # output is a TEMPERATURE ANOMALY -- climatology is added back below (item 8)


# ---------------------------------------------------------------------------
# 3. LOAD MODEL + DATA (once, at import time)
# ---------------------------------------------------------------------------
_model = OceanEmbedModel(in_channels=IN_CHANNELS, embedding_channels=32, hidden_size=64, num_depths=15).to(device)
_model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=device))
_model.eval()

_target_lats = np.arange(MIN_LAT, MAX_LAT + 0.25, 0.25)
_target_lons = np.arange(MIN_LON, MAX_LON + 0.25, 0.25)

# Load satellite surface anomaly arrays and SST via memory-mapping (mmap_mode='r')
# This avoids loading multi-megabyte arrays into physical RAM at startup, keeping memory minimal.
_sst_arr = np.load(f"{DATA_DIR}/sst.npy", mmap_mode="r")
_sst_anom = np.load(f"{DATA_DIR}/sst_anom.npy", mmap_mode="r")
_sss_anom = np.load(f"{DATA_DIR}/sss_anom.npy", mmap_mode="r")
_ssh_anom = np.load(f"{DATA_DIR}/ssh_anom.npy", mmap_mode="r")
_u_cur_anom = np.load(f"{DATA_DIR}/u_cur_anom.npy", mmap_mode="r")
_v_cur_anom = np.load(f"{DATA_DIR}/v_cur_anom.npy", mmap_mode="r")
_u_wind_anom = np.load(f"{DATA_DIR}/u_wind_anom.npy", mmap_mode="r")
_v_wind_anom = np.load(f"{DATA_DIR}/v_wind_anom.npy", mmap_mode="r")
_temp_target_clim = np.load(f"{DATA_DIR}/temp_target_clim.npy", mmap_mode="r")
from collections import OrderedDict
_prediction_cache: OrderedDict[str, np.ndarray] = OrderedDict()
_MAX_PREDICTION_CACHE_SIZE = 4


_total_days = _sst_arr.shape[0]

_lat_grid, _lon_grid = np.meshgrid(_target_lats, _target_lons, indexing='ij')
_lat_sin = np.sin(np.radians(_lat_grid)).astype('float32')
_lat_cos = np.cos(np.radians(_lat_grid)).astype('float32')
_lon_sin = np.sin(np.radians(_lon_grid)).astype('float32')
_lon_cos = np.cos(np.radians(_lon_grid)).astype('float32')
_lat_sin_t = np.tile(_lat_sin, (SEQUENCE_LENGTH, 1, 1))[:, None, :, :]
_lat_cos_t = np.tile(_lat_cos, (SEQUENCE_LENGTH, 1, 1))[:, None, :, :]
_lon_sin_t = np.tile(_lon_sin, (SEQUENCE_LENGTH, 1, 1))[:, None, :, :]
_lon_cos_t = np.tile(_lon_cos, (SEQUENCE_LENGTH, 1, 1))[:, None, :, :]

if USE_TRIMMED_DATA and _day_index_map is not None:
    ordered_orig_indices = [orig for orig, trim in sorted(_day_index_map.items(), key=lambda x: x[1])]
    _day_of_year = np.array([(pd.Timestamp(DATASET_START_DATE) + pd.Timedelta(days=i)).dayofyear for i in ordered_orig_indices])
else:
    _day_of_year = np.array([(pd.Timestamp(DATASET_START_DATE) + pd.Timedelta(days=i)).dayofyear for i in range(_total_days)])

_t_season = 2 * np.pi * _day_of_year / 365.25
_doy_sin = np.sin(_t_season).astype('float32')
_doy_cos = np.cos(_t_season).astype('float32')


def _isotonic_decreasing(y: np.ndarray, weights: np.ndarray = None) -> np.ndarray:
    """
    Pool Adjacent Violators Algorithm (PAVA) for isotonic non-increasing regression.
    Enforces y[0] >= y[1] >= ... >= y[n-1] by least-squares projection.
    Minimizes sum(w_i * (y_fit[i] - y[i])^2).
    """
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
        if blocks[i][0] > blocks[i + 1][0]:  # Violation of target <= target
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


# ---------------------------------------------------------------------------
# 4. THE FUNCTION YOUR FRONTEND CALLS
# ---------------------------------------------------------------------------
def predict_temperature_profile(latitude: float, longitude: float, date_str: str) -> dict:
    """
    latitude:  5.0 to 30.0
    longitude: 45.0 to 105.0
    date_str:  'YYYY-MM-DD', must be between 2021-01-11 and 2023-12-31
               (first 10 days of 2021 are excluded -- need 10 days of history)

    Returns: {depth_in_meters: temperature_celsius, ...} for all 15 standard depths,
             or {"error": "..."} if the date/location can't be served.
    """
    lat_idx = int(np.argmin(np.abs(_target_lats - latitude)))
    lon_idx = int(np.argmin(np.abs(_target_lons - longitude)))

    try:
        target_ts = pd.Timestamp(date_str).normalize()
        start_ts = pd.Timestamp(DATASET_START_DATE).normalize()
        day_idx = (target_ts - start_ts).days
    except Exception:
        return {"error": "This date is not available in the deployed demo dataset."}

    if USE_TRIMMED_DATA or _day_index_map is not None:
        if (
            _day_index_map is None
            or day_idx not in _day_index_map
            or (day_idx - SEQUENCE_LENGTH) not in _day_index_map
            or (_day_index_map[day_idx] - _day_index_map[day_idx - SEQUENCE_LENGTH] != SEQUENCE_LENGTH)
        ):
            return {"error": "This date is not available in the deployed demo dataset."}
        mapped_day_idx = _day_index_map[day_idx]
        start, end = mapped_day_idx - SEQUENCE_LENGTH, mapped_day_idx
    else:
        max_days = TOTAL_DAYS_FULL_FLOAT16 if USE_FULL_FLOAT16_DATA else _total_days
        max_days = min(max_days, _total_days)
        if day_idx < SEQUENCE_LENGTH or day_idx >= max_days:
            return {"error": "This date is not available in the deployed demo dataset."}
        mapped_day_idx = day_idx
        start, end = day_idx - SEQUENCE_LENGTH, day_idx

    if start < 0 or end > _total_days or mapped_day_idx < 0 or mapped_day_idx >= _total_days:
        return {"error": "This date is not available in the deployed demo dataset."}

    raw_sst_window = _sst_arr[start:end]
    if np.abs(raw_sst_window).max() < 0.01:
        return {"error": "no satellite data available for this location/date (likely land or data gap)"}

    if date_str in _prediction_cache:
        prediction_real = _prediction_cache[date_str]
        _prediction_cache.move_to_end(date_str)
    else:
        surface_channels = np.stack([
            _sst_anom[start:end], _sss_anom[start:end], _ssh_anom[start:end],
            _u_cur_anom[start:end], _v_cur_anom[start:end],
            _u_wind_anom[start:end], _v_wind_anom[start:end],
        ], axis=1)

        lat, lon = surface_channels.shape[2], surface_channels.shape[3]
        window = np.concatenate([
            surface_channels, _lat_sin_t, _lat_cos_t, _lon_sin_t, _lon_cos_t,
            np.broadcast_to(_doy_sin[start:end][:, None, None, None], (SEQUENCE_LENGTH, 1, lat, lon)),
            np.broadcast_to(_doy_cos[start:end][:, None, None, None], (SEQUENCE_LENGTH, 1, lat, lon)),
        ], axis=1)

        window_tensor = torch.tensor(window, dtype=torch.float32).unsqueeze(0).to(device)
        del window
        del surface_channels

        with torch.inference_mode():
            prediction_anom = _model(window_tensor)
        del window_tensor

        clim_at_day = np.array(_temp_target_clim[mapped_day_idx])
        prediction_real = (prediction_anom[0].cpu().numpy() + clim_at_day).astype("float32")  # anomaly -> real temperature (item 8)
        del prediction_anom
        del clim_at_day

        _prediction_cache[date_str] = prediction_real
        if len(_prediction_cache) > _MAX_PREDICTION_CACHE_SIZE:
            _prediction_cache.popitem(last=False)

    profile = prediction_real[:, lat_idx, lon_idx].copy()
    raw_m0 = float(profile[0])
    raw_sst = float(_sst_arr[mapped_day_idx, lat_idx, lon_idx])

    # STEP 1: Smooth Surface Blending & Near-Surface Taper
    # Instead of hard overwrite, blend satellite SST with the model's bulk 0m prediction.
    # Discrepancy-tapered alpha: 0.60 when consistent, tapering to 0.30 during large skin/bulk anomalies.
    diff = abs(raw_sst - raw_m0)
    alpha = float(np.clip(0.60 - 0.15 * diff, 0.30, 0.60))
    blended_sst = alpha * raw_sst + (1.0 - alpha) * raw_m0
    profile[0] = blended_sst

    # Near-surface continuity taper (0-10m): diffuse 50% of the surface delta into the 5m layer
    delta_s = blended_sst - raw_m0
    profile[1] += 0.50 * delta_s

    # STEP 2: Monotonicity Safety-Net Pass in upper ocean (depths <= 100m only)
    # STANDARD_DEPTHS[:8] corresponds to [0, 5, 10, 20, 30, 50, 75, 100] m
    # Depths > 100m (125m to 1000m) are strictly untouched to preserve real physical thermocline structures
    upper_mask = [i for i, d in enumerate(STANDARD_DEPTHS) if d <= 100]
    profile[upper_mask] = _isotonic_decreasing(profile[upper_mask])

    return {int(d): round(float(t), 2) for d, t in zip(STANDARD_DEPTHS, profile)}


# ---------------------------------------------------------------------------
# 5. QUICK TEST (item 13 -- run this file directly to sanity-check everything works)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    lat, lon = 15.25, 85.75
    date = "2021-02-14" if USE_TRIMMED_DATA else "2023-06-15"
    result = predict_temperature_profile(lat, lon, date)
    print(f"Prediction for ({lat}, {lon}) on {date} (USE_TRIMMED_DATA={USE_TRIMMED_DATA}):")
    print(result)
