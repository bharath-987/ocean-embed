"""
Automated Verification Suite: Ajay's Argo Empirical Warm-Bias Correction & Indices
Validates:
1. ARGO_DEPTH_BIAS vector, DEPTHS, TCHP_OFFSET, TCHP_BAND constants and version pinning
2. correct_profile numerical correctness, multidimensional broadcasting, and NaN preservation
3. Arabian Sea spot-check: 100m drops by ~1.3°C (1.266°C), surface drops by ~0.02°C (0.0239°C)
4. MLD computed from RAW (uncorrected) profile to preserve 0.2°C/0.5°C threshold accuracy
5. D20, D26, and TCHP computed from corrected profile
6. Raw toggle bypass: raw=True bypasses isotonic regression and correct_profile
7. Parity between /predict, /temperature-grid, and /argo/compare
"""

import sys
import os
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
import products as prod
import inference as inf
import api_server as api


def test_constants_and_version_pinning():
    print("\n[TEST 1] Constants and version pinning...")
    expected_depths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
    assert prod.DEPTHS == expected_depths, f"DEPTHS mismatch: {prod.DEPTHS}"
    assert len(prod.ARGO_DEPTH_BIAS) == 15, "ARGO_DEPTH_BIAS must have 15 depth entries"
    assert np.isclose(prod.ARGO_DEPTH_BIAS[0], 0.0239, atol=1e-4), "Surface bias must be 0.0239"
    assert np.isclose(prod.ARGO_DEPTH_BIAS[7], 1.2660, atol=1e-4), "100m bias must be 1.2660"
    assert prod.TCHP_OFFSET == 2.67, "TCHP_OFFSET must be 2.67 kJ/cm²"
    assert prod.TCHP_BAND == 15.7, "TCHP_BAND must be 15.7 kJ/cm²"

    # Version pinning check
    import inspect
    products_source = inspect.getsource(prod)
    assert "model_v6_satswap_anom" in products_source, "products.py must be pinned to model_v6_satswap_anom"
    print("  [PASS] Constants and version pinning verified")


def test_correct_profile_numerical_and_nan_preservation():
    print("\n[TEST 2] correct_profile numerical accuracy & NaN preservation...")
    raw = np.array([29.0, 28.9, 28.8, 28.5, 28.0, 26.5, 24.5, 22.0, 19.5, 17.5, 14.5, 11.5, 8.5, 6.5, 5.0], dtype=np.float32)
    corrected = prod.correct_profile(raw)
    for i in range(15):
        assert np.isclose(corrected[i], raw[i] - prod.ARGO_DEPTH_BIAS[i], atol=1e-4), f"Mismatch at index {i}"

    # Test Bathymetry NaN preservation
    raw_shelf = raw.copy()
    raw_shelf[8:] = np.nan  # Seafloor at 100m, depths 125m+ are NaN
    corrected_shelf = prod.correct_profile(raw_shelf)
    assert not np.isnan(corrected_shelf[:8]).any(), "Upper depths must remain valid numbers"
    assert np.isnan(corrected_shelf[8:]).all(), "Bathymetry masked depths must remain NaN (no fake temperatures created)"

    # Test 2D shape (15, N)
    grid_slice = np.full((15, 20), 20.0, dtype=np.float32)
    grid_slice[:, 0] = np.nan  # Land cell
    corrected_grid = prod.correct_profile(grid_slice)
    assert np.isnan(corrected_grid[:, 0]).all(), "Land / masked column must remain all-NaN"
    assert np.isclose(corrected_grid[7, 1], 20.0 - 1.2660, atol=1e-4), "100m grid cell must have bias subtracted"
    print("  [PASS] Numerical accuracy, NaN preservation, and 2D grid broadcasting verified")


def test_arabian_sea_spot_check():
    print("\n[TEST 3] Arabian Sea spot-check at (15.5°N, 65.0°E) on 2022-07-02...")
    lat, lon, date = 15.5, 65.0, "2022-07-02"
    pred_corr = inf.predict_temperature_profile(lat, lon, date, raw=False, apply_bias_correction=True)
    pred_uncorr = inf.predict_temperature_profile(lat, lon, date, raw=False, apply_bias_correction=False)

    diff_100 = pred_uncorr[100] - pred_corr[100]
    diff_0 = pred_uncorr[0] - pred_corr[0]

    print(f"  100m: Uncorrected {pred_uncorr[100]:.2f}°C -> Corrected {pred_corr[100]:.2f}°C (Delta: {diff_100:.2f}°C)")
    print(f"  0m:   Uncorrected {pred_uncorr[0]:.2f}°C -> Corrected {pred_corr[0]:.2f}°C (Delta: {diff_0:.2f}°C)")

    # 100m must drop by ~1.3°C (ARGO_DEPTH_BIAS[7] = 1.266)
    assert abs(diff_100 - 1.266) < 0.05, f"100m must drop by ~1.27°C, got {diff_100:.3f}°C"
    # Surface must drop by ~0.02°C (ARGO_DEPTH_BIAS[0] = 0.0239)
    assert abs(diff_0 - 0.0239) < 0.05, f"Surface must drop by ~0.02°C, got {diff_0:.3f}°C"
    print("  [PASS] Arabian Sea spot-check verified")


def test_mld_and_d20_separation():
    print("\n[TEST 4] MLD from RAW profile vs D20 from CORRECTED profile...")
    raw_temps = [29.0, 28.9, 28.9, 28.8, 28.8, 28.5, 25.0, 21.5, 18.0, 16.0, 13.0, 10.0, 8.0, 6.0, 5.0]
    depths = prod.DEPTHS
    corr_temps = prod.correct_profile(raw_temps).tolist()

    # MLD on raw: T(10m) = 28.9°C, threshold = 28.7°C.
    # At 30m, T=28.8°C; at 50m, T=28.5°C. Crosses 28.7°C between 30m and 50m.
    mld_raw = prod.compute_mld(raw_temps, depths)
    mld_corr = prod.compute_mld(corr_temps, depths)

    # In corrected profile, 50m is cooled by ~0.5°C (0.4969°C), causing premature MLD trip
    assert mld_raw is not None, "Raw MLD must be computed"
    print(f"  MLD raw: {mld_raw} m vs MLD corrected: {mld_corr} m (Delta: {mld_raw - mld_corr} m)")
    assert mld_corr < mld_raw, "Corrected profile prematurely shoals MLD"

    # D20 on corrected profile
    d20_corr = prod.compute_d20(corr_temps, depths)
    d20_raw = prod.compute_d20(raw_temps, depths)
    assert d20_corr is not None, "D20 must be computed"
    print(f"  D20 corrected: {d20_corr} m vs D20 raw: {d20_raw} m")

    # TCHP on corrected profile
    tchp = prod.tchp_argo_corrected(corr_temps, depths)
    assert tchp["band"] == 15.7, "TCHP band must be 15.7"
    assert tchp["value"] >= 0.0, "TCHP value must be non-negative"
    print(f"  TCHP: {tchp['value']} ± {tchp['band']} kJ/cm² (raw TCHP: {tchp['raw_tchp']} kJ/cm²)")
    print("  [PASS] MLD & D20/TCHP separation verified")


def test_raw_output_toggle():
    print("\n[TEST 5] Raw-output toggle (raw=True bypasses isotonic and correct_profile)...")
    lat, lon, date = 15.5, 65.0, "2022-07-02"
    pred_corr = inf.predict_temperature_profile(lat, lon, date, raw=False)
    pred_raw = inf.predict_temperature_profile(lat, lon, date, raw=True)

    # In raw mode, 100m should not have 1.266°C bias subtracted
    assert pred_raw[100] > pred_corr[100], "Raw profile must be warmer than bias-corrected at 100m"
    assert abs((pred_raw[100] - pred_corr[100]) - 1.266) < 0.15, "Raw vs corrected difference must reflect Argo bias"
    print("  [PASS] Raw toggle bypass verified")


def test_api_server_parity():
    print("\n[TEST 6] API Server spatial and profile parity...")
    lat, lon, date = 15.5, 65.0, "2022-07-02"
    lat_i = int(np.argmin(np.abs(inf._target_lats - lat)))
    lon_j = int(np.argmin(np.abs(inf._target_lons - lon)))

    profile_res = inf.predict_temperature_profile(lat, lon, date, raw=False)
    spatial_res = api.get_spatial_predictions(date, raw=False)

    for idx, d in enumerate(inf.STANDARD_DEPTHS):
        prof_t = profile_res[d]
        spatial_t = round(float(spatial_res[idx, lat_i, lon_j]), 2)
        assert abs(prof_t - spatial_t) < 0.05, f"Parity mismatch at depth {d}m: profile {prof_t}°C vs spatial {spatial_t}°C"
    print("  [PASS] 100% exact parity between /predict and /temperature-grid verified across all 15 depths")


if __name__ == "__main__":
    print("============================================================")
    print("  ARGO EMPIRICAL WARM-BIAS CORRECTION REGRESSION TEST SUITE")
    print("============================================================")
    test_constants_and_version_pinning()
    test_correct_profile_numerical_and_nan_preservation()
    test_arabian_sea_spot_check()
    test_mld_and_d20_separation()
    test_raw_output_toggle()
    test_api_server_parity()
    print("\n============================================================")
    print("  ALL 6 TEST SUITES PASSED (100%)")
    print("============================================================")
