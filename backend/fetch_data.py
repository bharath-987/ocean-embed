"""
OceanEmbed — Hugging Face Dataset Fetcher
=========================================
Downloads the 9 float16 .npy dataset arrays from the Hugging Face dataset
repository "bharath-987/ocean-embed-data" into backend/data/float16/.

Files downloaded:
  - ssh_anom.npy
  - sss_anom.npy
  - sst.npy
  - sst_anom.npy
  - temp_target_clim.npy
  - u_cur_anom.npy
  - u_wind_anom.npy
  - v_cur_anom.npy
  - v_wind_anom.npy

Features:
  - Uses huggingface_hub.hf_hub_download with repo_type="dataset".
  - Skips re-downloading any file if it already exists locally with matching size.
  - Reads token from HF_TOKEN environment variable (passed if set).
  - Displays download progress and status for each file.
"""

import os
import sys
import time
from typing import Dict, Optional

try:
    from huggingface_hub import HfApi, hf_hub_download
except ImportError:
    print(
        "ERROR: huggingface_hub is not installed. "
        "Please run 'pip install huggingface_hub' first."
    )
    sys.exit(1)

REPO_ID = "bharath-987/ocean-embed-data"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "float16")

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

# Fallback byte sizes for 2021-01-01 through 2023-12-31 (1095 days) float16 arrays
KNOWN_SIZES: Dict[str, int] = {
    "ssh_anom.npy": 53306918,
    "sss_anom.npy": 53306918,
    "sst.npy": 53306918,
    "sst_anom.npy": 53306918,
    "temp_target_clim.npy": 799601978,
    "u_cur_anom.npy": 53306918,
    "u_wind_anom.npy": 53306918,
    "v_cur_anom.npy": 53306918,
    "v_wind_anom.npy": 53306918,
}


def fetch_all_data(dest_dir: str = DATA_DIR) -> None:
    os.makedirs(dest_dir, exist_ok=True)

    hf_token = os.environ.get("HF_TOKEN")
    if hf_token and not hf_token.strip():
        hf_token = None

    print("=" * 80)
    print("  OceanEmbed — Hugging Face Dataset Fetcher")
    print(f"  Repository:  {REPO_ID} (dataset)")
    print(f"  Destination: {dest_dir}")
    if hf_token:
        print("  Auth:        Using HF_TOKEN from environment")
    else:
        print("  Auth:        Anonymous (public repository)")
    print("=" * 80)

    # 1. Fetch remote file metadata for exact size comparisons
    remote_sizes: Dict[str, int] = {}
    try:
        api = HfApi(token=hf_token)
        info = api.repo_info(REPO_ID, repo_type="dataset", files_metadata=True)
        for sibling in info.siblings:
            if sibling.size is not None:
                remote_sizes[sibling.rfilename] = sibling.size
        print(f"Retrieved remote metadata for {len(remote_sizes)} files from Hugging Face.")
    except Exception as exc:
        print(f"Notice: Could not fetch remote metadata ({exc}). Falling back to known sizes.")
        remote_sizes = KNOWN_SIZES.copy()

    total_files = len(NPY_FILES)
    skipped_count = 0
    downloaded_count = 0
    start_total_time = time.perf_counter()

    for idx, filename in enumerate(NPY_FILES, start=1):
        target_path = os.path.join(dest_dir, filename)
        expected_size = remote_sizes.get(filename, KNOWN_SIZES.get(filename))

        # Check if already downloaded with matching size
        if os.path.exists(target_path):
            local_size = os.path.getsize(target_path)
            if expected_size is not None and local_size == expected_size:
                size_mb = local_size / (1024 * 1024)
                print(
                    f"[{idx}/{total_files}] SKIP: {filename} already exists with matching size "
                    f"({size_mb:.2f} MB, {local_size:,} bytes)."
                )
                skipped_count += 1
                continue
            elif expected_size is not None:
                print(
                    f"[{idx}/{total_files}] SIZE MISMATCH: {filename} local={local_size:,} bytes, "
                    f"expected={expected_size:,} bytes. Re-downloading..."
                )
            else:
                size_mb = local_size / (1024 * 1024)
                print(
                    f"[{idx}/{total_files}] SKIP: {filename} exists locally ({size_mb:.2f} MB)."
                )
                skipped_count += 1
                continue

        # Download file
        size_label = (
            f" (~{expected_size / (1024 * 1024):.2f} MB)" if expected_size else ""
        )
        print(f"[{idx}/{total_files}] DOWNLOADING: {filename}{size_label}...")
        t0 = time.perf_counter()

        try:
            downloaded_path = hf_hub_download(
                repo_id=REPO_ID,
                filename=filename,
                repo_type="dataset",
                local_dir=dest_dir,
                token=hf_token,
            )
            elapsed = time.perf_counter() - t0
            actual_size = os.path.getsize(downloaded_path)
            actual_mb = actual_size / (1024 * 1024)
            print(
                f"[{idx}/{total_files}] ✓ DONE: {filename} ({actual_mb:.2f} MB) in {elapsed:.1f}s"
            )
            downloaded_count += 1
        except Exception as err:
            print(f"[{idx}/{total_files}] ✗ ERROR downloading {filename}: {err}")
            raise

    total_time = time.perf_counter() - start_total_time
    print("=" * 80)
    print(
        f"Fetch Complete: {skipped_count} skipped, {downloaded_count} downloaded in {total_time:.1f}s."
    )
    print("=" * 80)


if __name__ == "__main__":
    fetch_all_data()
