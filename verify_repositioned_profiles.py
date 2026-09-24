import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import numpy as np
import backend.inference as inf
from backend.api_server import (
    _get_pfz_land_mask,
    compute_distance_to_coast_km,
    NEARSHORE_MAX_KM,
    predict_temperature_profile,
)

REPOSITIONED_MAP = {
    (1, 36): (6.75, 98.0, 177.4),
    (2, 36): (7.0, 97.75, 177.1),
    (3, 22): (7.75, 78.25, 141.7),
    (4, 35): (8.0, 97.5, 165.2),
    (7, 20): (11.75, 74.25, 161.1),
    (9, 19): (13.25, 73.5, 164.8),
    (10, 19): (15.5, 72.75, 185.0),
    (10, 33): (15.25, 93.5, 135.7),
    (12, 18): (16.25, 72.0, 180.3),
    (13, 8): (17.5, 57.0, 166.8),
    (13, 26): (17.75, 84.0, 139.0),
    (15, 9): (20.0, 58.75, 114.2),
    (15, 17): (20.0, 69.25, 171.2),
    (16, 31): (20.0, 91.75, 171.2),
    (18, 15): (22.5, 67.25, 168.7),
    (19, 14): (24.0, 65.75, 177.8),
    (20, 11): (24.75, 61.5, 139.0),
    (20, 12): (24.75, 63.0, 139.0),
    (20, 13): (24.75, 64.5, 139.0),
    (20, 14): (24.75, 66.0, 139.0),
    (21, 8): (25.5, 57.25, 137.0),
}

DATES = ["2023-01-15", "2023-05-15", "2023-07-15", "2023-09-04", "2023-10-22", "2023-12-15"]
depths = inf.STANDARD_DEPTHS

total_checks = 0
cliff_errors = 0
shallow_errors = 0
coast_errors = 0

print(f"Auditing all {len(REPOSITIONED_MAP)} repositioned points across {len(DATES)} dates ({len(REPOSITIONED_MAP)*len(DATES)} total profiles)...")

for (r, c), (lat, lon, d_coast) in REPOSITIONED_MAP.items():
    calc_dist = compute_distance_to_coast_km(lat, lon)
    if calc_dist > NEARSHORE_MAX_KM:
        print(f"ERROR: ({lat}, {lon}) dist={calc_dist} > {NEARSHORE_MAX_KM}")
        coast_errors += 1
        
    for date_str in DATES:
        total_checks += 1
        res = predict_temperature_profile(lat, lon, date_str)
        if "error" in res:
            print(f"ERROR: ({lat}, {lon}) on {date_str} returned error: {res['error']}")
            shallow_errors += 1
            continue
        valid_depths = [d for d in depths if res.get(d) is not None]
        valid_temps = [res[d] for d in valid_depths]
        
        max_d = valid_depths[-1] if valid_depths else 0
        if max_d < 300:
            print(f"ERROR: ({lat}, {lon}) on {date_str} max_d={max_d} < 300m")
            shallow_errors += 1
            
        temps_0_50 = [res[d] for d in depths if d <= 50 and res.get(d) is not None]
        for i in range(len(temps_0_50) - 1):
            drop = temps_0_50[i] - temps_0_50[i+1]
            if drop > 8.0:
                print(f"CLIFF ERROR: ({lat}, {lon}) on {date_str} drop={drop:.2f}°C")
                cliff_errors += 1
                
        for t in valid_temps:
            if t < 4.0:
                print(f"COLD ERROR: ({lat}, {lon}) on {date_str} temp={t}°C < 4.0°C")
                cliff_errors += 1

print(f"\nAudit complete: {total_checks} profiles tested.")
print(f"Shallow errors (<300m): {shallow_errors}")
print(f"Cliff/cold errors: {cliff_errors}")
print(f"Coast distance errors (>185km): {coast_errors}")
if shallow_errors == 0 and cliff_errors == 0 and coast_errors == 0:
    print("ALL REPOSITIONED POINTS 100% VALIDATED!")
