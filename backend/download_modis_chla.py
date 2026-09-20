"""
OceanEmbed / Kyogre — NASA MODIS-Aqua L3 Mapped Chlorophyll-a Ingestion Utility
==============================================================================
Discovers and downloads MODIS-Aqua Level-3 4km 8-day composite (or daily)
Chlorophyll-a NetCDF files from NASA Ocean Color via earthaccess / CMR.
"""

import os
import sys
import datetime
import earthaccess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "data", "downloads", "modis_chla")


def get_8day_composite_bounds(dt: datetime.date) -> tuple[datetime.date, datetime.date]:
    """
    Computes the start and end dates of the MODIS 8-day composite window
    containing the given date. MODIS composites start on Day 1, 9, 17... of each year.
    """
    doy = dt.timetuple().tm_yday
    comp_start_doy = ((doy - 1) // 8) * 8 + 1
    year_start = datetime.date(dt.year, 1, 1)
    comp_start = year_start + datetime.timedelta(days=comp_start_doy - 1)
    comp_end = min(comp_start + datetime.timedelta(days=7), datetime.date(dt.year, 12, 31))
    return comp_start, comp_end


def download_modis_chla_composite(dt: datetime.date, out_dir: str = DOWNLOAD_DIR) -> str | None:
    """
    Downloads the MODIS-Aqua L3m 4km 8-day composite NetCDF covering the specified date.
    Returns the path to the downloaded NetCDF file.
    """
    os.makedirs(out_dir, exist_ok=True)
    comp_start, comp_end = get_8day_composite_bounds(dt)
    
    start_str = comp_start.strftime("%Y%m%d")
    end_str = comp_end.strftime("%Y%m%d")
    granule_pattern = f"AQUA_MODIS.{start_str}_{end_str}.L3m.8D.CHL.chlor_a.4km.nc"
    expected_path = os.path.join(out_dir, granule_pattern)
    
    if os.path.exists(expected_path) and os.path.getsize(expected_path) > 1024 * 1024:
        print(f"[MODIS Chl-a] Already cached: {expected_path}")
        return expected_path
    
    print(f"[MODIS Chl-a] Searching NASA CMR for granule: {granule_pattern}...")
    auth = earthaccess.login(strategy="netrc")
    results = earthaccess.search_data(
        short_name="MODISA_L3m_CHL",
        granule_name=granule_pattern,
        count=2
    )
    
    if not results:
        print(f"[MODIS Chl-a] No exact match for {granule_pattern}. Trying wildcard match...")
        results = earthaccess.search_data(
            short_name="MODISA_L3m_CHL",
            granule_name=f"*{start_str}*8D*4km.nc*",
            count=2
        )
    
    if not results:
        print(f"[MODIS Chl-a] Warning: No granule found for period {start_str} to {end_str}")
        return None
    
    print(f"[MODIS Chl-a] Downloading {len(results)} granule(s) to {out_dir}...")
    downloaded = earthaccess.download(results, out_dir)
    if downloaded:
        return str(downloaded[0])
    return None


if __name__ == "__main__":
    test_date = datetime.date(2022, 7, 2)
    path = download_modis_chla_composite(test_date)
    print(f"Result: {path}")
