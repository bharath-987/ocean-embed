"""
OceanEmbed — Hugging Face Dataset Fetcher & Deployment Asset Manager
===================================================================
Manages downloading, local caching, and unpacking of all large binary assets:
  - 14-Year V6 Model Assets (unpacked into field, products, embeddings)
  - Core float16 Satellite + Climatology Arrays
  - Model Checkpoint (model_v6_satswap_anom_best.pt)
  - Fisheries Mode Assets (chla.npy, chl_source.npy, pfz_land_mask.npy)
  - Heatwave Depth Check Assets (heatwave_depth_2023.npz, mhw_sst_2010_2023.npz)

Features:
  - Prioritizes local cache: skips downloading if file exists and is non-empty.
  - Supports custom download URLs via environment variables for Render deployment.
  - Falls back to Hugging Face dataset repository (bharath-987/ocean-embed-data).
  - Atomic downloads using .tmp files to avoid partial or corrupted files.
"""

from __future__ import annotations

import os
import shutil
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

try:
    from huggingface_hub import HfApi, hf_hub_download
except ImportError:
    HfApi = None
    hf_hub_download = None

REPO_ID = os.environ.get("HF_DATASET_REPO_ID") or os.environ.get("HF_REPO_ID", "bharath-987/ocean-embed-data")
HF_BASE_URL = os.environ.get(
    "HF_BASE_URL",
    f"https://huggingface.co/datasets/{REPO_ID}/resolve/main"
)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data", "float16"))

# Default active model directory (fine-tuned 14-year model)
DEFAULT_V6_DIR = os.path.join(BASE_DIR, "data", "v6_satswap_anom_14yr_argoft_seed1")
if not os.path.exists(DEFAULT_V6_DIR):
    # Fallback to non-fine-tuned folder if seed1 not present
    alt = os.path.join(BASE_DIR, "data", "v6_satswap_anom_14yr")
    if os.path.exists(alt):
        DEFAULT_V6_DIR = alt
V6_DIR = os.environ.get("V6_DIR", DEFAULT_V6_DIR)

HEATWAVE_DEPTH_DIR = os.environ.get(
    "KYOGRE_HEATWAVE_DIR",
    os.path.join(BASE_DIR, "data", "heatwave_depth")
)

# Expected float16 dataset files (full 2021-2023 window)
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

# Trimmed cluster dataset files (lightweight demo window)
TRIMMED_SIZES: Dict[str, int] = {
    "ssh_anom.npy": 6328788,
    "sss_anom.npy": 6328788,
    "sst.npy": 6328788,
    "sst_anom.npy": 6328788,
    "temp_target_clim.npy": 94930028,
    "u_cur_anom.npy": 6328788,
    "u_wind_anom.npy": 6328788,
    "v_cur_anom.npy": 6328788,
    "v_wind_anom.npy": 6328788,
}

V6_KNOWN_SIZES: Dict[str, int] = {
    "correction_v6_satswap_anom_14yr_argoft_seed1.json": 1147,
    "bands_v6_satswap_anom_14yr_argoft_seed1.json": 7580,
    "v6_satswap_anom_14yr_argoft_seed1.bundle.npz": 10268423,
    "products_v6_satswap_anom_14yr_argoft_seed1_2023-01-01_2023-12-31.npz": 22863915,
    "field_v6_satswap_anom_14yr_argoft_seed1_2023-01-01_2023-12-31.npz": 68477680,
    "embeddings_v6_satswap_anom_14yr_argoft_seed1_2023-01-01_2023-12-31.npz": 129934050,
}


def _download_http_stream(url: str, target_path: str, token: Optional[str] = None) -> None:
    """Streams a remote URL into target_path using a temporary file with progress logging."""
    tmp_path = target_path + ".tmp"
    headers = {"User-Agent": "Kyogre-OceanEmbed/1.0"}
    if token and "huggingface.co" in url:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=300) as response, open(tmp_path, "wb") as out_file:
        chunk_size = 1024 * 1024  # 1MB chunks
        total_bytes = 0
        while True:
            chunk = response.read(chunk_size)
            if not chunk:
                break
            out_file.write(chunk)
            total_bytes += len(chunk)

    elapsed = max(0.001, time.perf_counter() - t0)
    os.replace(tmp_path, target_path)
    mb = total_bytes / (1024 * 1024)
    speed = mb / elapsed
    print(
        f"[CACHE] [PASS] Downloaded {os.path.basename(target_path)} ({mb:.2f} MB) in {elapsed:.1f}s ({speed:.1f} MB/s)",
        flush=True
    )


def download_file_cached(
    target_path: str,
    env_url_var: Optional[str] = None,
    hf_filename: Optional[str] = None,
    expected_size: Optional[int] = None,
    repo_id: Optional[str] = None,
) -> str:
    """
    Guarantees target_path exists locally.
    1. If target_path exists and is non-empty, skips download (local cache check).
    2. If missing, reads direct URL from env_url_var if set in os.environ.
    3. Otherwise, downloads from Hugging Face repository (via hf_hub_download or HTTP stream).
    """
    target_path = os.path.abspath(target_path)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)

    # 1. Local Cache Check
    if os.path.exists(target_path) and os.path.getsize(target_path) > 0:
        if expected_size is None or os.path.getsize(target_path) == expected_size:
            return target_path

    target_repo = repo_id or os.environ.get("HF_DATASET_REPO_ID") or os.environ.get("HF_REPO_ID", REPO_ID)
    hf_token = os.environ.get("HF_TOKEN")
    if hf_token and not hf_token.strip():
        hf_token = None

    # 2. Environment Variable URL Override
    url = os.environ.get(env_url_var) if env_url_var else None
    active_var = env_url_var
    if not url and env_url_var:
        alt_var = f"KYOGRE_{env_url_var}" if not env_url_var.startswith("KYOGRE_") else env_url_var[7:]
        url = os.environ.get(alt_var)
        if url:
            active_var = alt_var
    if url and url.strip():
        url = url.strip()
        print(f"[CACHE] Fetching {os.path.basename(target_path)} from {active_var} URL: {url}...", flush=True)
        try:
            _download_http_stream(url, target_path, token=hf_token)
            return target_path
        except Exception as e:
            print(f"[CACHE] Download from {env_url_var} failed: {e}. Trying Hugging Face fallback...", flush=True)

    # 3. Hugging Face Dataset Hub
    filename_to_fetch = hf_filename or os.path.basename(target_path)
    print(f"[CACHE] Downloading {filename_to_fetch} from Hugging Face dataset {target_repo}...", flush=True)

    if hf_hub_download is not None:
        try:
            downloaded = hf_hub_download(
                repo_id=target_repo,
                filename=filename_to_fetch,
                repo_type="dataset",
                local_dir=os.path.dirname(target_path),
                token=hf_token,
            )
            if downloaded != target_path and os.path.exists(downloaded):
                shutil.move(downloaded, target_path)
            return target_path
        except Exception as err:
            print(f"[CACHE] hf_hub_download failed ({err}). Trying direct HTTP stream...", flush=True)

    # 4. Direct HTTP Stream from HF resolve
    hf_direct_url = f"{HF_BASE_URL}/{filename_to_fetch}"
    _download_http_stream(hf_direct_url, target_path, token=hf_token)
    return target_path


def ensure_checkpoint(target_dir: Optional[str] = None) -> str:
    """Ensures model_v6_satswap_anom_best.pt exists locally."""
    dest = target_dir or BASE_DIR
    target = os.path.join(dest, "model_v6_satswap_anom_best.pt")
    return download_file_cached(
        target_path=target,
        env_url_var="CHECKPOINT_URL",
        hf_filename="model_v6_satswap_anom_best.pt",
    )


def ensure_fisheries_assets(target_dir: Optional[str] = None) -> Dict[str, str]:
    """Ensures chlorophyll and PFZ assets exist locally."""
    dest = target_dir or os.path.join(BASE_DIR, "data")
    os.makedirs(dest, exist_ok=True)

    results = {}
    items = [
        ("chla.npy", "CHLA_URL", "chla.npy"),
        ("chl_source.npy", "CHL_SOURCE_URL", "chl_source.npy"),
        ("chla_monthly_clim.npy", "CHLA_CLIM_URL", "chla_monthly_clim.npy"),
        ("pfz_land_mask.npy", "PFZ_LAND_MASK_URL", "pfz_land_mask.npy"),
    ]
    for fname, env_var, hf_name in items:
        # Check in dest and dest/float16
        p1 = os.path.join(dest, fname)
        p2 = os.path.join(dest, "float16", fname)
        if os.path.exists(p1) and os.path.getsize(p1) > 0:
            results[fname] = p1
            continue
        if os.path.exists(p2) and os.path.getsize(p2) > 0:
            results[fname] = p2
            continue

        target_file = p1 if fname == "pfz_land_mask.npy" else p2
        try:
            results[fname] = download_file_cached(
                target_path=target_file,
                env_url_var=env_var,
                hf_filename=hf_name,
            )
        except Exception as e:
            print(f"[CACHE] Warning: could not download fisheries asset {fname}: {e}", flush=True)

    return results


def ensure_pfz_land_mask(target_dir: Optional[str] = None) -> str:
    """Ensures pfz_land_mask.npy exists in backend/data/."""
    dest = target_dir or os.path.join(BASE_DIR, "data")
    target = os.path.join(dest, "pfz_land_mask.npy")
    return download_file_cached(
        target_path=target,
        env_url_var="PFZ_LAND_MASK_URL",
        hf_filename="pfz_land_mask.npy",
    )


def ensure_heatwave_assets(target_dir: Optional[str] = None) -> Dict[str, str]:
    """Ensures mhw_sst_2010_2023.npz and heatwave_depth_2023.npz exist locally."""
    dest = target_dir or HEATWAVE_DEPTH_DIR
    os.makedirs(dest, exist_ok=True)

    results = {}
    items = [
        ("mhw_sst_2010_2023.npz", "MHW_SST_URL", "heatwave_depth/mhw_sst_2010_2023.npz"),
        ("heatwave_depth_2023.npz", "HEATWAVE_DEPTH_URL", "heatwave_depth/heatwave_depth_2023.npz"),
    ]
    for fname, env_var, hf_name in items:
        p = os.path.join(dest, fname)
        try:
            results[fname] = download_file_cached(
                target_path=p,
                env_url_var=env_var,
                hf_filename=hf_name,
            )
        except Exception as e:
            print(f"[CACHE] Warning: could not download heatwave asset {fname}: {e}", flush=True)

    return results


def is_v6_unpacked(v6_dir: str = V6_DIR) -> bool:
    """Check if v6 model unpacked folders (field, products, embeddings) exist with meta.json."""
    unpacked = os.path.join(v6_dir, "unpacked")
    for sub in ("field", "products", "embeddings"):
        meta = os.path.join(unpacked, sub, "meta.json")
        if not os.path.exists(meta):
            return False
    return True


def ensure_v6_unpacked(v6_dir: str = V6_DIR) -> None:
    """
    Idempotently unpacks v6 model .npz files into unpacked/ subdirectories.
    Dynamically maps field, products, and embeddings .npz files regardless of seed name.
    """
    if is_v6_unpacked(v6_dir):
        return

    sys.path.insert(0, str(v6_dir))
    try:
        import serving
    except ImportError as err:
        raise RuntimeError(f"Cannot import serving module from {v6_dir}: {err}") from err

    unpacked_dir = os.path.join(v6_dir, "unpacked")
    os.makedirs(unpacked_dir, exist_ok=True)

    if not os.path.exists(v6_dir):
        os.makedirs(v6_dir, exist_ok=True)

    files = os.listdir(v6_dir) if os.path.exists(v6_dir) else []
    field_file = next((f for f in files if f.startswith("field_") and f.endswith(".npz")), None)
    products_file = next((f for f in files if f.startswith("products_") and f.endswith(".npz")), None)
    embeddings_file = next((f for f in files if f.startswith("embeddings_") and f.endswith(".npz")), None)

    # If missing, attempt to download first
    if not (field_file and products_file and embeddings_file):
        ensure_v6_data(v6_dir)
        files = os.listdir(v6_dir)
        field_file = next((f for f in files if f.startswith("field_") and f.endswith(".npz")), None)
        products_file = next((f for f in files if f.startswith("products_") and f.endswith(".npz")), None)
        embeddings_file = next((f for f in files if f.startswith("embeddings_") and f.endswith(".npz")), None)

    mapping = [("field", field_file), ("products", products_file), ("embeddings", embeddings_file)]
    for sub, npz_name in mapping:
        if not npz_name:
            continue
        out_sub = os.path.join(unpacked_dir, sub)
        meta_file = os.path.join(out_sub, "meta.json")
        if os.path.exists(meta_file):
            continue

        npz_path = os.path.join(v6_dir, npz_name)
        if not os.path.exists(npz_path):
            continue

        print(f"[v6_adapter] Unpacking {npz_name} -> {out_sub}...", flush=True)
        serving.unpack(npz_path, out_sub)
        print(f"[v6_adapter] [PASS] Unpacked {sub} successfully.", flush=True)


def ensure_v6_data(dest_dir: str = V6_DIR) -> None:
    """Downloads and verifies the active v6 model assets from Hugging Face or env vars."""
    os.makedirs(dest_dir, exist_ok=True)

    # Active model assets
    items = [
        ("field_v6_satswap_anom_14yr_argoft_seed1_2023-01-01_2023-12-31.npz", "V6_FIELD_URL"),
        ("products_v6_satswap_anom_14yr_argoft_seed1_2023-01-01_2023-12-31.npz", "V6_PRODUCTS_URL"),
        ("embeddings_v6_satswap_anom_14yr_argoft_seed1_2023-01-01_2023-12-31.npz", "V6_EMBEDDINGS_URL"),
        ("v6_satswap_anom_14yr_argoft_seed1.bundle.npz", "V6_BUNDLE_URL"),
        ("correction_v6_satswap_anom_14yr_argoft_seed1.json", "V6_CORRECTION_URL"),
        ("bands_v6_satswap_anom_14yr_argoft_seed1.json", "V6_BANDS_URL"),
    ]

    for fname, env_var in items:
        p = os.path.join(dest_dir, fname)
        if os.path.exists(p) and os.path.getsize(p) > 0:
            continue
        try:
            download_file_cached(
                target_path=p,
                env_url_var=env_var,
                hf_filename=f"v6_satswap_anom_14yr_argoft_seed1/{fname}",
            )
        except Exception:
            # Fallback to repo root
            try:
                download_file_cached(
                    target_path=p,
                    env_url_var=env_var,
                    hf_filename=fname,
                )
            except Exception as e:
                print(f"[CACHE] Warning: could not download v6 asset {fname}: {e}", flush=True)


def is_data_complete(dest_dir: str = DATA_DIR) -> bool:
    """Check if all required input arrays exist in dest_dir."""
    if not os.path.isdir(dest_dir):
        return False
    for filename in KNOWN_SIZES:
        filepath = os.path.join(dest_dir, filename)
        if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
            return False
    return True


def fetch_all_data(dest_dir: str = DATA_DIR, force: bool = False, repo_id: Optional[str] = None) -> None:
    """Downloads all 9 core input arrays + day_index_map.json."""
    os.makedirs(dest_dir, exist_ok=True)
    if not force and is_data_complete(dest_dir):
        return

    items = [
        ("ssh_anom.npy", "SSH_ANOM_URL"),
        ("sss_anom.npy", "SSS_ANOM_URL"),
        ("sst.npy", "SST_URL"),
        ("sst_anom.npy", "SST_ANOM_URL"),
        ("temp_target_clim.npy", "TEMP_TARGET_CLIM_URL"),
        ("u_cur_anom.npy", "U_CUR_ANOM_URL"),
        ("u_wind_anom.npy", "U_WIND_ANOM_URL"),
        ("v_cur_anom.npy", "V_CUR_ANOM_URL"),
        ("v_wind_anom.npy", "V_WIND_ANOM_URL"),
        ("day_index_map.json", "DAY_INDEX_MAP_URL"),
    ]
    for fname, env_var in items:
        target = os.path.join(dest_dir, fname)
        download_file_cached(
            target_path=target,
            env_url_var=env_var,
            hf_filename=fname,
            repo_id=repo_id,
        )


def ensure_data_ready(dest_dir: str = DATA_DIR) -> bool:
    """Guarantees input dataset and active v6 model assets are downloaded and unpacked."""
    if not is_data_complete(dest_dir):
        fetch_all_data(dest_dir=dest_dir)
    ensure_v6_unpacked(V6_DIR)
    return is_data_complete(dest_dir) and is_v6_unpacked(V6_DIR)


def ensure_all_deployment_assets() -> None:
    """
    Verifies and caches every asset required by Kyogre for deployment:
    - Model Checkpoint
    - Fisheries assets (chlorophyll & pfz mask)
    - Heatwave depth assets
    - Active V6 14-year model assets (unpacked)
    - Core input arrays (if running in full float16 mode)
    """
    print("[DEPLOYMENT] Checking asset readiness...", flush=True)

    # 1. PFZ Land Mask
    try:
        ensure_pfz_land_mask()
    except Exception as e:
        print(f"[DEPLOYMENT] pfz_land_mask warning: {e}", flush=True)

    # 2. Fisheries Chlorophyll
    try:
        ensure_fisheries_assets()
    except Exception as e:
        print(f"[DEPLOYMENT] fisheries assets warning: {e}", flush=True)

    # 3. Heatwave Depth Assets
    try:
        ensure_heatwave_assets()
    except Exception as e:
        print(f"[DEPLOYMENT] heatwave assets warning: {e}", flush=True)

    # 4. V6 14-Year Model Assets
    try:
        ensure_v6_unpacked(V6_DIR)
    except Exception as e:
        print(f"[DEPLOYMENT] v6 unpacked warning: {e}", flush=True)

    # 5. Model Checkpoint
    try:
        ensure_checkpoint()
    except Exception as e:
        print(f"[DEPLOYMENT] checkpoint warning: {e}", flush=True)

    print("[DEPLOYMENT] Asset verification check completed.", flush=True)


if __name__ == "__main__":
    ensure_all_deployment_assets()
