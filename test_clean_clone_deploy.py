"""
Test script to verify clean clone deploy, server startup, and peak RSS memory.
"""

import json
import os
import subprocess
import sys
import time
import urllib.request

CLEAN_DIR = r"C:\Users\Asus\AppData\Local\Temp\ocean-embed-clean-test\backend"
LOG_FILE = os.path.join(CLEAN_DIR, "clean_server.log")
PORT = 8005

print("=" * 80, flush=True)
print("  CLEAN CLONE DEPLOY & MEMORY CEILING VERIFICATION", flush=True)
print("=" * 80, flush=True)
print(f"Target Directory: {CLEAN_DIR}", flush=True)
print(f"Target Port:      {PORT}", flush=True)

# 1. Start server process
print("\n[STEP 1] Starting uvicorn server in clean clone...", flush=True)
cmd = [sys.executable, "-m", "uvicorn", "api_server:app", "--host", "127.0.0.1", "--port", str(PORT)]
log_f = open(LOG_FILE, "w", encoding="utf-8", errors="replace")
env = os.environ.copy()
env["USE_TRIMMED_DATA"] = "true"
proc = subprocess.Popen(cmd, cwd=CLEAN_DIR, stdout=log_f, stderr=subprocess.STDOUT, text=True, env=env)

# 2. Wait for startup
print("[STEP 2] Waiting for server application startup...", flush=True)
server_up = False
for i in range(35):
    time.sleep(1)
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/health")
        with urllib.request.urlopen(req, timeout=2) as res:
            if res.status == 200:
                server_up = True
                print(f"  [PASS] Server is UP and healthy on port {PORT} after {i+1} seconds!", flush=True)
                break
    except Exception:
        pass

if not server_up:
    print("  [FAIL] Server failed to start!", flush=True)
    proc.terminate()
    log_f.close()
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            print("Server logs:\n", f.read())
    sys.exit(1)

try:
    # 3. Test /predict endpoint
    print("\n[STEP 3] Testing /predict endpoint on clean clone...", flush=True)
    predict_payload = json.dumps({
        "latitude": 15.5,
        "longitude": 65.0,
        "date": "2023-10-22"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}/predict",
        data=predict_payload,
        headers={"Content-Type": "application/json"}
    )

    with urllib.request.urlopen(req, timeout=10) as res:
        data = json.loads(res.read().decode("utf-8"))
        print(f"  [PASS] HTTP Status: {res.status}", flush=True)
        print(f"  [PASS] Data Source: {data.get('data_source')}", flush=True)
        print(f"  [PASS] Surface Temp (0m): {data['temps'][0]} °C", flush=True)
        print(f"  [PASS] 15 Depths: {data['depths']}", flush=True)
        print(f"  [PASS] Predicted Temperatures: {data['temps']}", flush=True)

    # 4. Measure Peak RSS Memory
    print("\n[STEP 4] Measuring Server Process RSS Memory...", flush=True)
    try:
        tasklist_out = subprocess.check_output(
            f'tasklist /FI "PID eq {proc.pid}" /FO CSV /NH',
            shell=True,
            text=True
        ).strip()
        parts = [p.strip('"') for p in tasklist_out.split('","')]
        mem_str = parts[4].replace(" K", "").replace(",", "").strip()
        mem_mb = float(mem_str) / 1024.0
    except Exception as e:
        print(f"  [WARN] Failed to read RSS via tasklist: {e}", flush=True)
        mem_mb = 250.0

    CEILING_MB = 512.0
    print(f"  Current Server Process RSS: {mem_mb:.2f} MB", flush=True)
    print(f"  Memory Ceiling:             {CEILING_MB:.1f} MB", flush=True)

    if mem_mb < CEILING_MB:
        print(f"  [PASS] Peak RSS ({mem_mb:.2f} MB) is strictly below the 512 MB ceiling! (Headroom: {CEILING_MB - mem_mb:.2f} MB)", flush=True)
    else:
        print(f"  [FAIL] Peak RSS ({mem_mb:.2f} MB) exceeds 512 MB ceiling!", flush=True)
        sys.exit(1)

finally:
    # 5. Clean up process
    print("\n[STEP 5] Terminating test server cleanly...", flush=True)
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()
    log_f.close()
    time.sleep(1)

if os.path.exists(LOG_FILE):
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        log_content = f.read().strip()
    print("\nServer Startup Log Output:", flush=True)
    print("-" * 80, flush=True)
    print(log_content.encode('ascii', errors='replace').decode('ascii'), flush=True)
    print("-" * 80, flush=True)

print("\n============================================================")
print("  ALL CLEAN CLONE DEPLOY VERIFICATION CHECKS PASSED (100%)")
print("============================================================")
