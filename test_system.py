"""
Kyogre System & API Verification Suite
Run this script before any git commit or push to ensure 100% system integrity.
Usage: python test_system.py
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_BASE = "http://localhost:8000"
STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
SURFACE_PARAMS = ["sst", "ssh", "sss", "sla", "current", "wind"]
TEST_DATE = "2022-07-02"


def print_step(name):
    print(f"\n[TEST] {name}...")


def assert_true(condition, message):
    if not condition:
        print(f"  [FAIL] {message}")
        sys.exit(1)
    print(f"  [PASS] {message}")


def test_backend_health():
    print_step("Backend API Health & Predict Endpoint")
    url = f"{API_BASE}/predict"
    payload = json.dumps({
        "latitude": 15.5,
        "longitude": 65.0,
        "date": TEST_DATE
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            assert_true(res.status == 200, f"/predict HTTP status is {res.status}")
            data = json.loads(res.read().decode("utf-8"))
            assert_true("temps" in data and len(data["temps"]) == 15, "Returns 15 depth temperatures")
            assert_true("surfaceInputs" in data, "Returns surface inputs")
            assert_true(20.0 <= data["temps"][0] <= 34.0, f"Surface temp {data['temps'][0]}°C is within physical ocean range")
    except Exception as e:
        print(f"  [FAIL] Could not connect to backend API: {e}")
        sys.exit(1)


def test_temperature_grid():
    print_step("Temperature Grid Endpoint (/temperature-grid)")
    for depth in [0, 100, 200, 1000]:
        url = f"{API_BASE}/temperature-grid?date={TEST_DATE}&depth={depth}"
        with urllib.request.urlopen(url, timeout=10) as res:
            assert_true(res.status == 200, f"HTTP status 200 for depth {depth}m")
            data = json.loads(res.read().decode("utf-8"))
            assert_true(data["depth"] == depth, f"Returned depth matches {depth}m")
            assert_true(len(data["lats"]) == 101, "Lats array has 101 points (0.25 deg)")
            assert_true(len(data["lons"]) == 241, "Lons array has 241 points (0.25 deg)")
            assert_true(len(data["grid"]) == 101 and len(data["grid"][0]) == 241, "Grid array has shape 101x241")


def test_parameter_grid():
    print_step("Parameter Grid Endpoint (/parameter-grid)")
    for param in SURFACE_PARAMS:
        url = f"{API_BASE}/parameter-grid?param={param}&date={TEST_DATE}"
        with urllib.request.urlopen(url, timeout=10) as res:
            assert_true(res.status == 200, f"HTTP status 200 for parameter '{param}'")
            data = json.loads(res.read().decode("utf-8"))
            assert_true(data["param"] == param, f"Returned param matches '{param}'")
            assert_true(len(data["grid"]) == 101 and len(data["grid"][0]) == 241, f"Grid array for '{param}' has shape 101x241")


def test_frontend_files():
    print_step("Frontend Files & DOM Hook Integrity")
    project_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check explore.html
    html_path = os.path.join(project_dir, "explore.html")
    assert_true(os.path.exists(html_path), "explore.html exists")
    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()
        assert_true("native-depth-select" in html_content, "Depth select dropdown element present")
        assert_true("map-legend" in html_content, "Map legend element present")
        assert_true("surface-inputs-grid" in html_content, "Ocean parameter cards grid present")
        assert_true("tvd-empty-view" in html_content, "TVD empty view element present")
        assert_true("ky-param-tile--active" not in html_content, "No parameter tile has default active class")

    # Check app.js
    js_path = os.path.join(project_dir, "app.js")
    assert_true(os.path.exists(js_path), "app.js exists")
    with open(js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
        assert_true("selectedParam" in js_content, "selectedParam state variable declared")
        assert_true("paramToColor" in js_content, "paramToColor function declared")
        assert_true("generateParamGridCanvas" in js_content, "generateParamGridCanvas function declared")
        assert_true("checkAndRefreshHeatmap" in js_content, "checkAndRefreshHeatmap function declared")


def test_gating_logic_rules():
    print_step("Gating Logic Specification Check")
    js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
        # Ensure location is not gating heatmap in checkAndRefreshHeatmap
        assert_true("const isGated = !hasSelectedDate || !hasLayer;" in js_content, "Heatmap gating is decoupled from location")


def main():
    print("=" * 60)
    print("  KYOGRE RIGOROUS SYSTEM VERIFICATION SUITE")
    print("=" * 60)
    
    test_frontend_files()
    test_gating_logic_rules()
    test_backend_health()
    test_temperature_grid()
    test_parameter_grid()

    print("\n" + "=" * 60)
    print("  ALL RIGOROUS TESTS PASSED! READY FOR COMMIT/DEPLOY.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
