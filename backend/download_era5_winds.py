"""
OceanEmbed / Kyogre — ECMWF ERA5 10m Wind Ingestion Utility
===========================================================
Submits retrieval requests to Copernicus Climate Data Store (CDS) for 10m
u/v wind components over the North Indian Ocean domain (5°N–30°N, 45°E–105°E).
"""

import os
import sys
import datetime
import cdsapi

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "data", "downloads", "era5_winds")
NORTH_INDIAN_OCEAN_AREA = [30, 45, 5, 105]  # North, West, South, East


def download_era5_winds_month(year: int, month: int, out_dir: str = DOWNLOAD_DIR) -> str:
    """
    Downloads all daily 10m u/v wind fields for the specified year and month.
    Saves as a NetCDF file in out_dir.
    """
    os.makedirs(out_dir, exist_ok=True)
    out_filename = f"era5_winds_{year}_{month:02d}.nc"
    out_path = os.path.join(out_dir, out_filename)
    
    if os.path.exists(out_path) and os.path.getsize(out_path) > 100 * 1024:
        print(f"[ERA5 Winds] Already cached: {out_path}")
        return out_path
    
    # Calculate days in month
    if month == 12:
        next_month = datetime.date(year + 1, 1, 1)
    else:
        next_month = datetime.date(year, month + 1, 1)
    days_in_month = (next_month - datetime.date(year, month, 1)).days
    days = [f"{d:02d}" for d in range(1, days_in_month + 1)]
    
    print(f"[ERA5 Winds] Requesting ERA5 10m winds for {year}-{month:02d} ({days_in_month} days)...")
    c = cdsapi.Client()
    c.retrieve(
        "reanalysis-era5-single-levels",
        {
            "product_type": ["reanalysis"],
            "variable": [
                "10m_u_component_of_wind",
                "10m_v_component_of_wind",
            ],
            "year": [str(year)],
            "month": [f"{month:02d}"],
            "day": days,
            "time": ["12:00"],
            "data_format": "netcdf",
            "download_format": "unarchived",
            "area": NORTH_INDIAN_OCEAN_AREA,
        },
        out_path
    )
    print(f"[ERA5 Winds] Successfully downloaded to {out_path}")
    return out_path


if __name__ == "__main__":
    path = download_era5_winds_month(2022, 7)
    print(f"Result: {path}")
