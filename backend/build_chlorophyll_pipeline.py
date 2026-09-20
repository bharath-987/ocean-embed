"""
OceanEmbed / Kyogre — Streamline Chlorophyll Batch Downloader & Processor
========================================================================
Downloads, regrids, and builds the complete 2021-2023 satellite chlorophyll dataset
with 12-month geometric mean climatology fallback and parallel chl_source tracking.
"""

import os
import sys
import glob
import time
import datetime
import numpy as np
import netCDF4 as nc
import earthaccess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import process_external_datasets as ped

DATA_DIR = os.path.join(BASE_DIR, "data")
BINNED_DIR = os.path.join(DATA_DIR, "downloads", "chla_binned")
FLOAT16_DIR = os.path.join(DATA_DIR, "float16")
TMP_DOWNLOAD_DIR = os.path.join(DATA_DIR, "downloads", "tmp_chla")

TARGET_LATS = ped.TARGET_LATS  # 101 (5°N -> 30°N)
TARGET_LONS = ped.TARGET_LONS  # 241 (45°E -> 105°E)
TOTAL_DAYS = 1095              # 2021-01-01 to 2023-12-31


def get_all_8d_periods(years=[2021, 2022, 2023]):
    periods = []
    for year in years:
        doy = 1
        year_start = datetime.date(year, 1, 1)
        is_leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
        total_days = 366 if is_leap else 365
        while doy <= total_days:
            s = year_start + datetime.timedelta(days=doy - 1)
            end_doy = min(doy + 7, total_days)
            e = year_start + datetime.timedelta(days=end_doy - 1)
            s_str = s.strftime("%Y%m%d")
            e_str = e.strftime("%Y%m%d")
            mid = s + datetime.timedelta(days=(end_doy - doy) // 2)
            periods.append({
                "year": year,
                "doy": doy,
                "start_date": s,
                "end_date": e,
                "mid_date": mid,
                "month": mid.month,
                "period_id": f"{s_str}_{e_str}",
            })
            doy += 8
    return periods


def get_ocean_land_mask():
    sst_path = os.path.join(FLOAT16_DIR, "sst.npy")
    sst_arr = np.load(sst_path, mmap_mode="r")
    # Ocean is any cell where sst > 0 on at least one day
    # Or median across first 100 days
    sample = np.array(sst_arr[:60], dtype=np.float32)
    ocean_mask = np.any(sample > 0.0, axis=0) # True for ocean, False for land
    return ocean_mask


def regrid_file(nc_path: str, ocean_mask: np.ndarray) -> np.ndarray:
    """Regrids a NetCDF (4km or 9km) to (101, 241) log-mean grid."""
    ds = nc.Dataset(nc_path)
    lats = ds.variables["lat"][:]
    lons = ds.variables["lon"][:]
    
    lat_mask = (lats >= 4.5) & (lats <= 30.5)
    lon_mask = (lons >= 44.5) & (lons <= 105.5)
    
    sub_lats = lats[lat_mask][::-1] # ascending
    sub_lons = lons[lon_mask]
    sub_chl = ds.variables["chlor_a"][lat_mask, :][:, lon_mask][::-1, :]
    fill = getattr(ds.variables["chlor_a"], "_FillValue", -32767.0)
    arr = np.array(sub_chl, dtype=np.float32)
    arr[arr <= fill + 1.0] = np.nan
    arr[arr <= 0.0] = np.nan
    ds.close()
    
    out = np.full((101, 241), np.nan, dtype=np.float32)
    dlat = 0.125
    dlon = 0.125
    
    for i, tlat in enumerate(TARGET_LATS):
        im = (sub_lats >= tlat - dlat) & (sub_lats < tlat + dlat)
        for j, tlon in enumerate(TARGET_LONS):
            if not ocean_mask[i, j]:
                continue # Skip land
            jm = (sub_lons >= tlon - dlon) & (sub_lons < tlon + dlon)
            blk = arr[im, :][:, jm]
            val = blk[~np.isnan(blk)]
            if len(val) >= 1:
                out[i, j] = 10.0 ** np.mean(np.log10(val))
    return out


def download_and_regrid_all():
    os.makedirs(BINNED_DIR, exist_ok=True)
    os.makedirs(TMP_DOWNLOAD_DIR, exist_ok=True)
    ocean_mask = get_ocean_land_mask()
    
    periods = get_all_8d_periods()
    print(f"[Chl Pipeline] Total 8-day composite periods across 2021-2023: {len(periods)}")
    
    # 1. Check existing cached files in downloads
    existing_ncs = glob.glob(os.path.join(DATA_DIR, "downloads", "**", "*.nc"), recursive=True)
    for p in periods:
        binned_file = os.path.join(BINNED_DIR, f"chla_{p['period_id']}.npy")
        if os.path.exists(binned_file):
            continue
        # Check if NetCDF already exists in downloads
        s_str, e_str = p["period_id"].split("_")
        matched = [f for f in existing_ncs if f"{s_str}_{e_str}" in f and "8D" in f]
        if matched:
            print(f"[Chl Pipeline] Regridding pre-existing NetCDF: {matched[0]}")
            grid = regrid_file(matched[0], ocean_mask)
            np.save(binned_file, grid)
            
    # Check what is still missing
    missing_periods = [p for p in periods if not os.path.exists(os.path.join(BINNED_DIR, f"chla_{p['period_id']}.npy"))]
    print(f"[Chl Pipeline] Periods already binned: {len(periods) - len(missing_periods)} / {len(periods)}")
    print(f"[Chl Pipeline] Missing periods to download: {len(missing_periods)}")
    
    if not missing_periods:
        print("[Chl Pipeline] All periods already binned!")
        return periods
        
    auth = earthaccess.login(strategy="netrc")
    
    # 2. Check and regrid any pre-existing NetCDFs in TMP_DOWNLOAD_DIR
    for p in periods:
        binned_file = os.path.join(BINNED_DIR, f"chla_{p['period_id']}.npy")
        if os.path.exists(binned_file):
            continue
        s_str, e_str = p["period_id"].split("_")
        matched_tmp = glob.glob(os.path.join(TMP_DOWNLOAD_DIR, f"*{s_str}*8D*.nc"))
        if matched_tmp:
            print(f"[Chl Pipeline] Regridding pre-existing tmp NetCDF: {matched_tmp[0]}", flush=True)
            try:
                grid = regrid_file(matched_tmp[0], ocean_mask)
                np.save(binned_file, grid)
                print(f"  Saved binned: {binned_file}", flush=True)
                os.remove(matched_tmp[0])
            except Exception as e:
                print(f"  Error regridding {matched_tmp[0]}: {e}", flush=True)

    # Check what is still missing
    missing_periods = [p for p in periods if not os.path.exists(os.path.join(BINNED_DIR, f"chla_{p['period_id']}.npy"))]
    print(f"[Chl Pipeline] Periods already binned: {len(periods) - len(missing_periods)} / {len(periods)}", flush=True)
    print(f"[Chl Pipeline] Missing periods to download: {len(missing_periods)}", flush=True)

    if not missing_periods:
        print("[Chl Pipeline] All periods already binned!", flush=True)
        return periods

    auth = earthaccess.login(strategy="netrc")

    # Download missing periods with retry & immediate per-file regridding
    for idx, p in enumerate(missing_periods):
        binned_file = os.path.join(BINNED_DIR, f"chla_{p['period_id']}.npy")
        if os.path.exists(binned_file):
            continue

        s_str, e_str = p["period_id"].split("_")
        g_name = f"AQUA_MODIS.{s_str}_{e_str}.L3m.8D.CHL.chlor_a.9km.nc"
        print(f"\n[Chl Pipeline] [{idx + 1}/{len(missing_periods)}] Fetching {p['period_id']}...", flush=True)

        res = None
        for s_attempt in range(3):
            try:
                res = earthaccess.search_data(short_name="MODISA_L3m_CHL", granule_name=g_name, count=1)
                if not res:
                    s_prefix = s_str
                    res = earthaccess.search_data(short_name="MODISA_L3m_CHL", granule_name=f"*{s_prefix}*8D*9km.nc*", count=1)
                if res:
                    break
            except Exception as search_err:
                print(f"  CMR search attempt {s_attempt + 1} failed: {search_err}. Retrying in 3s...", flush=True)
                time.sleep(3)

        if not res:
            print(f"  Warning: Granule {g_name} not found in CMR. Skipping.", flush=True)
            continue

        granule = res[0]
        downloaded = []
        for dl_attempt in range(4):
            try:
                dl = earthaccess.download([granule], TMP_DOWNLOAD_DIR, threads=1)
                if dl:
                    downloaded = dl
                    break
            except Exception as dl_err:
                print(f"  Download attempt {dl_attempt + 1} failed: {dl_err}. Retrying in 5s...", flush=True)
                time.sleep(5)

        if not downloaded:
            print(f"  Warning: Failed to download {p['period_id']} after 4 attempts. Will fallback to climatology.", flush=True)
            continue

        fpath = str(downloaded[0])
        try:
            grid = regrid_file(fpath, ocean_mask)
            np.save(binned_file, grid)
            print(f"  Successfully binned {p['period_id']} -> {binned_file}", flush=True)
        except Exception as e:
            print(f"  Error regridding {fpath}: {e}", flush=True)
        finally:
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception:
                    pass

    return periods


def build_monthly_climatology(periods, ocean_mask):
    """
    Computes per-cell 12-month geometric mean chlorophyll from all 2021-2023 binned arrays.
    Infill any persistent cloud holes in monthly climatology via local ocean averaging.
    """
    print("\n[Climatology] Computing 12-month geometric mean climatology...")
    monthly_clim = np.full((12, 101, 241), np.nan, dtype=np.float32)
    
    for m in range(1, 13):
        # Find all periods whose midpoint is in month m
        m_periods = [p for p in periods if p["mid_date"].month == m]
        grids = []
        for p in m_periods:
            bf = os.path.join(BINNED_DIR, f"chla_{p['period_id']}.npy")
            if os.path.exists(bf):
                grids.append(np.load(bf))
                
        if not grids:
            print(f"  Warning: No grids found for month {m}")
            continue
            
        stack = np.array(grids) # (K, 101, 241)
        # Compute geometric mean where valid
        log_stack = np.log10(stack)
        
        m_clim = np.full((101, 241), np.nan, dtype=np.float32)
        for i in range(101):
            for j in range(241):
                if not ocean_mask[i, j]:
                    m_clim[i, j] = 0.0 # Land
                    continue
                vals = log_stack[:, i, j]
                valid_vals = vals[~np.isnan(vals)]
                if len(valid_vals) >= 1:
                    m_clim[i, j] = 10.0 ** np.mean(valid_vals)
                    
        # Infill any missing ocean cells in this month from valid neighbors
        missing_ocean = ocean_mask & np.isnan(m_clim)
        n_missing = np.count_nonzero(missing_ocean)
        if n_missing > 0:
            print(f"  Month {m:02d}: Infilling {n_missing} persistent cloud cells in climatology from neighbors...")
            for i in range(101):
                for j in range(241):
                    if missing_ocean[i, j]:
                        # Distance-weighted average of valid ocean cells within 5 grid cells (1.25°)
                        i_min, i_max = max(0, i - 5), min(101, i + 6)
                        j_min, j_max = max(0, j - 5), min(241, j + 6)
                        sub_v = m_clim[i_min:i_max, j_min:j_max]
                        sub_mask = (~np.isnan(sub_v)) & (sub_v > 0.0)
                        if np.any(sub_mask):
                            m_clim[i, j] = np.nanmedian(sub_v[sub_mask])
                        else:
                            m_clim[i, j] = 0.30 # Default baseline oligotrophic value
                            
        monthly_clim[m - 1] = m_clim
        valid_count = np.count_nonzero(~np.isnan(m_clim) & ocean_mask)
        print(f"  Month {m:02d}: Ocean coverage 100% ({valid_count} ocean cells), Mean={np.nanmean(m_clim[ocean_mask]):.3f} mg/m3")
        
    out_clim_path = os.path.join(FLOAT16_DIR, "chla_monthly_clim.npy")
    np.save(out_clim_path, monthly_clim.astype(np.float16))
    print(f"[Climatology] Saved monthly climatology: {out_clim_path} (shape: {monthly_clim.shape})")
    return monthly_clim


def build_daily_arrays(periods, monthly_clim, ocean_mask):
    """
    Builds the 1095-day float16 arrays:
      - chla.npy (shape: 1095, 101, 241, float16)
      - chl_source.npy (shape: 1095, 101, 241, int8: 1=satellite, 0=climatology, -1=land)
    """
    print("\n[Daily Arrays] Assembling 1095-day chlorophyll & source arrays...")
    chla_path = os.path.join(FLOAT16_DIR, "chla.npy")
    source_path = os.path.join(FLOAT16_DIR, "chl_source.npy")
    
    chla_arr = np.lib.format.open_memmap(chla_path, mode="w+", dtype=np.float16, shape=(TOTAL_DAYS, 101, 241))
    source_arr = np.lib.format.open_memmap(source_path, mode="w+", dtype=np.int8, shape=(TOTAL_DAYS, 101, 241))
    
    start_date = datetime.date(2021, 1, 1)
    
    # Preload all binned composite grids into a memory dict
    comp_cache = {}
    for p in periods:
        bf = os.path.join(BINNED_DIR, f"chla_{p['period_id']}.npy")
        if os.path.exists(bf):
            comp_cache[p["period_id"]] = np.load(bf)
            
    print(f"  Loaded {len(comp_cache)} binned composites into cache.")
    
    # Statistics per season
    # Seasons:
    #   Winter: Dec, Jan, Feb
    #   Spring: Mar, Apr, May
    #   Summer (Monsoon): Jun, Jul, Aug, Sep
    #   Autumn: Oct, Nov
    season_stats = {
        "Winter (Dec-Feb)": {"sat": 0, "clim": 0},
        "Spring Inter-monsoon (Mar-May)": {"sat": 0, "clim": 0},
        "Summer Monsoon (Jun-Sep)": {"sat": 0, "clim": 0},
        "Autumn Inter-monsoon (Oct-Nov)": {"sat": 0, "clim": 0},
    }
    
    total_sat_cells = 0
    total_clim_cells = 0
    total_ocean_cell_days = 0
    
    for day_idx in range(TOTAL_DAYS):
        dt = start_date + datetime.timedelta(days=day_idx)
        # Find composite
        matched_p = None
        for p in periods:
            if p["start_date"] <= dt <= p["end_date"]:
                matched_p = p
                break
        if matched_p is None:
            # Fallback to period with closest mid_date
            matched_p = min(periods, key=lambda p: abs((p["mid_date"] - dt).days))
            
        comp_grid = comp_cache.get(matched_p["period_id"])
        clim_grid = monthly_clim[dt.month - 1]
        
        day_chl = np.zeros((101, 241), dtype=np.float16)
        day_src = np.full((101, 241), -1, dtype=np.int8) # -1 = land
        
        # Classify season
        if dt.month in (12, 1, 2):
            s_name = "Winter (Dec-Feb)"
        elif dt.month in (3, 4, 5):
            s_name = "Spring Inter-monsoon (Mar-May)"
        elif dt.month in (6, 7, 8, 9):
            s_name = "Summer Monsoon (Jun-Sep)"
        else:
            s_name = "Autumn Inter-monsoon (Oct-Nov)"
            
        for i in range(101):
            for j in range(241):
                if not ocean_mask[i, j]:
                    continue # Land: chl=0, src=-1
                    
                total_ocean_cell_days += 1
                
                # Check if satellite observation exists
                if comp_grid is not None and not np.isnan(comp_grid[i, j]) and comp_grid[i, j] > 0.0:
                    day_chl[i, j] = np.float16(comp_grid[i, j])
                    day_src[i, j] = 1 # Satellite
                    total_sat_cells += 1
                    season_stats[s_name]["sat"] += 1
                else:
                    day_chl[i, j] = np.float16(clim_grid[i, j])
                    day_src[i, j] = 0 # Climatology fallback
                    total_clim_cells += 1
                    season_stats[s_name]["clim"] += 1
                    
        chla_arr[day_idx] = day_chl
        source_arr[day_idx] = day_src
        
    chla_arr.flush()
    source_arr.flush()
    
    print("\n============================================================")
    print("  CHLOROPHYLL-A SATELLITE VS CLIMATOLOGY COVERAGE REPORT")
    print("============================================================")
    print(f"Total ocean cell-days evaluated: {total_ocean_cell_days:,}")
    pct_sat_total = total_sat_cells / total_ocean_cell_days * 100
    pct_clim_total = total_clim_cells / total_ocean_cell_days * 100
    print(f"Overall Satellite Observations: {total_sat_cells:,} ({pct_sat_total:.2f}%)")
    print(f"Overall Climatology Fallbacks:  {total_clim_cells:,} ({pct_clim_total:.2f}%)")
    print("\nCoverage Breakdown by Season:")
    for s_name, counts in season_stats.items():
        tot = counts["sat"] + counts["clim"]
        p_sat = counts["sat"] / tot * 100 if tot > 0 else 0
        p_clim = counts["clim"] / tot * 100 if tot > 0 else 0
        print(f"  {s_name:<32}: Satellite = {p_sat:5.1f}% | Climatology = {p_clim:5.1f}%")
    print("============================================================\n")


if __name__ == "__main__":
    periods = download_and_regrid_all()
    ocean_mask = get_ocean_land_mask()
    monthly_clim = build_monthly_climatology(periods, ocean_mask)
    build_daily_arrays(periods, monthly_clim, ocean_mask)
