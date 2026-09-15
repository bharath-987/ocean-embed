"""
Precompute and cache monthly SST climatology (mean and 90th percentile)
for the North Indian Ocean domain (101x241 grid) across 2021-2023.
Saves compressed arrays to backend/data/mhw_climatology.npz.
Used by Hobday et al. (2016) Marine Heatwave detection algorithm.
"""

import os
import sys
import time
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
SST_PATH = os.path.join(DATA_DIR, 'sst.npy')
OUTPUT_PATH = os.path.join(DATA_DIR, 'mhw_climatology.npz')

def compute_climatology():
    t0 = time.time()
    print("Loading SST array via mmap...")
    sst_arr = np.load(SST_PATH, mmap_mode='r')
    
    # 2021-2023 3-year date range (1,095 days)
    dates_3yr = pd.date_range('2021-01-01', periods=1095, freq='D')
    months_3yr = dates_3yr.month.values
    
    num_months = 12
    num_lats = sst_arr.shape[1]  # 101
    num_lons = sst_arr.shape[2]  # 241
    
    print(f"Computing monthly climatology for {num_months} months across ({num_lats} x {num_lons}) domain...")
    mean_clim = np.zeros((num_months, num_lats, num_lons), dtype=np.float32)
    pct90_clim = np.zeros((num_months, num_lats, num_lons), dtype=np.float32)
    
    for m in range(1, 13):
        m_start = time.time()
        m_indices = np.where(months_3yr == m)[0]
        # Slice days for month m: shape (len(m_indices), 101, 241)
        m_slice = sst_arr[m_indices, :, :]
        
        # Mean SST across month days
        mean_clim[m - 1] = np.mean(m_slice, axis=0).astype(np.float32)
        # 90th percentile SST across month days
        pct90_clim[m - 1] = np.percentile(m_slice, 90, axis=0).astype(np.float32)
        
        elapsed_m = (time.time() - m_start) * 1000
        print(f"  Month {m:02d} ({len(m_indices)} days) computed in {elapsed_m:.1f}ms")
        
    metadata = {
        "description": "Monthly SST Climatology (Mean and 90th Percentile) for Hobday et al. (2016) MHW detection",
        "dataset_period": "2021-01-01 to 2023-12-31 (1,095 days)",
        "grid_shape": [num_months, num_lats, num_lons],
        "lat_range": [5.0, 30.0, 0.25],
        "lon_range": [45.0, 105.0, 0.25],
        "methodology": "Grouped historical daily observations by calendar month (~90 days/month per cell). Mean and 90th percentile computed per cell.",
        "caveats": "3-year baseline period (2021-2023). Indicative of synoptic and seasonal extremes; not a substitute for multi-decadal (10-30 year) climate normals."
    }
    
    print(f"Saving compressed climatology archive to {OUTPUT_PATH}...")
    np.savez_compressed(
        OUTPUT_PATH,
        mean_sst=mean_clim,
        pct90_sst=pct90_clim,
        metadata_json=np.array([str(metadata)])
    )
    
    file_size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    total_time = time.time() - t0
    print(f"Done in {total_time:.2f}s! File size: {file_size_kb:.1f} KB")
    return OUTPUT_PATH

if __name__ == '__main__':
    compute_climatology()
