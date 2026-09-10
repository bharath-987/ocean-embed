import os
import sys
import time
import json
import hashlib
import random
import datetime

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
sys.path.append(BACKEND_DIR)

import torch
from inference import predict_temperature_profile, STANDARD_DEPTHS, CHECKPOINT_PATH, _target_lats, _target_lons, _sst_arr

def print_separator(title):
    print("=" * 70)
    print(f" {title}")
    print("=" * 70)

def main():
    # ---------------------------------------------------------
    # 1. DETERMINISM CHECK
    # ---------------------------------------------------------
    print_separator("1. DETERMINISM CHECK")
    lat1, lon1, date1 = 17.947, 92.594, "2021-02-14"
    run1 = predict_temperature_profile(lat1, lon1, date1)
    run2 = predict_temperature_profile(lat1, lon1, date1)
    
    print(f"Inputs: lat={lat1}, lon={lon1}, date='{date1}'")
    print(f"\nRun 1 Output:\n{run1}")
    print(f"\nRun 2 Output:\n{run2}")
    
    is_identical = (run1 == run2)
    print(f"\nOutputs Identical: {is_identical}")

    # ---------------------------------------------------------
    # 2. SENSITIVITY CHECK
    # ---------------------------------------------------------
    print_separator("2. SENSITIVITY CHECK")
    argo_path = os.path.join(BACKEND_DIR, "data", "argo_profiles.json")
    with open(argo_path, "r") as f:
        argo_data = json.load(f)
    
    target_float_ids = [2902282, 2902769, 2901896, 2902205]
    floats = []
    for fid in target_float_ids:
        for p in argo_data["profiles"]:
            if p.get("wmoFloatId") == fid:
                floats.append(p)
                break

    predictions = {}
    for f in floats:
        fid = f["wmoFloatId"]
        cycle = f["cycleNumber"]
        flat = f["latitude"]
        flon = f["longitude"]
        fdate = f["date"]
        pred = predict_temperature_profile(flat, flon, fdate)
        # Array of predicted temperatures across STANDARD_DEPTHS
        pred_arr = [pred.get(d) for d in STANDARD_DEPTHS]
        predictions[fid] = {
            "meta": f"Float {fid} (Cycle {cycle}) at ({flat}, {flon}) on {fdate}",
            "dict": pred,
            "arr": pred_arr,
            "argo_arr": f["temperatures"]
        }
        print(f"\n{predictions[fid]['meta']}:")
        print(f"Predicted Temperatures (15 depths: {STANDARD_DEPTHS}):")
        print(pred_arr)

    # ---------------------------------------------------------
    # 3. NOT-COPYING-GROUND-TRUTH CHECK
    # ---------------------------------------------------------
    print_separator("3. NOT-COPYING-GROUND-TRUTH CHECK")
    for fid, data in predictions.items():
        print(f"\n{data['meta']}:")
        print(f"{'Depth (m)':<10} | {'AI Model (°C)':<15} | {'ARGO Ground Truth (°C)':<22} | {'Diff (°C)':<10}")
        print("-" * 65)
        ai_arr = data["arr"]
        argo_arr = data["argo_arr"]
        for d, ai_t, argo_t in zip(STANDARD_DEPTHS, ai_arr, argo_arr):
            diff = round(ai_t - argo_t, 2) if ai_t is not None and argo_t is not None else None
            print(f"{d:<10} | {str(ai_t):<15} | {str(argo_t):<22} | {str(diff):<10}")
        
        is_verbatim = (ai_arr == argo_arr)
        print(f"Bit-identical to ARGO ground truth: {is_verbatim}")

    # ---------------------------------------------------------
    # 4. LATENCY CHECK
    # ---------------------------------------------------------
    print_separator("4. LATENCY CHECK")
    print("Testing 10 consecutive calls with random valid ocean coordinates/dates (5-30N, 45-105E, 2021-2023)...")
    
    # Generate 10 valid random calls that fall in the ocean
    valid_test_cases = []
    random.seed(42)
    start_date = datetime.date(2021, 1, 15)
    end_date = datetime.date(2023, 12, 20)
    days_range = (end_date - start_date).days
    
    while len(valid_test_cases) < 10:
        rlat = round(random.uniform(6.0, 24.0), 3)
        rlon = round(random.uniform(55.0, 95.0), 3)
        rdate = str(start_date + datetime.timedelta(days=random.randint(0, days_range)))
        
        # Check if sst data is available (ocean)
        day_idx = (datetime.date.fromisoformat(rdate) - datetime.date(2021, 1, 1)).days
        lat_idx = int(abs(_target_lats - rlat).argmin())
        lon_idx = int(abs(_target_lons - rlon).argmin())
        if _sst_arr[day_idx, lat_idx, lon_idx] > 10.0:
            valid_test_cases.append((rlat, rlon, rdate))
    
    latencies_ms = []
    for i, (t_lat, t_lon, t_date) in enumerate(valid_test_cases):
        t0 = time.perf_counter()
        res = predict_temperature_profile(t_lat, t_lon, t_date)
        t1 = time.perf_counter()
        dur_ms = (t1 - t0) * 1000.0
        latencies_ms.append(dur_ms)
        print(f"Call {i+1:2d}: ({t_lat:6.3f}N, {t_lon:6.3f}E, {t_date}) -> Time: {dur_ms:6.2f} ms | Surface: {res.get(0)}°C, 1000m: {res.get(1000)}°C")

    avg_latency = sum(latencies_ms) / len(latencies_ms)
    min_latency = min(latencies_ms)
    max_latency = max(latencies_ms)
    print(f"\nAverage latency: {avg_latency:.2f} ms (Min: {min_latency:.2f} ms, Max: {max_latency:.2f} ms)")

    # ---------------------------------------------------------
    # 5. MODEL FILE CHECK
    # ---------------------------------------------------------
    print_separator("5. MODEL FILE CHECK")
    ckpt_path = CHECKPOINT_PATH
    stat_info = os.stat(ckpt_path)
    file_size_bytes = stat_info.st_size
    file_size_mb = file_size_bytes / (1024 * 1024)
    mod_time = datetime.datetime.fromtimestamp(stat_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S")

    sha256 = hashlib.sha256()
    with open(ckpt_path, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    checksum = sha256.hexdigest()

    checkpoint_data = torch.load(ckpt_path, map_location="cpu")
    # If checkpoint is a state_dict or dict containing state_dict
    if isinstance(checkpoint_data, dict):
        if "state_dict" in checkpoint_data:
            state_dict = checkpoint_data["state_dict"]
        else:
            state_dict = checkpoint_data
    else:
        state_dict = checkpoint_data.state_dict()

    total_params = sum(p.numel() for p in state_dict.values())
    
    print(f"File Path: {ckpt_path}")
    print(f"File Size: {file_size_bytes:,} bytes ({file_size_mb:.2f} MB)")
    print(f"Last Modified: {mod_time}")
    print(f"SHA-256 Checksum: {checksum}")
    print(f"Total Parameters in state_dict: {total_params:,}")
    print("\nLayer parameter breakdown:")
    for k, v in state_dict.items():
        print(f"  {k:<35} shape: {str(list(v.shape)):<20} params: {v.numel():,}")

if __name__ == "__main__":
    main()
