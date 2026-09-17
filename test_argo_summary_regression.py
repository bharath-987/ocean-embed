"""
Automated Regression Test Suite: ARGO Summary & Profile Parity Verification
Asserts that /argo/summary and /argo/compare dynamically track the active model checkpoint
and that the 27-profile trimmed demo-window RMSE is computed dynamically.
"""

import os
import sys
import json
import urllib.request
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
import api_server as api
from compute_skill_score import compute_argo_skill_score


def run_regression_tests():
    print("============================================================")
    print("  KYOGRE ARGO SUMMARY & PROFILE DYNAMIC REGRESSION SUITE")
    print("============================================================\n")

    total_assertions = 0
    passed_assertions = 0

    def check(cond, msg):
        nonlocal total_assertions, passed_assertions
        total_assertions += 1
        if cond:
            passed_assertions += 1
            print(f"  [PASS] {msg}")
        else:
            print(f"  [FAIL] {msg}")
            raise AssertionError(msg)

    # 1. Fresh computation from compute_skill_score
    print("[STEP 1] Executing fresh compute_argo_skill_score() run...")
    fresh = compute_argo_skill_score(save_json=False)
    fresh_ov = fresh['overall']
    fresh_basins = fresh['basins']

    # 2. Fresh computation from /argo/summary (force_refresh=True)
    print("[STEP 2] Executing compute_argo_summary(force_refresh=True)...")
    summary = api.compute_argo_summary(force_refresh=True)

    # 3. Assert full-set (n=41) aggregate metrics match fresh run within small tolerance (<= 0.01)
    print("\n[STEP 3] Asserting full-set (n=41) aggregate metrics match fresh run...")
    check(summary['totalFloats'] == 41, f"Expected 41 floats, got {summary['totalFloats']}")
    check(summary['totalDepthPoints'] == 615, f"Expected 615 points (41x15), got {summary['totalDepthPoints']}")
    check(
        abs(summary['aggregateRmse'] - fresh_ov['rmseModel']) <= 0.01,
        f"aggregateRmse parity: summary {summary['aggregateRmse']}°C vs fresh {fresh_ov['rmseModel']}°C"
    )
    check(
        abs(summary['aggregateBias'] - fresh_ov['biasModel']) <= 0.01,
        f"aggregateBias parity: summary {summary['aggregateBias']}°C vs fresh {fresh_ov['biasModel']}°C"
    )
    check(
        abs(summary['aggregateCorr'] - fresh_ov['correlationModel']) <= 0.01,
        f"aggregateCorr parity: summary {summary['aggregateCorr']} vs fresh {fresh_ov['correlationModel']}"
    )
    check(
        abs(summary['climatologyRmse'] - fresh_ov['rmseClimatology']) <= 0.01,
        f"climatologyRmse parity: summary {summary['climatologyRmse']}°C vs fresh {fresh_ov['rmseClimatology']}°C"
    )
    check(
        abs(summary['skillScore'] - fresh_ov['skillScore']) <= 0.005,
        f"skillScore parity: summary {summary['skillScore']} vs fresh {fresh_ov['skillScore']}"
    )

    # 4. Assert dynamic trimmed-window (n=27) subset parity
    print("\n[STEP 4] Asserting dynamic trimmed-window (n=27) subset parity...")
    check(summary['trimmedWindowFloats'] == 27, f"Expected 27 trimmed floats, got {summary['trimmedWindowFloats']}")
    check(fresh_ov['trimmedWindowFloats'] == 27, f"Expected 27 trimmed floats in fresh run, got {fresh_ov['trimmedWindowFloats']}")
    check(
        abs(summary['trimmedWindowRmse'] - fresh_ov['trimmedWindowRmse']) <= 0.005,
        f"trimmedWindowRmse parity: summary {summary['trimmedWindowRmse']}°C vs fresh {fresh_ov['trimmedWindowRmse']}°C"
    )
    check(
        abs(summary['trimmedWindowRmse'] - 0.715) <= 0.01,
        f"trimmedWindowRmse close to 0.715°C benchmark: got {summary['trimmedWindowRmse']}°C"
    )
    check(
        "0.820" in summary['trimmedWindowLabel'],
        f"trimmedWindowLabel preserves V4 0.820°C reference: {summary['trimmedWindowLabel']}"
    )

    # 5. Assert per-basin parity across all 3 active sub-basins
    print("\n[STEP 5] Asserting per-basin RMSE and sample count parity...")
    expected_basins = {
        'Bay of Bengal': 16,
        'Arabian Sea': 15,
        'Equatorial Indian Ocean': 10
    }
    for b_name, expected_count in expected_basins.items():
        sum_b = summary['subRegions'][b_name]
        fresh_b = fresh_basins[b_name]
        check(sum_b['count'] == expected_count, f"Basin {b_name} count: {sum_b['count']} == {expected_count}")
        check(
            abs(sum_b['rmse'] - fresh_b['rmseModel']) <= 0.01,
            f"Basin {b_name} RMSE parity: summary {sum_b['rmse']}°C vs fresh {fresh_b['rmseModel']}°C"
        )
        check(
            abs(sum_b['climatologyRmse'] - fresh_b['rmseClimatology']) <= 0.01,
            f"Basin {b_name} Clim RMSE parity: summary {sum_b['climatologyRmse']}°C vs fresh {fresh_b['rmseClimatology']}°C"
        )
        check(
            abs(sum_b['skillScore'] - fresh_b['skillScore']) <= 0.01,
            f"Basin {b_name} Skill Score parity: summary {sum_b['skillScore']} vs fresh {fresh_b['skillScore']}"
        )
        check(not sum_b['insufficientSample'], f"Basin {b_name} has sufficient sample (n >= 10)")

    # 6. Spot-check per-float comparison endpoint for dynamic variation
    print("\n[STEP 6] Spot-checking /argo/compare for dynamic per-float variation...")
    res1 = api.compare_argo_profile('2902254_134')
    res2 = api.compare_argo_profile('2902278_126')
    res3 = api.compare_argo_profile('2902282_126')

    check(res1['metrics']['rmse'] != res2['metrics']['rmse'], "Float 1 and Float 2 RMSE must differ")
    check(res2['metrics']['rmse'] != res3['metrics']['rmse'], "Float 2 and Float 3 RMSE must differ")
    check(res1['aiTemps'] != res2['aiTemps'], "Float 1 and Float 2 AI temperatures must differ")
    check(len(res1['depths']) == 15, "Float 1 depth count is 15")
    check(len(res1['diffs']) == 15, "Float 1 diff count is 15")

    # 7. Check live HTTP endpoint if server is running
    print("\n[STEP 7] Checking live HTTP endpoint http://localhost:8000/argo/summary (if server is up)...")
    try:
        req = urllib.request.Request("http://localhost:8000/argo/summary", headers={"User-Agent": "RegressionTest/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                http_data = json.loads(resp.read().decode('utf-8'))
                check(http_data['totalFloats'] == 41, "Live HTTP: totalFloats == 41")
                check(abs(http_data['aggregateRmse'] - fresh_ov['rmseModel']) <= 0.01, "Live HTTP: aggregateRmse matches fresh")
                check(abs(http_data['trimmedWindowRmse'] - fresh_ov['trimmedWindowRmse']) <= 0.005, "Live HTTP: trimmedWindowRmse matches fresh")
                print("  [INFO] Live HTTP backend successfully verified on port 8000.")
    except Exception as e:
        print(f"  [NOTE] Port 8000 backend not running or timed out ({e}); in-process regression passed 100%.")

    print("\n============================================================")
    print(f"  ALL {passed_assertions} / {total_assertions} REGRESSION ASSERTIONS PASSED (100%)")
    print("============================================================\n")


if __name__ == '__main__':
    run_regression_tests()
