"""
OceanEmbed / Kyogre — Processing Pipeline for Chlorophyll-a & Wind Stress
=========================================================================
Implements spatial regridding, log-mean block binning, Large & Pond (1981)
bulk drag formulation for wind stress, spherical wind stress curl, and
Ekman pumping velocity over the North Indian Ocean domain.
"""

import os
import numpy as np
import netCDF4 as nc

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
FLOAT16_DIR = os.path.join(DATA_DIR, "float16")

TARGET_LATS = np.arange(5.0, 30.25, 0.25)   # 101 points: 5.0, 5.25 ... 30.0
TARGET_LONS = np.arange(45.0, 105.25, 0.25) # 241 points: 45.0, 45.25 ... 105.0

# Physical constants
R_EARTH = 6371000.0        # Mean radius of Earth (m)
RHO_AIR = 1.225            # Surface air density (kg/m^3)
RHO_SEAWATER = 1025.0      # Reference ocean water density (kg/m^3)
OMEGA_EARTH = 7.2921e-5    # Earth rotation rate (rad/s)
MIN_CORIOLIS_F = 1.27e-5   # Minimum Coriolis parameter f clamped at ~5° latitude to prevent equator singularity


def regrid_modis_chlorophyll(nc_path: str, sst_land_mask: np.ndarray | None = None) -> np.ndarray:
    """
    Regrids high-resolution (4km) MODIS-Aqua L3m Chlorophyll-a onto the 0.25° model grid (101, 241).
    Uses geometric log-mean block averaging over valid non-cloud pixels in each 0.25° cell.
    Cloud-obscured cells and land cells are set to NaN.
    """
    ds = nc.Dataset(nc_path)
    lats = ds.variables["lat"][:] # Descending (89.98 to -89.98)
    lons = ds.variables["lon"][:] # Ascending (-179.98 to 179.98)
    
    # Slice bounding box with 0.5° buffer
    lat_mask = (lats >= 4.5) & (lats <= 30.5)
    lon_mask = (lons >= 44.5) & (lons <= 105.5)
    
    sub_lats = lats[lat_mask][::-1] # Invert to ascending (5°N -> 30°N)
    sub_lons = lons[lon_mask]
    sub_chl = ds.variables["chlor_a"][lat_mask, :][:, lon_mask][::-1, :]
    
    fill_val = getattr(ds.variables["chlor_a"], "_FillValue", -32767.0)
    chl_data = np.array(sub_chl, dtype=np.float32)
    chl_data[chl_data <= fill_val + 1.0] = np.nan
    chl_data[chl_data <= 0.0] = np.nan
    ds.close()
    
    regrid = np.full((len(TARGET_LATS), len(TARGET_LONS)), np.nan, dtype=np.float32)
    dlat = 0.125
    dlon = 0.125
    
    for i, tlat in enumerate(TARGET_LATS):
        im = (sub_lats >= tlat - dlat) & (sub_lats < tlat + dlat)
        for j, tlon in enumerate(TARGET_LONS):
            if sst_land_mask is not None and sst_land_mask[i, j]:
                continue # Skip known land cells
            jm = (sub_lons >= tlon - dlon) & (sub_lons < tlon + dlon)
            block = chl_data[im, :][:, jm]
            valid = block[~np.isnan(block)]
            if len(valid) >= 1:
                # Geometric mean of log-normally distributed chlorophyll-a
                regrid[i, j] = 10.0 ** np.mean(np.log10(valid))
                
    return regrid


def compute_wind_stress_and_ekman(u10: np.ndarray, v10: np.ndarray) -> dict[str, np.ndarray]:
    """
    Computes surface wind stress (Large & Pond 1981) and spherical Ekman pumping velocity
    from 10m wind components (u10, v10) on the model target grid (101, 241).
    
    Latitude must be ascending (5°N at index 0, 30°N at index 100).
    """
    w_speed = np.sqrt(u10**2 + v10**2)
    
    # Large & Pond (1981) drag coefficient formulation
    cd = np.where(
        w_speed <= 11.0,
        1.2e-3,
        (0.49 + 0.065 * w_speed) * 1e-3
    )
    # Surface wind stress vector components (N/m^2 = Pa)
    tau_x = RHO_AIR * cd * w_speed * u10
    tau_y = RHO_AIR * cd * w_speed * v10
    tau_mag = np.sqrt(tau_x**2 + tau_y**2)
    
    # Spherical curl of wind stress:
    # curl_z = (1 / (R * cos(phi))) * [ d(tau_y)/d(lon) - d(tau_x * cos(phi))/d(lat) ]
    dlat_rad = np.radians(0.25)
    dlon_rad = np.radians(0.25)
    phi = np.radians(TARGET_LATS)[:, None] # Shape (101, 1)
    
    d_tau_y_d_lon = np.gradient(tau_y, axis=1) / dlon_rad
    tau_x_cos = tau_x * np.cos(phi)
    d_tau_x_cos_d_lat = np.gradient(tau_x_cos, axis=0) / dlat_rad
    
    curl_tau = (1.0 / (R_EARTH * np.cos(phi))) * (d_tau_y_d_lon - d_tau_x_cos_d_lat)
    
    # Ekman vertical pumping velocity w_E = curl / (rho_w * f)
    f_coriolis = 2.0 * OMEGA_EARTH * np.sin(phi) # Shape (101, 1)
    f_safe = np.where(
        np.abs(f_coriolis) < MIN_CORIOLIS_F,
        np.sign(f_coriolis) * MIN_CORIOLIS_F,
        f_coriolis
    )
    w_ekman = curl_tau / (RHO_SEAWATER * f_safe) # m/s
    w_ekman_day = w_ekman * 86400.0              # m/day
    
    return {
        "wind_speed": w_speed.astype(np.float32),
        "tau_x": tau_x.astype(np.float32),
        "tau_y": tau_y.astype(np.float32),
        "tau_mag": tau_mag.astype(np.float32),
        "curl_tau": curl_tau.astype(np.float32),
        "ekman_upwelling_day": w_ekman_day.astype(np.float32),
    }


def process_era5_winds_nc(nc_path: str) -> dict[str, np.ndarray]:
    """
    Reads an ERA5 winds NetCDF file, flips the latitude dimension so it runs
    South (5°N) to North (30°N), and returns the computed wind stress and Ekman fields.
    """
    ds = nc.Dataset(nc_path)
    # Shape might be (time, lat, lon) or (lat, lon)
    u_raw = ds.variables["u10"][:]
    v_raw = ds.variables["v10"][:]
    ds.close()
    
    if u_raw.ndim == 3:
        # Flip latitude axis (axis 1)
        u10 = u_raw[:, ::-1, :]
        v10 = v_raw[:, ::-1, :]
        n_times = u10.shape[0]
        results = {
            "wind_speed": np.zeros_like(u10, dtype=np.float32),
            "tau_x": np.zeros_like(u10, dtype=np.float32),
            "tau_y": np.zeros_like(u10, dtype=np.float32),
            "tau_mag": np.zeros_like(u10, dtype=np.float32),
            "curl_tau": np.zeros_like(u10, dtype=np.float32),
            "ekman_upwelling_day": np.zeros_like(u10, dtype=np.float32),
        }
        for t in range(n_times):
            step_res = compute_wind_stress_and_ekman(u10[t], v10[t])
            for k in results:
                results[k][t] = step_res[k]
        return results
    else:
        u10 = u_raw[::-1, :]
        v10 = v_raw[::-1, :]
        return compute_wind_stress_and_ekman(u10, v10)
