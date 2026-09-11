"""
OceanEmbed — Satellite Data Trimming Script
===========================================
Extracts specific day-index clusters (covering SIH demo dates with a 5-day buffer)
from the 9 original .npy arrays in backend/data/ and writes the trimmed arrays to
backend/data/trimmed/.

Clusters defined:
- Cluster A: days 29 to 51 (covers 2021-02-14 and 2021-02-16)
- Cluster B: days 532 to 552 (covers 2022-07-02)
- Cluster C: days 961 to 981 (covers 2023-09-04)

Also creates day_index_map.json mapping original day indices to trimmed array indices.
Original files in backend/data/ are untouched.
"""

import json
import os
import numpy as np

# ---------------------------------------------------------------------------
# 1. DIRECTORY CONFIGURATION
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
TRIMMED_DIR = os.path.join(DATA_DIR, "trimmed")

# Target 9 array files
TARGET_FILES = [
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

# ---------------------------------------------------------------------------
# 2. DEFINE CLUSTERS OF DAY INDICES
# ---------------------------------------------------------------------------
# Each cluster includes a 5-day buffer on both sides of the target demo dates:
# - Cluster A: days 29 to 51 (covers 2021-02-14 [day 44] and 2021-02-16 [day 46])
# - Cluster B: days 532 to 552 (covers 2022-07-02 [day 547])
# - Cluster C: days 961 to 981 (covers 2023-09-04 [day 976])
CLUSTER_A = list(range(29, 52))    # 23 days (29..51 inclusive)
CLUSTER_B = list(range(532, 553))  # 21 days (532..552 inclusive)
CLUSTER_C = list(range(961, 982))  # 21 days (961..981 inclusive)

ALL_INDICES = CLUSTER_A + CLUSTER_B + CLUSTER_C  # Total: 65 days in order A, B, C


def build_day_index_map(indices: list[int]) -> dict[int, int]:
    """
    Build a Python dict where:
      key = original day index (int)
      value = new position in the trimmed/concatenated array (int)
    Only indices actually kept are included.
    """
    return {int(orig_idx): int(new_idx) for new_idx, orig_idx in enumerate(indices)}


def trim_dataset():
    os.makedirs(TRIMMED_DIR, exist_ok=True)
    print("=" * 75)
    print("  OceanEmbed -- Trimming Satellite .npy Arrays for SIH Demo Clusters")
    print("=" * 75)
    print(f"Source Directory:  {DATA_DIR}")
    print(f"Target Directory:  {TRIMMED_DIR}")
    print(f"Cluster A (2021):  Days 29..51   ({len(CLUSTER_A)} days)")
    print(f"Cluster B (2022):  Days 532..552 ({len(CLUSTER_B)} days)")
    print(f"Cluster C (2023):  Days 961..981 ({len(CLUSTER_C)} days)")
    print(f"Total Trimmed Days: {len(ALL_INDICES)} days (out of original 2922)")
    print("-" * 75)

    # 1. Build and save day_index_map
    day_index_map = build_day_index_map(ALL_INDICES)
    map_filepath = os.path.join(TRIMMED_DIR, "day_index_map.json")
    with open(map_filepath, "w", encoding="utf-8") as f:
        json.dump(day_index_map, f, indent=2)
    print(f"Saved index mapping to: {map_filepath} ({len(day_index_map)} mapped entries)")
    print("-" * 75)

    # 2. Process all 9 .npy files
    total_orig_bytes = 0
    total_trimmed_bytes = 0

    print(f"{'Filename':<22} | {'Orig Shape':<18} | {'Trim Shape':<18} | {'Orig (MB)':>9} | {'Trim (MB)':>9} | {'Reduction':>9}")
    print("-" * 105)

    for fname in TARGET_FILES:
        orig_path = os.path.join(DATA_DIR, fname)
        trimmed_path = os.path.join(TRIMMED_DIR, fname)

        if not os.path.exists(orig_path):
            print(f"WARNING: File {fname} not found in {DATA_DIR}. Skipping.")
            continue

        orig_size_bytes = os.path.getsize(orig_path)
        total_orig_bytes += orig_size_bytes

        # Load with mmap_mode="r" for zero unnecessary memory overhead
        arr = np.load(orig_path, mmap_mode="r")
        orig_shape = arr.shape

        # Extract only day-index rows in ALL_INDICES along axis 0
        trimmed_arr = np.array(arr[ALL_INDICES], copy=True)
        trim_shape = trimmed_arr.shape

        # Save to trimmed directory
        np.save(trimmed_path, trimmed_arr)

        trimmed_size_bytes = os.path.getsize(trimmed_path)
        total_trimmed_bytes += trimmed_size_bytes

        orig_mb = orig_size_bytes / (1024 * 1024)
        trim_mb = trimmed_size_bytes / (1024 * 1024)
        reduction_pct = (1.0 - (trimmed_size_bytes / orig_size_bytes)) * 100.0

        print(f"{fname:<22} | {str(orig_shape):<18} | {str(trim_shape):<18} | {orig_mb:>9.2f} | {trim_mb:>9.2f} | {reduction_pct:>8.1f}%")

    print("-" * 105)
    total_orig_mb = total_orig_bytes / (1024 * 1024)
    total_trimmed_mb = total_trimmed_bytes / (1024 * 1024)
    total_reduction_pct = (1.0 - (total_trimmed_bytes / total_orig_bytes)) * 100.0 if total_orig_bytes > 0 else 0.0

    print(f"{'TOTAL':<22} | {'':<18} | {'':<18} | {total_orig_mb:>9.2f} | {total_trimmed_mb:>9.2f} | {total_reduction_pct:>8.1f}%")
    print("=" * 105)
    print(f"SUCCESS: Total reduction achieved: {total_orig_mb:.2f} MB -> {total_trimmed_mb:.2f} MB ({total_reduction_pct:.1f}% reduction, saved {total_orig_mb - total_trimmed_mb:.2f} MB)")
    print("Original files in backend/data/ remain completely unmodified.")
    print("=" * 105)


if __name__ == "__main__":
    trim_dataset()
