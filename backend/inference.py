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
DATA_DIR = os.path.join(BASE_DIR, "data")          # folder holding the .npy files below
CHECKPOINT_PATH = os.path.join(BASE_DIR, "model_v4_dilated_checkpoint_epoch30.pt")

MIN_LON, MAX_LON = 45, 105             # region: North Indian Ocean
MIN_LAT, MAX_LAT = 5, 30
YEARS_COVERED = list(range(2021, 2024))  # <- valid date range: 2021-01-01 to 2023-12-31
                                          #    (V4 checkpoint was trained on the 3-year dataset)
DATASET_START_DATE = f"{YEARS_COVERED[0]}-01-01"
SEQUENCE_LENGTH = 10                   # (item 7) model needs the PAST 10 DAYS of data, not just 1 day
STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]  # (item 9)
IN_CHANNELS = 13                       # (item 6) channel order below

# Channel order (item 6) -- this is what the model's 13 input channels are, in order:
#  0: SST anomaly          1: SSS anomaly          2: SSH anomaly
#  3: U-current anomaly    4: V-current anomaly
#  5: U-wind anomaly       6: V-wind anomaly
#  7: latitude sin         8: latitude cos
#  9: longitude sin       10: longitude cos
# 11: day-of-year sin     12: day-of-year cos
# (all "anomaly" = value minus the location's seasonal-average climatology)

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
        output, (h_n, c_n) = self.lstm(x)
        return h_n[-1]


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
        daily_embeddings = [self.encoder(x[:, t]) for t in range(time)]
        embedding_sequence = torch.stack(daily_embeddings, dim=1)
        _, _, emb_channels, _, _ = embedding_sequence.shape
        reshaped = embedding_sequence.permute(0, 3, 4, 1, 2).reshape(batch * lat * lon, time, emb_channels)
        temporal_summary = self.temporal(reshaped)
        predictions = self.predictor(temporal_summary)
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

# Load satellite surface anomaly arrays and SST into memory once at startup
# (Total memory footprint: ~2.2 GB; ensures zero disk I/O paging during inference)
_sst_arr = np.load(f"{DATA_DIR}/sst.npy")
_sst_anom = np.load(f"{DATA_DIR}/sst_anom.npy")
_sss_anom = np.load(f"{DATA_DIR}/sss_anom.npy")
_ssh_anom = np.load(f"{DATA_DIR}/ssh_anom.npy")
_u_cur_anom = np.load(f"{DATA_DIR}/u_cur_anom.npy")
_v_cur_anom = np.load(f"{DATA_DIR}/v_cur_anom.npy")
_u_wind_anom = np.load(f"{DATA_DIR}/u_wind_anom.npy")
_v_wind_anom = np.load(f"{DATA_DIR}/v_wind_anom.npy")
# temp_target_clim is ~4.1 GB, so keep mmap_mode='r' to prevent exhausting RAM;
# slicing day_idx [15, 101, 241] only reads 1.4 MB per request.
_temp_target_clim = np.load(f"{DATA_DIR}/temp_target_clim.npy", mmap_mode='r')
from collections import OrderedDict
_prediction_cache: OrderedDict[str, np.ndarray] = OrderedDict()
_MAX_PREDICTION_CACHE_SIZE = 16


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

_day_of_year = np.array([(pd.Timestamp(DATASET_START_DATE) + pd.Timedelta(days=i)).dayofyear for i in range(_total_days)])
_t_season = 2 * np.pi * _day_of_year / 365.25
_doy_sin = np.sin(_t_season).astype('float32')
_doy_cos = np.cos(_t_season).astype('float32')


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

    day_idx = (pd.Timestamp(date_str).normalize() - pd.Timestamp(DATASET_START_DATE)).days
    if day_idx < SEQUENCE_LENGTH or day_idx >= _total_days:
        return {"error": f"date out of range. Valid range: "
                          f"{(pd.Timestamp(DATASET_START_DATE) + pd.Timedelta(days=SEQUENCE_LENGTH)).date()} "
                          f"to {(pd.Timestamp(DATASET_START_DATE) + pd.Timedelta(days=_total_days - 1)).date()}"}

    start, end = day_idx - SEQUENCE_LENGTH, day_idx

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

        with torch.no_grad():
            prediction_anom = _model(window_tensor)

        clim_at_day = np.array(_temp_target_clim[day_idx])
        prediction_real = prediction_anom[0].cpu().numpy() + clim_at_day  # anomaly -> real temperature (item 8)

        _prediction_cache[date_str] = prediction_real
        if len(_prediction_cache) > _MAX_PREDICTION_CACHE_SIZE:
            _prediction_cache.popitem(last=False)

    profile = prediction_real[:, lat_idx, lon_idx].copy()
    # Anchor surface depth 0 to exact satellite SST
    profile[0] = float(_sst_arr[day_idx, lat_idx, lon_idx])

    return {int(d): round(float(t), 2) for d, t in zip(STANDARD_DEPTHS, profile)}


# ---------------------------------------------------------------------------
# 5. QUICK TEST (item 13 -- run this file directly to sanity-check everything works)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    lat, lon, date = 15.25, 85.75, "2023-06-15"
    result = predict_temperature_profile(lat, lon, date)
    print(f"Prediction for ({lat}, {lon}) on {date}:")
    print(result)
