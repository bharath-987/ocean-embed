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
    grids = {}
    for param in SURFACE_PARAMS:
        url = f"{API_BASE}/parameter-grid?param={param}&date={TEST_DATE}"
        with urllib.request.urlopen(url, timeout=10) as res:
            assert_true(res.status == 200, f"HTTP status 200 for parameter '{param}'")
            data = json.loads(res.read().decode("utf-8"))
            assert_true(data["param"] == param, f"Returned param matches '{param}'")
            assert_true(len(data["grid"]) == 101 and len(data["grid"][0]) == 241, f"Grid array for '{param}' has shape 101x241")
            grids[param] = data

            # Vector field verification for current and wind
            if param in ["current", "wind"]:
                assert_true("u" in data and "v" in data, f"'{param}' contains vector components 'u' and 'v'")
                assert_true(len(data["u"]) == 101 and len(data["u"][0]) == 241, f"'{param}' u-component has shape 101x241")
                assert_true(len(data["v"]) == 101 and len(data["v"][0]) == 241, f"'{param}' v-component has shape 101x241")

    # Spatial standard deviation checks (ensuring non-flat spatial variation)
    def calc_stats(grid):
        flat = [v for row in grid for v in row if v is not None and not (isinstance(v, float) and (v != v))]
        n = len(flat)
        if n == 0:
            return 0.0, 0.0, 0.0, 0.0
        mean = sum(flat) / n
        variance = sum((x - mean) ** 2 for x in flat) / n
        std = variance ** 0.5
        return min(flat), max(flat), mean, std

    ssh_min, ssh_max, ssh_mean, ssh_std = calc_stats(grids["ssh"]["grid"])
    assert_true(ssh_std >= 0.04, f"SSH spatial standard deviation is {ssh_std:.4f}m (>= 0.04m, non-flat)")
    assert_true(0.2 <= ssh_mean <= 1.2, f"SSH spatial mean {ssh_mean:.3f}m is physically sound (0.2-1.2m)")

    sla_min, sla_max, sla_mean, sla_std = calc_stats(grids["sla"]["grid"])
    assert_true(sla_std >= 0.02, f"SLA spatial standard deviation is {sla_std:.4f}m (>= 0.02m, non-flat)")
    assert_true(-0.5 <= sla_min and sla_max <= 0.5, f"SLA min/max ({sla_min:.3f}m, {sla_max:.3f}m) in realistic range")

    # Verify Current and Wind are distinct physical fields on ocean cells
    curr_grid = grids["current"]["grid"]
    wind_grid = grids["wind"]["grid"]
    ocean_diffs = [
        abs(curr_grid[i][j] - wind_grid[i][j])
        for i in range(101)
        for j in range(241)
        if curr_grid[i][j] > 0.001 or wind_grid[i][j] > 0.001
    ]
    mean_diff = sum(ocean_diffs) / len(ocean_diffs) if ocean_diffs else 0.0
    assert_true(mean_diff > 0.5, f"Current vs Wind ocean mean absolute difference is {mean_diff:.2f} m/s (> 0.5 m/s, distinct fields)")


def test_sst_parity():
    print_step("SST Cross-Endpoint Parity Check (Predict vs Temperature-Grid vs Parameter-Grid)")
    lat, lon = 15.5, 65.0
    lat_idx = int(round((lat - 5.0) / 0.25))
    lon_idx = int(round((lon - 45.0) / 0.25))

    # 1. /predict endpoint
    url_pred = f"{API_BASE}/predict"
    payload = json.dumps({"latitude": lat, "longitude": lon, "date": TEST_DATE}).encode("utf-8")
    req = urllib.request.Request(url_pred, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as res:
        pred_data = json.loads(res.read().decode("utf-8"))
        predict_sst = pred_data["temps"][0]

    # 2. /temperature-grid?depth=0
    url_temp0 = f"{API_BASE}/temperature-grid?date={TEST_DATE}&depth=0"
    with urllib.request.urlopen(url_temp0, timeout=10) as res:
        temp0_data = json.loads(res.read().decode("utf-8"))
        temp0_sst = temp0_data["grid"][lat_idx][lon_idx]

    # 3. /parameter-grid?param=sst
    url_paramsst = f"{API_BASE}/parameter-grid?param=sst&date={TEST_DATE}"
    with urllib.request.urlopen(url_paramsst, timeout=10) as res:
        paramsst_data = json.loads(res.read().decode("utf-8"))
        paramsst_sst = paramsst_data["grid"][lat_idx][lon_idx]

    delta_t0 = abs(predict_sst - temp0_sst)
    delta_param = abs(predict_sst - paramsst_sst)
    assert_true(delta_t0 < 0.05, f"Predict SST ({predict_sst:.2f}°C) matches /temperature-grid?depth=0 ({temp0_sst:.2f}°C) within 0.05°C (delta={delta_t0:.4f}°C)")
    assert_true(delta_param < 0.05, f"Predict SST ({predict_sst:.2f}°C) matches /parameter-grid?param=sst ({paramsst_sst:.2f}°C) within 0.05°C (delta={delta_param:.4f}°C)")


def test_frontend_files():
    print_step("Frontend Files & DOM Hook Integrity")
    project_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check explore.html
    html_path = os.path.join(project_dir, "explore.html")
    assert_true(os.path.exists(html_path), "explore.html exists")
    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()
        assert_true("native-depth-select" in html_content, "Depth select dropdown element present")
        assert_true("map-depth-menu" in html_content, "Custom map depth menu element present")
        assert_true("map-depth-label\">Depth<" in html_content, "Depth dropdown label defaults to 'Depth'")
        assert_true("M17 5H9.5a3.5" not in html_content, "Dollar sign icon successfully removed from dropdown button")
        assert_true("map-legend" in html_content, "Map legend element present")
        assert_true("surface-inputs-grid" in html_content, "Ocean parameter cards grid present")
        assert_true("tvd-empty-view" in html_content, "TVD empty view element present")
        assert_true("ky-param-tile--active" not in html_content, "No parameter tile has default active class")
        # Check all 15 depth levels are present in custom options
        for d in STANDARD_DEPTHS:
            assert_true(f'data-depth="{d}"' in html_content, f"Depth option for {d}m present in menu")
        assert_true('placeholder="Search location (e.g. Andaman Sea, 10°N 95°E)..."' in html_content, "Search placeholder references Andaman Sea with coordinates 10°N 95°E")
        assert_true('id="region-notice"' in html_content, "Region notice banner element present")
        assert_true('<script src="coastline.js"></script>' in html_content, "coastline.js included in explore.html")
        assert_true('id="ky-vector-canvas"' in html_content, "Dedicated particle flow vector canvas present in explore.html")

    # Check app.js
    js_path = os.path.join(project_dir, "app.js")
    assert_true(os.path.exists(js_path), "app.js exists")
    with open(js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
        assert_true("selectedParam" in js_content, "selectedParam state variable declared")
        assert_true("setDepthSelection" in js_content, "setDepthSelection function declared")
        assert_true("toggleDepthMenu" in js_content, "toggleDepthMenu function declared")
        assert_true("paramToColor" in js_content, "paramToColor function declared")
        assert_true("generateParamGridCanvas" in js_content, "generateParamGridCanvas function declared")
        assert_true("drawVectorGlyphs" in js_content, "drawVectorGlyphs vector rendering declared")
        assert_true("ParticleFlowEngine" in js_content, "ParticleFlowEngine streamline advection engine declared")
        assert_true("validateLayerMarkerSync" in js_content, "validateLayerMarkerSync validation function declared")
        assert_true("currentGridData" in js_content, "currentGridData state variable declared")
        assert_true("checkAndRefreshHeatmap" in js_content, "checkAndRefreshHeatmap function declared")
        assert_true("updateTableHighlight" in js_content, "updateTableHighlight function declared")
        assert_true("scrollHighlightedTvdRow" in js_content, "scrollHighlightedTvdRow function declared")
        assert_true("TVD_HIGHLIGHT_DEPTH" not in js_content, "Hardcoded TVD_HIGHLIGHT_DEPTH constant removed")
        assert_true("isAlreadyActive" in js_content, "Parameter toggle logic with isAlreadyActive check implemented")
        assert_true("showRegionNotice" in js_content, "showRegionNotice function declared")
        assert_true("applyLandMaskToCanvas" in js_content, "applyLandMaskToCanvas function declared")
        assert_true("'2.0+'" in js_content, "Current scale ticks updated to include 2.0+ m/s")
        assert_true("'15+'" in js_content, "Wind scale ticks updated to include 15+ m/s")
        assert_true("This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)" in js_content, "Operational region bounds message enforced in app.js")


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
    test_sst_parity()

    print("\n" + "=" * 60)
    print("  ALL RIGOROUS TESTS PASSED! READY FOR COMMIT/DEPLOY.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
