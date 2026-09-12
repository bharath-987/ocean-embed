"""
Automated Verification Suite for USE_FULL_FLOAT16_DATA Migration
Verifies:
1. USE_FULL_FLOAT16_DATA mode activates continuous 1095-day dataset without day_index_map.
2. A date in January 2021 (with valid lookback) works across /predict, /temperature-grid, /parameter-grid.
3. A date in December 2023 (and end-of-year 2023-12-31) works across all endpoints.
4. Dates before 2021-01-01, after 2023-12-31, or lacking 10-day lookback return clean HTTP 400.
5. ARGO comparisons for dates across 2021 (including dates previously out-of-cache) work cleanly.
6. Bounds checks prevent any IndexError or OOM.
7. USE_TRIMMED_DATA mode is completely unaffected, independent, and passes all tests.
"""

import json
import os
import subprocess
import sys

def run_test_case(name, code, env_vars):
    print(f"\n{'='*70}\n[TEST] {name}\n{'='*70}")
    env = os.environ.copy()
    env.update(env_vars)
    # Ensure sys.path includes backend
    runner_code = f"""
import sys, os
sys.path.insert(0, os.path.abspath('backend'))
{code}
"""
    proc = subprocess.run(
        [sys.executable, "-c", runner_code],
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(f"[FAIL] {name}")
        print("STDOUT:\n", proc.stdout)
        print("STDERR:\n", proc.stderr)
        return False
    else:
        print(proc.stdout.strip())
        print(f"[PASS] {name}")
        return True


FLOAT16_TEST_SCRIPT = """
from starlette.testclient import TestClient
import api_server
import inference as inf

client = TestClient(api_server.app)

# 1. Config assertions
assert inf.USE_FULL_FLOAT16_DATA is True, "USE_FULL_FLOAT16_DATA should be True"
assert inf.USE_TRIMMED_DATA is False, "USE_TRIMMED_DATA should be False"
assert inf._day_index_map is None, "_day_index_map should be None in full mode"
assert inf._total_days == 1095, f"_total_days should be 1095, got {inf._total_days}"
assert inf.translate_day_idx(0) == 0, "translate_day_idx(0) should be 0"
assert inf.translate_day_idx(1094) == 1094, "translate_day_idx(1094) should be 1094"
assert inf.translate_day_idx(1095) is None, "translate_day_idx(1095) should be None"
assert inf.translate_day_idx(-1) is None, "translate_day_idx(-1) should be None"

health_res = client.get("/health")
assert health_res.status_code == 200, f"/health status {health_res.status_code}"
health_data = health_res.json()
assert health_data["trimmed"] is False, "trimmed should be False in health"
assert health_data["full_float16"] is True, "full_float16 should be True in health"
print("[PASS] Config & Health verified: full_float16=True, trimmed=False, total_days=1095")

# 2. Date in January 2021 (e.g. 2021-01-15, day 14)
jan_date = "2021-01-15"
pred_res = client.post("/predict", json={"latitude": 15.5, "longitude": 65.0, "date": jan_date})
assert pred_res.status_code == 200, f"/predict {jan_date} failed: {pred_res.text}"
pred_data = pred_res.json()
assert len(pred_data["temps"]) == 15, "temps should have 15 values"
assert 20.0 <= pred_data["temps"][0] <= 34.0, f"SST out of range: {pred_data['temps'][0]}"
print(f"[PASS] January 2021 prediction ({jan_date}): SST={pred_data['temps'][0]}°C, 200m={pred_data['temps'][10]}°C")

temp_grid_res = client.get(f"/temperature-grid?date={jan_date}&depth=200")
assert temp_grid_res.status_code == 200, f"/temperature-grid {jan_date} failed: {temp_grid_res.text}"
print(f"[PASS] January 2021 temperature-grid ({jan_date}, 200m): OK")

param_grid_res = client.get(f"/parameter-grid?param=sst&date={jan_date}")
assert param_grid_res.status_code == 200, f"/parameter-grid {jan_date} failed: {param_grid_res.text}"
print(f"[PASS] January 2021 parameter-grid ({jan_date}, sst): OK")

# 3. Date in December 2023 (e.g. 2023-12-15, and boundary 2023-12-31)
for dec_date in ["2023-12-15", "2023-12-31"]:
    p_res = client.post("/predict", json={"latitude": 15.5, "longitude": 65.0, "date": dec_date})
    assert p_res.status_code == 200, f"/predict {dec_date} failed: {p_res.text}"
    p_data = p_res.json()
    assert len(p_data["temps"]) == 15
    print(f"[PASS] December 2023 prediction ({dec_date}): SST={p_data['temps'][0]}°C, 200m={p_data['temps'][10]}°C")

tg_dec = client.get(f"/temperature-grid?date=2023-12-31&depth=0")
assert tg_dec.status_code == 200
pg_dec = client.get(f"/parameter-grid?param=ssh&date=2023-12-31")
assert pg_dec.status_code == 200
print("[PASS] December 31, 2023 (dataset upper boundary): All endpoints 200 OK")

# 4. Out of range / invalid dates return clean 400
bad_dates = [
    ("2020-12-31", "pre-dataset"),
    ("2024-01-01", "post-dataset boundary"),
    ("2024-05-15", "far future"),
    ("2021-01-05", "missing 10-day lookback"),
]

for b_date, label in bad_dates:
    r = client.post("/predict", json={"latitude": 15.5, "longitude": 65.0, "date": b_date})
    assert r.status_code == 400, f"Expected 400 for {b_date} ({label}), got {r.status_code}"
    assert r.json()["detail"] == "This date is not available in the deployed demo dataset.", f"Detail mismatch: {r.json()}"
    print(f"[PASS] Out-of-range date {b_date} ({label}) -> clean HTTP 400")

# Note: for parameter-grid (surface 2D only, no history needed), 2021-01-05 has day_idx=4 >= 0, so 200 OK
pg_day4 = client.get("/parameter-grid?param=sst&date=2021-01-05")
assert pg_day4.status_code == 200, "parameter-grid with day_idx=4 should be 200 OK"
# But 2020-12-31 is day_idx = -1 < 0 -> 400
pg_pre = client.get("/parameter-grid?param=sst&date=2020-12-31")
assert pg_pre.status_code == 400, "parameter-grid before 2021-01-01 should be 400"
# And 2024-01-01 is day_idx = 1095 >= 1095 -> 400
pg_post = client.get("/parameter-grid?param=sst&date=2024-01-01")
assert pg_post.status_code == 400, "parameter-grid after 2023-12-31 should be 400"
print("[PASS] Parameter-grid boundary date validation verified (2021-01-01 to 2023-12-31)")

# 5. ARGO comparisons for dates outside original trimmed clusters
# Float 2902278 Cycle 144 was 2021-05-14 (previously unavailable in trimmed 65-day set)
argo_res = client.get("/argo/compare?id=2902278_144")
assert argo_res.status_code == 200, f"ARGO compare 2902278_144 failed: {argo_res.text}"
argo_data = argo_res.json()
assert argo_data["profile"]["date"] == "2021-05-14"
assert "rmse" in argo_data["metrics"]
print(f"[PASS] ARGO Float comparison on 2021-05-14 (Cycle 144): RMSE={argo_data['metrics']['rmse']}°C")

print("\\n>>> ALL USE_FULL_FLOAT16_DATA TESTS PASSED! <<<")
"""

TRIMMED_TEST_SCRIPT = """
from starlette.testclient import TestClient
import api_server
import inference as inf

client = TestClient(api_server.app)

# 1. Config assertions
assert inf.USE_TRIMMED_DATA is True, "USE_TRIMMED_DATA should be True"
assert inf.USE_FULL_FLOAT16_DATA is False, "USE_FULL_FLOAT16_DATA should be False"
assert inf._day_index_map is not None, "_day_index_map should exist in trimmed mode"
assert len(inf._day_index_map) == 65, f"_day_index_map should have 65 entries, got {len(inf._day_index_map)}"

health_res = client.get("/health")
assert health_res.status_code == 200
assert health_res.json()["trimmed"] is True
assert health_res.json()["full_float16"] is False
print("[PASS] Config & Health verified: trimmed=True, full_float16=False, map_len=65")

# 2. Demo prewarm dates work (2021-02-14, 2022-07-02, 2021-02-16, 2023-09-04)
for demo_date in ["2021-02-14", "2022-07-02", "2021-02-16", "2023-09-04"]:
    r = client.post("/predict", json={"latitude": 15.5, "longitude": 65.0, "date": demo_date})
    assert r.status_code == 200, f"Trimmed demo date {demo_date} failed: {r.text}"
    print(f"[PASS] Trimmed demo date {demo_date} -> 200 OK (SST: {r.json()['temps'][0]}°C)")

# 3. Out-of-cache date (2021-02-26, 2023-06-15) cleanly returns 400
for unsupp_date in ["2021-02-26", "2023-06-15"]:
    r = client.post("/predict", json={"latitude": 15.5, "longitude": 65.0, "date": unsupp_date})
    assert r.status_code == 400, f"Expected 400 for {unsupp_date}, got {r.status_code}"
    assert r.json()["detail"] == "This date is not available in the deployed demo dataset."
    print(f"[PASS] Unsupported trimmed date {unsupp_date} -> clean HTTP 400")

# 4. Instant worker recovery test: bad date -> good date
for i in range(3):
    r_bad = client.post("/predict", json={"latitude": 15.5, "longitude": 65.0, "date": "2021-02-26"})
    assert r_bad.status_code == 400
    r_good = client.post("/predict", json={"latitude": 15.5, "longitude": 65.0, "date": "2022-07-02"})
    assert r_good.status_code == 200
print("[PASS] Worker recovery (bad date -> good date) 3 cycles verified with 100% success")

print("\\n>>> ALL USE_TRIMMED_DATA REGRESSION TESTS PASSED! <<<")
"""

def main():
    success = True
    # Test 1: USE_FULL_FLOAT16_DATA=true
    ok1 = run_test_case(
        "USE_FULL_FLOAT16_DATA Mode (Continuous 1095 Days, 2021-2023)",
        FLOAT16_TEST_SCRIPT,
        {"USE_FULL_FLOAT16_DATA": "true", "USE_TRIMMED_DATA": "false"},
    )
    if not ok1:
        success = False

    # Test 2: USE_TRIMMED_DATA=true
    ok2 = run_test_case(
        "USE_TRIMMED_DATA Mode (65-day Trimmed Demo Set Regression)",
        TRIMMED_TEST_SCRIPT,
        {"USE_TRIMMED_DATA": "true", "USE_FULL_FLOAT16_DATA": "false"},
    )
    if not ok2:
        success = False

    if success:
        print("\n" + "=" * 70)
        print("  ALL VERIFICATION SUITES COMPLETED WITH 100% SUCCESS!")
        print("=" * 70)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
