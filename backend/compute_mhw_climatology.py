"""
14-Year Smooth Daily SST Climatology (Mean and 90th Percentile)
for the North Indian Ocean domain (101x241 grid) across 2010–2023 (Hobday et al. 2016).
Replaces the old 3-year (2021–2023) monthly-lookup baseline with smooth 14-year daily thresholds.
Data: backend/data/heatwave_depth/mhw_sst_2010_2023.npz (committed; keys thresh, mean, node_days, count),
or the older .npy trio (thresh.npy, mean.npy, node_days.npy) in the same folder.
"""

import os
import sys
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
HEATWAVE_DEPTH_DIR = os.path.join(DATA_DIR, 'heatwave_depth')

def get_14yr_climatology():
    npz = os.path.join(HEATWAVE_DEPTH_DIR, 'mhw_sst_2010_2023.npz')
    if os.path.exists(npz):
        with np.load(npz) as z:
            return z['thresh'], z['mean'], z['node_days']
    thresh = np.load(os.path.join(HEATWAVE_DEPTH_DIR, 'thresh.npy'))
    mean = np.load(os.path.join(HEATWAVE_DEPTH_DIR, 'mean.npy'))
    node_days = np.load(os.path.join(HEATWAVE_DEPTH_DIR, 'node_days.npy'))
    return thresh, mean, node_days

if __name__ == '__main__':
    t, m, n = get_14yr_climatology()
    print(f"Loaded 14-year climatology: thresh {t.shape}, mean {m.shape}, nodes {n.shape}")
