"""
OceanEmbed — Standalone Inference Script
==========================================
Predicts subsurface ocean temperature at 15 standard depths (0-1000m)
for a given latitude, longitude, and date, using the trained OceanEmbed
CNN-LSTM model.

WHAT YOU NEED TO RUN THIS:
1. model_v6_satswap_anom_best.pt   -- the trained weights (V6 architecture, 27 channels)
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
import threading
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from .products import correct_profile
except ImportError:
    from products import correct_profile

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
    if os.path.exists(float16_sst):
        USE_TRIMMED_DATA = False
        USE_FULL_FLOAT16_DATA = True
        USE_FLOAT16_DATA = True
    elif (not os.path.exists(untrimmed_sst)) and os.path.exists(trimmed_sst):
        USE_TRIMMED_DATA = True
        USE_FULL_FLOAT16_DATA = False
        USE_FLOAT16_DATA = False
    elif os.path.exists(untrimmed_sst):
        USE_TRIMMED_DATA = False
        USE_FULL_FLOAT16_DATA = False
        USE_FLOAT16_DATA = False
    else:
        USE_TRIMMED_DATA = True
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

CHECKPOINT_PATH = os.path.join(BASE_DIR, "model_v6_satswap_anom_best.pt")

MIN_LON, MAX_LON = 45, 105             # region: North Indian Ocean
MIN_LAT, MAX_LAT = 5, 30
YEARS_COVERED = list(range(2021, 2024))  # <- valid date range: 2021-01-01 to 2023-12-31
                                          #    (V6 checkpoint was also trained on the 3-year dataset)
DATASET_START_DATE = f"{YEARS_COVERED[0]}-01-01"
SEQUENCE_LENGTH = 10                   # (item 7) model reads a 10-day window of data
LOOKBACK_DAYS = SEQUENCE_LENGTH - 1    # window is [target_day - 9, target_day] INCLUSIVE (same-day
                                        # reconstruction) -- V4 used [target_day-10, target_day-1],
                                        # a 1-day-forecast bug fixed in V6; see channel_stats note below.
STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]  # (item 9)
IN_CHANNELS = 27                       # (item 6) channel order below -- V6: 7 surface anomaly +
                                        # 4 positional + 2 temporal + 14 DSTAG (was 13 under V4:
                                        # no DSTAG, no BatchNorm in the encoder)
TOTAL_DAYS_FULL_FLOAT16 = 1095         # Total continuous days in 2021-01-01 through 2023-12-31

# --------------------------------------------------------------------------- V6 channel normalization
# The 7 surface-anomaly channels and the 14 DSTAG channels are z-scored (mean/std fit ONCE on
# train-only days during training) before being fed to the model -- V4 fed raw physical-unit
# anomalies straight in, which V6's checkpoint was never trained on. These constants are exactly
# `channel_stats_v6_satswap_anom.npz` from the training run (order: sst, sss, ssh, u_cur, v_cur,
# u_wind, v_wind for SURF_*; depths 5,10,20,30,50,75,100,125,150,200,300,500,700,1000m for DSTAG_*).
SURF_MEAN = np.array([2.95e-10, 3.88e-10, -4.32e-12, 4.55e-12, 1.46e-12, -6.21e-11, 7.25e-11], dtype="float32")
SURF_STD = np.array([0.48491135, 0.3317702, 0.05517631, 0.1591553, 0.1557218, 2.3828635, 2.1260521], dtype="float32")
DSTAG_MEAN = np.array([0.03025478, 0.24102248, 0.5683777, 1.2950898, 2.6567838, 5.4854794, 6.8095574,
                        10.547416, 12.580494, 14.293592, 17.416727, 19.15396, 19.820772, 21.436916], dtype="float32")
DSTAG_STD = np.array([0.5437714, 2.422959, 3.705896, 5.3166757, 6.963868, 8.472091, 8.394373,
                       7.4827805, 6.877068, 6.3293815, 5.238609, 4.6756783, 4.478994, 3.9518988], dtype="float32")
DSTAG_DEPTH_INDICES = list(range(1, len(STANDARD_DEPTHS)))  # depths[1:] -- depth-0 dropped, duplicate of sst_anom


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

# Channel order (item 6) -- this is what the model's 27 input channels are, in order:
#  0: SST anomaly          1: SSS anomaly          2: SSH anomaly
#  3: U-current anomaly    4: V-current anomaly
#  5: U-wind anomaly       6: V-wind anomaly
#  (0-6 z-scored with SURF_MEAN/SURF_STD)
#  7: latitude sin         8: latitude cos
#  9: longitude sin       10: longitude cos
#  (7-10 z-scored over ocean cells)
# 11: day-of-year sin     12: day-of-year cos
# 13-26: DSTAG = SST_raw - target_climatology(depth), depths 5,10,20,30,50,75,100,125,150,
#         200,300,500,700,1000m in order (z-scored with DSTAG_MEAN/DSTAG_STD)
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
    """Matches oceanembed/model.py's SurfaceEncoder exactly (V6 architecture) -- this is what
    model_v6_satswap_anom_best.pt was trained with: conv1 goes straight 27->32 (not 13->16->32
    like V4), and every conv except the last has a BatchNorm2d. State-dict key names
    (encoder.conv1/bn1/conv2/bn2/conv_d/bn3/conv3) must match the checkpoint exactly."""
    def __init__(self, in_channels=27, embedding_channels=32, dropout_p=0.1):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, 32, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(32)
        self.conv2 = nn.Conv2d(32, 32, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.conv_d = nn.Conv2d(32, 32, kernel_size=3, padding=2, dilation=2)
        self.bn3 = nn.BatchNorm2d(32)
        self.conv3 = nn.Conv2d(32, embedding_channels, kernel_size=3, padding=1)
        self.dropout = nn.Dropout2d(dropout_p)

    def forward(self, x):
        x = self.dropout(F.relu(self.bn1(self.conv1(x))))
        x = self.dropout(F.relu(self.bn2(self.conv2(x))))
        x = self.dropout(F.relu(self.bn3(self.conv_d(x))))
        return self.conv3(x)


class OceanEmbedModel(nn.Module):
    """V6 architecture: encoder -> LSTM -> 2-layer depth head. `lstm`/`fc1`/`fc2` are direct
    attributes (not wrapped in TemporalModel/DepthPredictor submodules like V4 was) because the
    checkpoint's state_dict keys are `lstm.*`, `fc1.*`, `fc2.*` at the top level."""
    def __init__(self, in_channels=27, embedding_channels=32, hidden_size=64, num_depths=15):
        super().__init__()
        self.encoder = SurfaceEncoder(in_channels, embedding_channels)
        self.lstm = nn.LSTM(input_size=embedding_channels, hidden_size=hidden_size, batch_first=True)
        self.fc1 = nn.Linear(hidden_size, 64)
        self.fc2 = nn.Linear(64, num_depths)
        self.dropout = nn.Dropout(0.1)
        self.num_depths = num_depths

    def _run_lstm(self, x):
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

    def forward(self, x):
        # x shape: (batch, time=10, channels=27, lat=101, lon=241)  <- item 5: full input shape
        batch, time, channels, lat, lon = x.shape
        emb_channels = 32
        # Assign slices in-place into pre-allocated tensor to avoid 60+ MB intermediate stacks and permutes
        reshaped = torch.empty((batch * lat * lon, time, emb_channels), dtype=x.dtype, device=x.device)
        for t in range(time):
            emb_t = self.encoder(x[:, t])
            reshaped[:, t, :] = emb_t.permute(0, 2, 3, 1).reshape(batch * lat * lon, emb_channels)
        temporal_summary = self._run_lstm(reshaped)
        del reshaped
        z = self.dropout(F.relu(self.fc1(temporal_summary)))
        predictions = self.fc2(z)
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

# 3D Valid Depth Mask (15, 101, 241) derived from climatology bathymetry:
# Cells with temperature > 1.0°C are valid ocean depths above the local seafloor.
# Depths at or beyond the seafloor have 0.0°C in _temp_target_clim and are masked as invalid (NaN).
_valid_depth_mask = np.array(_temp_target_clim[0] > 1.0, dtype=bool)
 
from collections import OrderedDict
_prediction_cache: OrderedDict[str, np.ndarray] = OrderedDict()
_prediction_cache_lock = threading.Lock()
_MAX_PREDICTION_CACHE_SIZE = 4


def is_inference_cache_enabled() -> bool:
    """
    Checks if inference result caching and startup pre-warming are enabled.
    Controlled by environment variable ENABLE_INFERENCE_CACHE (default: True).
    Set ENABLE_INFERENCE_CACHE=false to force live model recomputation on every request
    (useful during accuracy verification, testing, or profiling).
    """
    val = os.environ.get("ENABLE_INFERENCE_CACHE", "true")
    return str(val).strip().lower() not in ("false", "0", "no", "off")


ENABLE_INFERENCE_CACHE = is_inference_cache_enabled()


_total_days = _sst_arr.shape[0]

# Positional channels (lat/lon sin/cos) are z-scored over ocean cells during training (see
# oceanembed/features.py stage: "pos[i] = (pos_raw[i] - v.mean()) / v.std()" fit over the ocean
# mask). Recomputed here from this deployment's own ocean mask rather than the exact training-time
# satellite mask (10,916 cells vs this array's ~11,854) -- both cover the same 5-30N/45-105E grid
# at the same 0.25 deg resolution, so the mean/std of a smooth geometric field over either mask
# differ by a negligible amount; not a bit-for-bit match to training, but close enough to matter.
_ocean_mask_2d = np.array(_sst_arr[0]) >= 0.5
_lat_grid, _lon_grid = np.meshgrid(_target_lats, _target_lons, indexing='ij')
_pos_raw = np.stack([
    np.sin(np.radians(_lat_grid)), np.cos(np.radians(_lat_grid)),
    np.sin(np.radians(_lon_grid)), np.cos(np.radians(_lon_grid)),
]).astype('float32')
_pos = np.zeros_like(_pos_raw)
for _i in range(4):
    _v = _pos_raw[_i][_ocean_mask_2d]
    _pos[_i] = (_pos_raw[_i] - _v.mean()) / max(_v.std(), 1e-6)
_pos_tiled = np.tile(_pos[None], (SEQUENCE_LENGTH, 1, 1, 1))  # (SEQUENCE_LENGTH, 4, lat, lon)

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
def predict_temperature_profile(
    latitude: float,
    longitude: float,
    date_str: str,
    raw: bool = False,
    apply_bias_correction: bool = True,
) -> dict:
    """
    latitude:  5.0 to 30.0
    longitude: 45.0 to 105.0
    date_str:  'YYYY-MM-DD', must be between 2021-01-11 and 2023-12-31
               (first 10 days of 2021 are excluded -- need 10 days of history)
    raw:       If True, skips both isotonic decreasing smoothing and empirical Argo warm-bias
               correction, returning unsmoothed model output and preserving genuine physical
               subsurface inversions (e.g., barrier layers). Default is False (corrected & smoothed).
    apply_bias_correction: If True (default) and raw is False, subtracts Ajay's empirical Argo
               depth bias vector (tuned for model_v6_satswap_anom).

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
            or (day_idx - LOOKBACK_DAYS) not in _day_index_map
            or (_day_index_map[day_idx] - _day_index_map[day_idx - LOOKBACK_DAYS] != LOOKBACK_DAYS)
        ):
            return {"error": "This date is not available in the deployed demo dataset."}
        mapped_day_idx = _day_index_map[day_idx]
        start, end = mapped_day_idx - LOOKBACK_DAYS, mapped_day_idx + 1  # window INCLUDES the target day
    else:
        max_days = TOTAL_DAYS_FULL_FLOAT16 if USE_FULL_FLOAT16_DATA else _total_days
        max_days = min(max_days, _total_days)
        if day_idx < LOOKBACK_DAYS or day_idx >= max_days:
            return {"error": "This date is not available in the deployed demo dataset."}
        mapped_day_idx = day_idx
        start, end = day_idx - LOOKBACK_DAYS, day_idx + 1  # window INCLUDES the target day

    if start < 0 or end > _total_days or mapped_day_idx < 0 or mapped_day_idx >= _total_days:
        return {"error": "This date is not available in the deployed demo dataset."}

    raw_sst_window = _sst_arr[start:end]
    if np.abs(raw_sst_window).max() < 0.01:
        return {"error": "no satellite data available for this location/date (likely land or data gap)"}

    use_cache = is_inference_cache_enabled()
    prediction_real = None
    if use_cache:
        with _prediction_cache_lock:
            if date_str in _prediction_cache:
                prediction_real = _prediction_cache[date_str].copy()
                _prediction_cache.move_to_end(date_str)
    if prediction_real is None:
        surface_channels = np.stack([
            _sst_anom[start:end], _sss_anom[start:end], _ssh_anom[start:end],
            _u_cur_anom[start:end], _v_cur_anom[start:end],
            _u_wind_anom[start:end], _v_wind_anom[start:end],
        ], axis=1).astype("float32")
        surface_channels = (surface_channels - SURF_MEAN[None, :, None, None]) / SURF_STD[None, :, None, None]

        dstag_channels = np.stack([
            np.array(_sst_arr[start:end]) - np.array(_temp_target_clim[start:end, di])
            for di in DSTAG_DEPTH_INDICES
        ], axis=1).astype("float32")
        dstag_channels = (dstag_channels - DSTAG_MEAN[None, :, None, None]) / DSTAG_STD[None, :, None, None]

        lat, lon = surface_channels.shape[2], surface_channels.shape[3]
        window = np.concatenate([
            surface_channels, _pos_tiled[:SEQUENCE_LENGTH],
            np.broadcast_to(_doy_sin[start:end][:, None, None, None], (SEQUENCE_LENGTH, 1, lat, lon)),
            np.broadcast_to(_doy_cos[start:end][:, None, None, None], (SEQUENCE_LENGTH, 1, lat, lon)),
            dstag_channels,
        ], axis=1)

        window_tensor = torch.tensor(window, dtype=torch.float32).unsqueeze(0).to(device)
        del window
        del surface_channels

        with torch.inference_mode():
            prediction_anom = _model(window_tensor)
        del window_tensor

        clim_at_day = np.array(_temp_target_clim[mapped_day_idx])
        prediction_real = (prediction_anom[0].cpu().numpy() + clim_at_day).astype("float32")  # anomaly -> real temperature (item 8)
        prediction_real[~_valid_depth_mask] = np.nan
        del prediction_anom
        del clim_at_day

        if use_cache:
            with _prediction_cache_lock:
                _prediction_cache[date_str] = prediction_real.copy()
                if len(_prediction_cache) > _MAX_PREDICTION_CACHE_SIZE:
                    _prediction_cache.popitem(last=False)

    profile = prediction_real[:, lat_idx, lon_idx].copy()
    raw_m0 = float(profile[0]) if not np.isnan(profile[0]) else np.nan
    raw_sst = float(_sst_arr[mapped_day_idx, lat_idx, lon_idx])

    # STEP 1: Smooth Surface Blending & Near-Surface Taper
    # Instead of hard overwrite, blend satellite SST with the model's bulk 0m prediction.
    # Discrepancy-tapered alpha: 0.60 when consistent, tapering to 0.30 during large skin/bulk anomalies.
    if not np.isnan(raw_m0):
        diff = abs(raw_sst - raw_m0)
        alpha = float(np.clip(0.60 - 0.15 * diff, 0.30, 0.60))
        blended_sst = alpha * raw_sst + (1.0 - alpha) * raw_m0
        profile[0] = blended_sst

        # Near-surface continuity taper (0-10m): diffuse 50% of the surface delta into the 5m layer
        delta_s = blended_sst - raw_m0
        if not np.isnan(profile[1]):
            profile[1] += 0.50 * delta_s

    # STEP 2: Monotonicity Safety-Net Pass in upper ocean (depths <= 100m only)
    # STANDARD_DEPTHS[:8] corresponds to [0, 5, 10, 20, 30, 50, 75, 100] m
    # Depths > 100m (125m to 1000m) are strictly untouched to preserve real physical thermocline structures.
    # When raw=True, skips both isotonic regression and Argo warm-bias correction.
    if not raw:
        upper_mask = [i for i, d in enumerate(STANDARD_DEPTHS) if d <= 100 and not np.isnan(profile[i])]
        if len(upper_mask) > 1:
            profile[upper_mask] = _isotonic_decreasing(profile[upper_mask])

        # STEP 3: Argo Empirical Warm-Bias Correction
        # Pinned to model_v6_satswap_anom checkpoint (Ajay's post-processing correction)
        if apply_bias_correction:
            profile = correct_profile(profile)

        # Enforce physical Indian Ocean temperature floor (>= 4.0°C) preserving NaNs
        for i in range(len(STANDARD_DEPTHS)):
            if not np.isnan(profile[i]) and profile[i] < 4.0:
                profile[i] = 4.0

        # Guarantee non-increasing temperatures below thermocline (depths >= 100m: indices 7 to 14)
        for i in range(7, len(STANDARD_DEPTHS)):
            if not np.isnan(profile[i]) and not np.isnan(profile[i - 1]):
                if profile[i] > profile[i - 1]:
                    profile[i] = profile[i - 1]
    else:
        for i in range(len(STANDARD_DEPTHS)):
            if not np.isnan(profile[i]) and profile[i] < 4.0:
                profile[i] = 4.0

    return {int(d): (round(float(t), 2) if not np.isnan(t) else None) for d, t in zip(STANDARD_DEPTHS, profile)}


# ---------------------------------------------------------------------------
# 5. QUICK TEST (item 13 -- run this file directly to sanity-check everything works)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    lat, lon = 15.25, 85.75
    date = "2021-02-14" if USE_TRIMMED_DATA else "2023-06-15"
    result = predict_temperature_profile(lat, lon, date)
    print(f"Prediction for ({lat}, {lon}) on {date} (USE_TRIMMED_DATA={USE_TRIMMED_DATA}):")
    print(result)
