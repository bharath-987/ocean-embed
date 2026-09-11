"""
OceanEmbed — Float16 Date Range Trimming Utility (2021-01-01 to 2023-12-31)
==========================================================================
Trims the 9 float16 .npy arrays in backend/data/float16/ down to strictly
cover 2021-01-01 through 2023-12-31 (1095 continuous days), discarding the
1827 extra days past 2023-12-31.

Destination: backend/data/float16_2021_2023/

Features:
  - Uses memory-mapped reads (mmap_mode="r") and open_memmap chunked streaming.
  - Zero full-array RAM allocations (< 50MB peak memory during conversion).
  - Preserves exact byte/shape integrity for the 3-year production period.
  - Generates day_index_map.json (identity mapping 0..1094) for compatibility.
"""

import json
import os
import sys
import time
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(BASE_DIR, "data", "float16")
TARGET_DIR = os.path.join(BASE_DIR, "data", "float16_2021_2023")

START_DATE = "2021-01-01"
END_DATE = "2023-12-31"

# 2021 (365) + 2022 (365) + 2023 (365) = 1095 days
TARGET_DAYS = (pd.Timestamp(END_DATE) - pd.Timestamp(START_DATE)).days + 1  # 1095
CHUNK_DAYS = 100  # Stream 100 days at a time along axis 0

NPY_FILES = [
    "ssh_anom.npy",
    "sss_anom.npy",
    "sst.npy",
    "sst_anom.npy",
    "temp_target_clim.npy",
    "u_cur_anom.npy",
    "u_wind_anom.npy",
    "v_cur_anom.npy",
    "v_wind_anom.npy",
]


def trim_array(filename: str) -> tuple[float, float, str]:
    in_path = os.path.join(SOURCE_DIR, filename)
    out_path = os.path.join(TARGET_DIR, filename)

    if not os.path.exists(in_path):
        raise FileNotFoundError(f"Source file not found: {in_path}")

    orig_size_mb = os.path.getsize(in_path) / (1024 * 1024)

    # 1. Read input with memory mapping
    in_arr = np.load(in_path, mmap_mode="r")
    orig_shape = in_arr.shape
    assert orig_shape[0] >= TARGET_DAYS, (
        f"{filename} has {orig_shape[0]} days, expected at least {TARGET_DAYS}"
    )

    out_shape = (TARGET_DAYS,) + orig_shape[1:]

    # 2. Allocate output memory-mapped file
    out_arr = np.lib.format.open_memmap(
        out_path, mode="w+", dtype=np.float16, shape=out_shape
    )

    t0 = time.perf_counter()
    # 3. Stream in 100-day chunks along axis 0
    for start_idx in range(0, TARGET_DAYS, CHUNK_DAYS):
        end_idx = min(start_idx + CHUNK_DAYS, TARGET_DAYS)
        out_arr[start_idx:end_idx] = in_arr[start_idx:end_idx]

    out_arr.flush()
    del out_arr
    del in_arr

    elapsed = time.perf_counter() - t0
    trimmed_size_mb = os.path.getsize(out_path) / (1024 * 1024)
    reduction_pct = (1.0 - trimmed_size_mb / orig_size_mb) * 100.0

    # Sanity check
    check = np.load(out_path, mmap_mode="r")
    assert check.dtype == np.float16, f"Expected float16, got {check.dtype}"
    assert check.shape == out_shape, f"Expected {out_shape}, got {check.shape}"
    del check

    print(
        f"  {filename:<22} : {orig_shape} ({orig_size_mb:7.1f} MB) -> "
        f"{out_shape} ({trimmed_size_mb:7.1f} MB) [-{reduction_pct:4.1f}%] in {elapsed:4.1f}s"
    )
    return orig_size_mb, trimmed_size_mb, filename


def main():
    print("=" * 80)
    print("  OceanEmbed — Trimming Dataset to 2021-01-01 through 2023-12-31")
    print(f"  Source:      {SOURCE_DIR}")
    print(f"  Destination: {TARGET_DIR}")
    print(f"  Target Days: {TARGET_DAYS} days (continuous, zero gaps)")
    print("=" * 80)

    os.makedirs(TARGET_DIR, exist_ok=True)

    # Generate identity day_index_map for full 2021-2023 coverage
    day_map = {int(i): int(i) for i in range(TARGET_DAYS)}
    map_path = os.path.join(TARGET_DIR, "day_index_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(day_map, f, indent=2)
    print(f"Saved identity index map: {map_path} ({len(day_map)} entries)")
    print("-" * 80)

    total_orig_mb = 0.0
    total_trim_mb = 0.0
    t_start = time.perf_counter()

    for filename in NPY_FILES:
        orig_mb, trim_mb, _ = trim_array(filename)
        total_orig_mb += orig_mb
        total_trim_mb += trim_mb

    overall_reduction = (1.0 - total_trim_mb / total_orig_mb) * 100.0
    total_elapsed = time.perf_counter() - t_start

    print("=" * 80)
    print(
        f"Total Footprint: {total_orig_mb:,.1f} MB ({total_orig_mb/1024:.2f} GB) -> "
        f"{total_trim_mb:,.1f} MB ({total_trim_mb/1024:.2f} GB) "
        f"[-{overall_reduction:.1f}%] in {total_elapsed:.1f}s"
    )
    print("=" * 80)


if __name__ == "__main__":
    main()
