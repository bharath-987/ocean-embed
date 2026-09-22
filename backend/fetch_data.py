"""
OceanEmbed — Hugging Face Dataset Fetcher & Readiness Verifier
============================================================
Checks and downloads the 9 float16 .npy dataset arrays + metadata
from the Hugging Face dataset repository "bharath-987/ocean-embed-data"
into backend/data/float16/.

Files verified/downloaded (~1.23 GB total):
  - ssh_anom.npy         (53,306,918 bytes)
  - sss_anom.npy         (53,306,918 bytes)
  - sst.npy              (53,306,918 bytes)
  - sst_anom.npy         (53,306,918 bytes)
  - temp_target_clim.npy (799,601,978 bytes)
  - u_cur_anom.npy       (53,306,918 bytes)
  - u_wind_anom.npy      (53,306,918 bytes)
  - v_cur_anom.npy       (53,306,918 bytes)
  - v_wind_anom.npy      (53,306,918 bytes)
  - day_index_map.json   (16,398 bytes)

Features:
  - Checks if dataset is already complete locally; skips downloading if verified.
  - Automatically fetches missing files using huggingface_hub.
  - Logs clear progress, byte sizes in MB, and transfer timing.
  - Fails loudly with clear error details on any failure (network, auth, missing repo).
  - Can be run as a standalone script or imported via ensure_data_ready().
"""

import os
import sys
import time
from typing import Dict, Optional

try:
    from huggingface_hub import HfApi, hf_hub_download
except ImportError:
    HfApi = None
    hf_hub_download = None

REPO_ID = os.environ.get("HF_DATASET_REPO_ID", "bharath-987/ocean-embed-data")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data", "float16"))
V6_DIR = os.environ.get("V6_DIR", os.path.join(BASE_DIR, "data", "v6_satswap_anom_14yr"))

# Expected float16 dataset files and byte sizes for continuous 2021-01-01 to 2023-12-31 (1095 days)
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
    "day_index_map.json": 16398,
}

# 14-Year Model (v6_satswap_anom_14yr) files and byte sizes (Hugging Face dataset)
V6_KNOWN_SIZES: Dict[str, int] = {
    "correction_v6_satswap_anom_14yr.json": 1415,
    "v6_satswap_anom_14yr.bundle.npz": 10268579,
    "products_v6_satswap_anom_14yr_2023-01-01_2023-12-31.npz": 22187928,
    "field_v6_satswap_anom_14yr_2023-01-01_2023-12-31.npz": 64837557,
    "embeddings_v6_satswap_anom_14yr_2023-01-01_2023-12-31.npz": 127401590,
}

REQUIRED_FILES = list(KNOWN_SIZES.keys())
V6_REQUIRED_FILES = list(V6_KNOWN_SIZES.keys())


def is_v6_unpacked(v6_dir: str = V6_DIR) -> bool:
    """Check if v6 model unpacked folders (field, products, embeddings) exist and are complete."""
    unpacked = os.path.join(v6_dir, "unpacked")
    for sub in ("field", "products", "embeddings"):
        meta = os.path.join(unpacked, sub, "meta.json")
        if not os.path.exists(meta):
            return False
    return True


def ensure_v6_unpacked(v6_dir: str = V6_DIR) -> None:
    """
    Idempotently unpacks v6 model .npz files into unpacked/ subdirectories.
    If already unpacked, skips cleanly without modifying anything.
    If any required .npz asset is missing, raises an explicit, descriptive FileNotFoundError.
    """
    if is_v6_unpacked(v6_dir):
        return

    # Check for serving.py unpack function
    sys.path.insert(0, v6_dir)
    try:
        import serving
    except ImportError as err:
        raise RuntimeError(f"Cannot import serving module from {v6_dir}: {err}") from err

    npz_mapping = {
        "field": "field_v6_satswap_anom_14yr_2023-01-01_2023-12-31.npz",
        "products": "products_v6_satswap_anom_14yr_2023-01-01_2023-12-31.npz",
        "embeddings": "embeddings_v6_satswap_anom_14yr_2023-01-01_2023-12-31.npz",
    }

    unpacked_dir = os.path.join(v6_dir, "unpacked")
    for sub, npz_name in npz_mapping.items():
        out_sub = os.path.join(unpacked_dir, sub)
        meta_file = os.path.join(out_sub, "meta.json")
        if os.path.exists(meta_file):
            continue  # Subdirectory already unpacked cleanly

        npz_path = os.path.join(v6_dir, npz_name)
        if not os.path.exists(npz_path):
            raise FileNotFoundError(
                f"\n{'=' * 80}\n"
                f"MISSING REQUIRED MODEL ASSET: '{npz_name}' was not found in {v6_dir}!\n"
                f"The 14-year model (v6_satswap_anom_14yr) requires this precomputed .npz file.\n"
                f"Please run: 'python backend/fetch_data.py' to download all required model assets\n"
                f"from Hugging Face repository '{REPO_ID}'.\n"
                f"{'=' * 80}\n"
            )

        print(f"[v6_adapter] Unpacking {npz_name} -> {out_sub}...", flush=True)
        serving.unpack(npz_path, out_sub)
        print(f"[v6_adapter] [PASS] Unpacked {sub} successfully.", flush=True)


def is_data_complete(dest_dir: str = DATA_DIR) -> bool:
    """Check if all required files exist in dest_dir with exact expected byte sizes."""
    if not os.path.isdir(dest_dir):
        return False
    for filename, expected_size in KNOWN_SIZES.items():
        filepath = os.path.join(dest_dir, filename)
        if not os.path.exists(filepath):
            return False
        if filename == "day_index_map.json":
            if os.path.getsize(filepath) < 5000:
                return False
            continue
        if os.path.getsize(filepath) != expected_size:
            return False
    return True


def fetch_all_data(dest_dir: str = DATA_DIR, force: bool = False, repo_id: Optional[str] = None) -> None:
    """
    Downloads and verifies the full float16 dataset.
    If all files already exist with valid sizes and not force, skips download.
    Fails loudly with RuntimeError if download fails.
    """
    target_repo = repo_id or os.environ.get("HF_DATASET_REPO_ID", REPO_ID)
    os.makedirs(dest_dir, exist_ok=True)

    hf_token = os.environ.get("HF_TOKEN")
    if hf_token and not hf_token.strip():
        hf_token = None

    print("=" * 80, flush=True)
    print("  OceanEmbed — Hugging Face Dataset Fetcher & Readiness Check", flush=True)
    print(f"  Repository:  {target_repo} (dataset)", flush=True)
    print(f"  Destination: {dest_dir}", flush=True)
    if hf_token:
        print("  Auth:        Using HF_TOKEN from environment", flush=True)
    else:
        print("  Auth:        Anonymous (public repository)", flush=True)
    print("=" * 80, flush=True)

    # 1. Quick check: if already complete and verified, skip immediately
    if not force and is_data_complete(dest_dir):
        total_mb = sum(KNOWN_SIZES.values()) / (1024 * 1024)
        print(
            f"[PASS] All {len(REQUIRED_FILES)} dataset files already exist and match verified sizes "
            f"({total_mb:.2f} MB / ~1.23 GB).",
            flush=True
        )
        print(f"[PASS] Dataset is ready in {dest_dir}. Skipping download.", flush=True)
        print("=" * 80, flush=True)
        return

    # 2. Fetch remote file metadata for exact size comparisons
    remote_sizes: Dict[str, int] = {}
    try:
        api = HfApi(token=hf_token)
        info = api.repo_info(target_repo, repo_type="dataset", files_metadata=True)
        for sibling in info.siblings:
            if sibling.size is not None:
                remote_sizes[sibling.rfilename] = sibling.size
        print(f"Retrieved remote metadata for {len(remote_sizes)} files from Hugging Face.", flush=True)
    except Exception as exc:
        print(f"Notice: Could not fetch remote metadata ({exc}). Falling back to known sizes.", flush=True)
        remote_sizes = KNOWN_SIZES.copy()

    total_files = len(REQUIRED_FILES)
    skipped_count = 0
    downloaded_count = 0
    downloaded_bytes = 0
    start_total_time = time.perf_counter()

    for idx, filename in enumerate(REQUIRED_FILES, start=1):
        target_path = os.path.join(dest_dir, filename)
        expected_size = remote_sizes.get(filename, KNOWN_SIZES.get(filename))

        # Check if already downloaded with matching size
        if os.path.exists(target_path):
            local_size = os.path.getsize(target_path)
            if expected_size is not None and local_size == expected_size:
                size_mb = local_size / (1024 * 1024)
                print(
                    f"[{idx}/{total_files}] SKIP: {filename} already exists with matching size "
                    f"({size_mb:.2f} MB, {local_size:,} bytes).",
                    flush=True
                )
                skipped_count += 1
                continue
            elif expected_size is not None:
                print(
                    f"[{idx}/{total_files}] SIZE MISMATCH: {filename} local={local_size:,} bytes, "
                    f"expected={expected_size:,} bytes. Re-downloading...",
                    flush=True
                )
            else:
                size_mb = local_size / (1024 * 1024)
                print(
                    f"[{idx}/{total_files}] SKIP: {filename} exists locally ({size_mb:.2f} MB).",
                    flush=True
                )
                skipped_count += 1
                continue

        # Download file
        size_label = (
            f" (~{expected_size / (1024 * 1024):.2f} MB)" if expected_size else ""
        )
        print(f"[{idx}/{total_files}] DOWNLOADING: {filename}{size_label}...", flush=True)
        t0 = time.perf_counter()

        try:
            downloaded_path = hf_hub_download(
                repo_id=target_repo,
                filename=filename,
                repo_type="dataset",
                local_dir=dest_dir,
                token=hf_token,
            )
            elapsed = time.perf_counter() - t0
            actual_size = os.path.getsize(downloaded_path)
            actual_mb = actual_size / (1024 * 1024)
            speed_mb = actual_mb / max(0.001, elapsed)
            print(
                f"[{idx}/{total_files}] [PASS] DONE: {filename} ({actual_mb:.2f} MB) in {elapsed:.1f}s ({speed_mb:.1f} MB/s)",
                flush=True
            )
            downloaded_count += 1
            downloaded_bytes += actual_size
        except Exception as err:
            err_msg = (
                "\n" + "=" * 80 + "\n"
                f"FATAL ERROR: Failed to download dataset file '{filename}' from Hugging Face Hub!\n"
                f"Repository:  {target_repo}\n"
                f"File:        {filename}\n"
                f"Error:       {type(err).__name__}: {err}\n"
                "Please verify network connectivity, repository visibility, or provide a valid HF_TOKEN.\n"
                "Exiting container startup to prevent serving incomplete/broken dataset.\n"
                + "=" * 80 + "\n"
            )
            print(err_msg, file=sys.stderr, flush=True)
            raise RuntimeError(f"Dataset download failed for '{filename}': {err}") from err

    # Post-download verification
    if not is_data_complete(dest_dir):
        err_msg = (
            "\n" + "=" * 80 + "\n"
            "FATAL ERROR: Dataset post-download verification failed!\n"
            f"Not all required files were successfully downloaded to {dest_dir}.\n"
            + "=" * 80 + "\n"
        )
        print(err_msg, file=sys.stderr, flush=True)
        raise RuntimeError("Dataset verification failed: some files are missing or have mismatched sizes.")

    total_time = time.perf_counter() - start_total_time
    total_mb = downloaded_bytes / (1024 * 1024)
    print("=" * 80, flush=True)
    print(
        f"Fetch Complete: {skipped_count} verified/skipped, {downloaded_count} downloaded "
        f"({total_mb:.2f} MB) in {total_time:.1f}s.",
        flush=True
    )
    print("Dataset verification passed: all files ready for inference.", flush=True)
    print("=" * 80, flush=True)


def is_v6_complete(dest_dir: str = V6_DIR) -> bool:
    """Check if all required v6 model files exist in dest_dir with exact expected byte sizes."""
    if not os.path.isdir(dest_dir):
        return False
    for filename, expected_size in V6_KNOWN_SIZES.items():
        filepath = os.path.join(dest_dir, filename)
        if not os.path.exists(filepath):
            return False
        if os.path.getsize(filepath) != expected_size:
            return False
    return True


def fetch_v6_data(dest_dir: str = V6_DIR, force: bool = False, repo_id: Optional[str] = None) -> None:
    """
    Downloads and verifies the 14-year v6 model assets from Hugging Face.
    Idempotently unpacks into unpacked/ once downloaded.
    """
    target_repo = repo_id or os.environ.get("HF_DATASET_REPO_ID", REPO_ID)
    os.makedirs(dest_dir, exist_ok=True)

    hf_token = os.environ.get("HF_TOKEN")
    if hf_token and not hf_token.strip():
        hf_token = None

    print("=" * 80, flush=True)
    print("  OceanEmbed — 14-Year Model (v6_satswap_anom_14yr) Fetcher & Unpacker", flush=True)
    print(f"  Repository:  {target_repo} (dataset)", flush=True)
    print(f"  Destination: {dest_dir}", flush=True)
    print("=" * 80, flush=True)

    if not force and is_v6_complete(dest_dir):
        total_mb = sum(V6_KNOWN_SIZES.values()) / (1024 * 1024)
        print(f"[PASS] All {len(V6_REQUIRED_FILES)} v6 model files exist locally ({total_mb:.2f} MB).", flush=True)
    else:
        for idx, filename in enumerate(V6_REQUIRED_FILES, start=1):
            target_path = os.path.join(dest_dir, filename)
            expected_size = V6_KNOWN_SIZES.get(filename)

            if os.path.exists(target_path):
                local_size = os.path.getsize(target_path)
                if expected_size is not None and local_size == expected_size:
                    print(f"[{idx}/{len(V6_REQUIRED_FILES)}] SKIP: {filename} exists with matching size ({local_size:,} bytes).", flush=True)
                    continue

            # Try to download from repo root or v6_satswap_anom_14yr/
            print(f"[{idx}/{len(V6_REQUIRED_FILES)}] DOWNLOADING: {filename}...", flush=True)
            t0 = time.perf_counter()
            try:
                hf_hub_download(
                    repo_id=target_repo,
                    filename=f"v6_satswap_anom_14yr/{filename}",
                    repo_type="dataset",
                    local_dir=dest_dir,
                    token=hf_token,
                )
                # Move file up if it downloaded into nested subfolder
                nested = os.path.join(dest_dir, "v6_satswap_anom_14yr", filename)
                if os.path.exists(nested) and not os.path.exists(target_path):
                    import shutil
                    shutil.move(nested, target_path)
            except Exception:
                # Fallback to downloading from repo root
                hf_hub_download(
                    repo_id=target_repo,
                    filename=filename,
                    repo_type="dataset",
                    local_dir=dest_dir,
                    token=hf_token,
                )
            elapsed = time.perf_counter() - t0
            actual_size = os.path.getsize(target_path)
            print(f"[{idx}/{len(V6_REQUIRED_FILES)}] [PASS] DONE: {filename} ({actual_size/(1024*1024):.2f} MB) in {elapsed:.1f}s", flush=True)

    # Ensure files are unpacked
    ensure_v6_unpacked(dest_dir)


def ensure_data_ready(dest_dir: str = DATA_DIR) -> bool:
    """
    Guarantees the float16 dataset AND 14-year v6 model assets are present,
    verified, and unpacked before server start.
    """
    if not is_data_complete(dest_dir):
        fetch_all_data(dest_dir=dest_dir)
    if not is_v6_complete(V6_DIR) or not is_v6_unpacked(V6_DIR):
        fetch_v6_data(dest_dir=V6_DIR)
    return is_data_complete(dest_dir) and is_v6_unpacked(V6_DIR)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Fetch OceanEmbed dataset files")
    parser.add_argument("--v6-only", action="store_true", help="Only download 14-year v6 model assets")
    parser.add_argument("--float16-only", action="store_true", help="Only download float16 dataset files")
    parser.add_argument("--force", action="store_true", help="Force re-download even if files exist")
    args = parser.parse_args()

    try:
        if args.v6_only:
            fetch_v6_data(force=args.force)
        elif args.float16_only:
            fetch_all_data(force=args.force)
        else:
            # Prioritize v6 model assets so the active model is unpacked and ready immediately
            fetch_v6_data(force=args.force)
            fetch_all_data(force=args.force)
    except Exception as e:
        print(f"Dataset fetch terminated with error: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
