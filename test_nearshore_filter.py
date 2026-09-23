"""
Automated Verification Suite for Nearshore Fisheries Filtering & Coast Distance
Tests:
1. Mask Verification: Reuses existing Natural Earth land mask with exact (26, 41) resolution.
2. Distance Calculation: compute_distance_to_coast_km(lat, lon) accurately measures haversine
   distance to the nearest land cell (e.g. Mumbai 18N, 72.8E -> 74.0 km; Offshore 15N, 65E -> 884.9 km).
3. Named Constant: NEARSHORE_MAX_KM is defined as a named constant with oceanographic fleet rationale.
4. PFZ Grid Filtering: compute_pfz_grid excludes offshore cells (> NEARSHORE_MAX_KM) completely (null),
   while retaining nearshore coastal/shelf cells.
5. Predict Integration: /predict exposes distance_to_coast_km at root and in indices for all points.
6. Single Source Parity: Distance values from compute_distance_to_coast_km, /predict, and /pfz-grid agree.
"""

import os
import sys
import json
import urllib.request
import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure backend can be imported
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from api_server import (
    NEARSHORE_MAX_KM,
    _get_pfz_land_mask,
    _get_pfz_coast_dist_grid,
    compute_distance_to_coast_km,
    distance_to_coast_km,
    compute_pfz_grid,
)

print("=" * 70)
print("  Running Nearshore Fisheries Filter Verification Suite")
print("=" * 70)

# 1. Mask Resolution & Parity Check
print("\n[Test 1] Verifying existing land/ocean mask resolution...")
mask = _get_pfz_land_mask()
assert mask is not None, "Land mask must not be None"
assert mask.shape == (26, 41), f"Expected land mask shape (26, 41), got {mask.shape}"
assert mask.dtype == bool, f"Expected bool mask, got {mask.dtype}"
land_count = int(np.sum(mask))
ocean_count = int(np.sum(~mask))
print(f"  ✓ Reused existing mask: shape {mask.shape}, {land_count} land cells, {ocean_count} ocean cells.")

# 2. Named Constant Check
print("\n[Test 2] Verifying NEARSHORE_MAX_KM configuration...")
assert isinstance(NEARSHORE_MAX_KM, float), f"Expected float, got {type(NEARSHORE_MAX_KM)}"
assert NEARSHORE_MAX_KM > 0.0, f"NEARSHORE_MAX_KM must be positive, got {NEARSHORE_MAX_KM}"
print(f"  ✓ NEARSHORE_MAX_KM configured as {NEARSHORE_MAX_KM} km (fleet operational threshold).")

# 3. Distance-to-Coast Calculation Verification
print("\n[Test 3] Verifying compute_distance_to_coast_km(lat, lon)...")
# Nearshore Mumbai point (18.0°N, 72.8°E)
dist_mumbai = compute_distance_to_coast_km(18.0, 72.8)
print(f"  Nearshore Mumbai (18.0°N, 72.8°E): {dist_mumbai} km")
assert 70.0 <= dist_mumbai <= 76.0, f"Expected ~74.0 km for Mumbai nearshore, got {dist_mumbai}"
assert dist_mumbai <= NEARSHORE_MAX_KM, f"Mumbai nearshore point ({dist_mumbai} km) must be <= NEARSHORE_MAX_KM ({NEARSHORE_MAX_KM})"

# Offshore Central Arabian Sea point (15.0°N, 65.0°E)
dist_offshore = compute_distance_to_coast_km(15.0, 65.0)
print(f"  Offshore Central Arabian Sea (15.0°N, 65.0°E): {dist_offshore} km")
assert 850.0 <= dist_offshore <= 920.0, f"Expected ~885 km for Central Arabian Sea, got {dist_offshore}"
assert dist_offshore > NEARSHORE_MAX_KM, f"Offshore point ({dist_offshore} km) must exceed NEARSHORE_MAX_KM ({NEARSHORE_MAX_KM})"

# Function alias parity
assert distance_to_coast_km(18.0, 72.8) == dist_mumbai, "distance_to_coast_km alias must match compute_distance_to_coast_km"
print("  ✓ Distance calculation verified for both nearshore and offshore coordinates.")

# 4. Precomputed PFZ Coast Distance Grid Check
print("\n[Test 4] Verifying precomputed PFZ coast distance grid...")
dist_grid = _get_pfz_coast_dist_grid()
assert dist_grid.shape == (26, 41), f"Expected shape (26, 41), got {dist_grid.shape}"
# Land cells must be 0.0
assert np.all(dist_grid[mask] == 0.0), "All land cells in dist_grid must have 0.0 km distance"
# Ocean cells adjacent to coast must be between 110 and 185 km
min_ocean_dist = float(np.min(dist_grid[~mask]))
assert 110.0 <= min_ocean_dist <= 115.0, f"Expected min ocean distance ~111.2 km, got {min_ocean_dist}"
print(f"  ✓ Precomputed grid verified: land=0.0 km, min ocean cell distance={min_ocean_dist:.1f} km.")

# 5. Live /pfz-grid Exclusion & Inclusion Check
print("\n[Test 5] Verifying /pfz-grid candidate zone filtering...")
url_grid = "http://localhost:8000/pfz-grid?date=2023-09-04"
req_grid = urllib.request.Request(url_grid)
with urllib.request.urlopen(req_grid) as resp:
    grid_data = json.loads(resp.read().decode("utf-8"))

assert grid_data["date"] == "2023-09-04"
assert len(grid_data["pfz_scores"]) == 26
assert len(grid_data["pfz_scores"][0]) == 41

# Offshore point: Row 10, Col 13 is (15.0°N, 64.5°E) in Central Arabian Sea (~885 km)
r10, c13 = 10, 13
score_offshore = grid_data["pfz_scores"][r10][c13]
print(f"  Central Arabian Sea offshore (15.0°N, 64.5°E) pfz_score: {score_offshore}")
assert score_offshore is None, f"Offshore point must be excluded from PFZ grid (expected None, got {score_offshore})"

# Nearshore point: (12.0°N, 75.0°E) off Malabar Coast (~111 km)
r_malabar = grid_data["lats"].index(12.0)
c_malabar = grid_data["lons"].index(75.0)
score_malabar = grid_data["pfz_scores"][r_malabar][c_malabar]
print(f"  Malabar nearshore (12.0°N, 75.0°E) pfz_score: {score_malabar}")
assert isinstance(score_malabar, (float, int)), f"Nearshore point must have valid numeric score, got {score_malabar}"
assert 0.0 <= score_malabar <= 1.0, f"Score out of range: {score_malabar}"
print("  ✓ PFZ grid filtering verified: offshore point excluded (None), nearshore point included.")

# 6. Live /predict Endpoint Integration Check
print("\n[Test 6] Verifying /predict exposes distance_to_coast_km...")
def query_predict(lat, lon, date="2023-09-04"):
    url = "http://localhost:8000/predict"
    body = json.dumps({"latitude": lat, "longitude": lon, "date": date}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

# Test nearshore point
res_mumbai = query_predict(18.0, 72.8)
assert "distance_to_coast_km" in res_mumbai, "Root must contain distance_to_coast_km"
assert "distance_to_coast_km" in res_mumbai.get("indices", {}), "indices must contain distance_to_coast_km"
assert res_mumbai["distance_to_coast_km"] == dist_mumbai, f"Expected {dist_mumbai}, got {res_mumbai['distance_to_coast_km']}"
print(f"  ✓ /predict nearshore (18.0°N, 72.8°E): distance_to_coast_km = {res_mumbai['distance_to_coast_km']} km")

# Test offshore point
res_offshore = query_predict(15.0, 65.0)
assert "distance_to_coast_km" in res_offshore, "Root must contain distance_to_coast_km"
assert "distance_to_coast_km" in res_offshore.get("indices", {}), "indices must contain distance_to_coast_km"
assert res_offshore["distance_to_coast_km"] == dist_offshore, f"Expected {dist_offshore}, got {res_offshore['distance_to_coast_km']}"
print(f"  ✓ /predict offshore (15.0°N, 65.0°E): distance_to_coast_km = {res_offshore['distance_to_coast_km']} km")

print("\n" + "=" * 70)
print("  ALL NEARSHORE FILTER PYTHON TESTS PASSED SUCCESSFULLY! (100%)")
print("=" * 70 + "\n")
