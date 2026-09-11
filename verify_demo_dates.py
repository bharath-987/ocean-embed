import os
import sys
import subprocess
import json

dates = ["2021-02-14", "2022-07-02", "2021-02-16", "2023-09-04"]
lat = 15.0
lon = 70.0

worker_code = """
import os, sys, json
sys.path.insert(0, os.path.abspath('backend'))
from inference import predict_temperature_profile, STANDARD_DEPTHS

dates = json.loads(sys.argv[1])
lat = float(sys.argv[2])
lon = float(sys.argv[3])

res = {}
for d in dates:
    res[d] = predict_temperature_profile(lat, lon, d)

print('__JSON_START__' + json.dumps(res))
"""

def run_mode(use_trimmed: bool):
    env = os.environ.copy()
    env["USE_TRIMMED_DATA"] = "true" if use_trimmed else "false"
    proc = subprocess.run(
        [sys.executable, "-c", worker_code, json.dumps(dates), str(lat), str(lon)],
        env=env,
        capture_output=True,
        text=True,
        check=True
    )
    json_part = proc.stdout.split("__JSON_START__")[1]
    return json.loads(json_part)

untrimmed_res = run_mode(False)
trimmed_res = run_mode(True)

all_pass = True
depths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]

print("=" * 90)
print(f"  PARITY VERIFICATION: DEMO_PREWARM_DATES at ({lat}N, {lon}E)")
print("=" * 90)

for d in dates:
    prof_untrimmed = untrimmed_res[d]
    prof_trimmed = trimmed_res[d]
    
    # Check bit-identical match
    is_match = (prof_untrimmed == prof_trimmed)
    status = "PASS" if is_match else "FAIL"
    if not is_match:
        all_pass = False
        
    print(f"\n>>> DATE: {d} | STATUS: {status}")
    print("-" * 90)
    print(f"{'Depth (m)':>10} | {'Untrimmed (°C)':>16} | {'Trimmed (°C)':>16} | {'Delta (°C)':>12} | {'Bit-Identical':>15}")
    print("-" * 90)
    for depth in depths:
        u_val = prof_untrimmed.get(str(depth), prof_untrimmed.get(depth))
        t_val = prof_trimmed.get(str(depth), prof_trimmed.get(depth))
        delta = round(t_val - u_val, 6) if (u_val is not None and t_val is not None) else None
        bit_id = "YES" if u_val == t_val else "NO"
        print(f"{depth:>10} | {u_val:>16.2f} | {t_val:>16.2f} | {delta:>12.6f} | {bit_id:>15}")
    print(f"Full Untrimmed: {prof_untrimmed}")
    print(f"Full Trimmed:   {prof_trimmed}")
    print(f"Date {d} Result: {status}")

print("\n" + "=" * 90)
print(f"OVERALL STATUS: {'ALL 4 DATES PASSED (100% BIT-IDENTICAL)' if all_pass else 'FAIL'}")
print("=" * 90)
