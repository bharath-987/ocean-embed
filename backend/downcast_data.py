"""
OceanEmbed — Float16 Dataset Downcasting Utility
================================================
Reads the 9 original float32 .npy arrays in backend/data/ using mmap_mode="r",
casts them to float16, and writes them to backend/data/float16/ with identical filenames.
Original files in backend/data/ are untouched.

Chunked memory-mapped streaming is used to ensure minimal RAM footprint during conversion.
"""

import os
import sys
import time
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUT_DIR = os.path.join(DATA_DIR, "float16")

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

CHUNK_DAYS = 100  # Stream 100 days at a time along axis 0 to keep RAM < 50MB


def downcast_array(filename: str) -> tuple[float, float, str]:
    in_path = os.path.join(DATA_DIR, filename)
    out_path = os.path.join(OUT_DIR, filename)

    if not os.path.exists(in_path):
        raise FileNotFoundError(f"Source file not found: {in_path}")

    orig_size_bytes = os.path.getsize(in_path)
    orig_size_mb = orig_size_bytes / (1024 * 1024)

    # 1. Read with mmap_mode="r"
    in_arr = np.load(in_path, mmap_mode="r")
    shape = in_arr.shape
    total_days = shape[0]

    # 2. Prepare output file with open_memmap in float16
    out_arr = np.lib.format.open_memmap(
        out_path, mode="w+", dtype=np.float16, shape=shape
    )

    t0 = time.perf_counter()
    # 3. Stream chunk by chunk along axis 0
    for start_idx in range(0, total_days, CHUNK_DAYS):
        end_idx = min(start_idx + CHUNK_DAYS, total_days)
        out_arr[start_idx:end_idx] = in_arr[start_idx:end_idx].astype(np.float16)

    out_arr.flush()
    del out_arr
    del in_arr

    elapsed = time.perf_counter() - t0
    f16_size_bytes = os.path.getsize(out_path)
    f16_size_mb = f16_size_bytes / (1024 * 1024)
    reduction_pct = (1.0 - f16_size_bytes / orig_size_bytes) * 100.0

    # Sanity check output
    check = np.load(out_path, mmap_mode="r")
    assert check.dtype == np.float16, f"Expected float16, got {check.dtype}"
    assert check.shape == shape, f"Expected shape {shape}, got {check.shape}"
    del check

    print(
        f"  {filename:<22} : {orig_size_mb:8.2f} MB -> {f16_size_mb:8.2f} MB "
        f"(-{reduction_pct:4.1f}%) in {elapsed:5.1f}s"
    )
    return orig_size_mb, f16_size_mb, f"{filename}"


def main():
    print("=" * 75)
    print("  OceanEmbed — Downcasting Datasets from float32 to float16")
    print(f"  Source:      {DATA_DIR}")
    print(f"  Destination: {OUT_DIR}")
    print("=" * 75)

    os.makedirs(OUT_DIR, exist_ok=True)

    total_orig_mb = 0.0
    total_f16_mb = 0.0
    t_start = time.perf_counter()

    for filename in NPY_FILES:
        orig_mb, f16_mb, _ = downcast_array(filename)
        total_orig_mb += orig_mb
        total_f16_mb += f16_mb

    total_time = time.perf_counter() - t_start
    total_reduction_mb = total_orig_mb - total_f16_mb
    total_reduction_pct = (total_reduction_mb / total_orig_mb) * 100.0

    print("=" * 75)
    print(f"  Total Original float32: {total_orig_mb:8.2f} MB ({total_orig_mb / 1024:.2f} GB)")
    print(f"  Total Downcast float16: {total_f16_mb:8.2f} MB ({total_f16_mb / 1024:.2f} GB)")
    print(f"  Space Saved:            {total_reduction_mb:8.2f} MB ({total_reduction_pct:.1f}% reduction)")
    print(f"  Total Time:             {total_time:8.1f}s")
    print("=" * 75)


if __name__ == "__main__":
    main()
