"""
OceanEmbed / Kyogre — Build ERA5 Wind Stress & Ekman Upwelling Arrays (2021–2023)
================================================================================
Processes annual ERA5 10m wind NetCDFs (2021, 2022, 2023), computes:
  - 10m Wind Speed (m/s)
  - Surface Wind Stress magnitude and components (Large & Pond 1981, N/m^2)
  - Spherical Wind Stress Curl (N/m^3)
  - Ekman Upwelling Pumping Velocity (m/day)
Saves outputs as memory-mapped float16 .npy arrays in backend/data/float16/.
"""

import os
import sys
import numpy as np
import netCDF4 as nc

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import process_external_datasets as ped

DATA_DIR = os.path.join(BASE_DIR, "data", "downloads")
OUT_DIR = os.path.join(BASE_DIR, "data", "float16")
TOTAL_DAYS = 1095  # 365 * 3


def build_era5_arrays():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    # Target memory-mapped files
    w_speed_path = os.path.join(OUT_DIR, "wind_speed.npy")
    tau_mag_path = os.path.join(OUT_DIR, "wind_stress_mag.npy")
    ekman_path = os.path.join(OUT_DIR, "ekman_upwelling.npy")
    tau_x_path = os.path.join(OUT_DIR, "tau_x.npy")
    tau_y_path = os.path.join(OUT_DIR, "tau_y.npy")
    
    w_speed_arr = np.lib.format.open_memmap(w_speed_path, mode="w+", dtype=np.float16, shape=(TOTAL_DAYS, 101, 241))
    tau_mag_arr = np.lib.format.open_memmap(tau_mag_path, mode="w+", dtype=np.float16, shape=(TOTAL_DAYS, 101, 241))
    ekman_arr = np.lib.format.open_memmap(ekman_path, mode="w+", dtype=np.float16, shape=(TOTAL_DAYS, 101, 241))
    tau_x_arr = np.lib.format.open_memmap(tau_x_path, mode="w+", dtype=np.float16, shape=(TOTAL_DAYS, 101, 241))
    tau_y_arr = np.lib.format.open_memmap(tau_y_path, mode="w+", dtype=np.float16, shape=(TOTAL_DAYS, 101, 241))
    
    day_offset = 0
    years = [2021, 2022, 2023]
    
    for year in years:
        nc_file = os.path.join(DATA_DIR, f"era5_{year}.nc")
        if not os.path.exists(nc_file):
            raise FileNotFoundError(f"ERA5 file for {year} not found: {nc_file}")
            
        print(f"[ERA5 Processor] Reading {nc_file}...")
        ds = nc.Dataset(nc_file)
        u_raw = ds.variables["u10"][:] # shape (days, 101, 241)
        v_raw = ds.variables["v10"][:]
        ds.close()
        
        n_days = u_raw.shape[0]
        print(f"[ERA5 Processor] Processing {n_days} days for {year}...")
        
        # Latitude in CDS ERA5 is North (30°N) to South (5°N).
        # Invert latitude axis (axis 1) so it runs South (5°N) to North (30°N).
        u_asc = u_raw[:, ::-1, :]
        v_asc = v_raw[:, ::-1, :]
        
        for t in range(n_days):
            idx = day_offset + t
            res = ped.compute_wind_stress_and_ekman(u_asc[t], v_asc[t])
            w_speed_arr[idx] = res["wind_speed"].astype(np.float16)
            tau_mag_arr[idx] = res["tau_mag"].astype(np.float16)
            ekman_arr[idx] = res["ekman_upwelling_day"].astype(np.float16)
            tau_x_arr[idx] = res["tau_x"].astype(np.float16)
            tau_y_arr[idx] = res["tau_y"].astype(np.float16)
            
        day_offset += n_days
        print(f"[ERA5 Processor] Year {year} complete. Total days processed: {day_offset}/{TOTAL_DAYS}")
        
    w_speed_arr.flush()
    tau_mag_arr.flush()
    ekman_arr.flush()
    tau_x_arr.flush()
    tau_y_arr.flush()
    print("[ERA5 Processor] All ERA5 float16 arrays successfully built and flushed!")


if __name__ == "__main__":
    build_era5_arrays()
