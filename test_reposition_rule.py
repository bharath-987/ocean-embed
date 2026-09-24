import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import numpy as np
import backend.inference as inf
from backend.api_server import (
    compute_pfz_grid,
    compute_distance_to_coast_km,
    NEARSHORE_MAX_KM,
)

grid = compute_pfz_grid('2023-09-04')
boxes = grid['nearshore_boxes']
mask = inf._valid_depth_mask  # (15, 101, 241)
depths = inf.STANDARD_DEPTHS
ocean_mask = inf._sst_arr[0] >= 0.5

def get_depth_at(lat, lon):
    lat_idx = int(round((lat - inf.MIN_LAT) / 0.25))
    lon_idx = int(round((lon - inf.MIN_LON) / 0.25))
    if lat_idx < 0 or lat_idx >= 101 or lon_idx < 0 or lon_idx >= 241:
        return 0, []
    if not ocean_mask[lat_idx, lon_idx]:
        return 0, []
    valid = [depths[i] for i in range(15) if mask[i, lat_idx, lon_idx]]
    return (valid[-1] if valid else 0), valid

can_reach_300 = []
genuinely_shallow = []

# Search window: within box neighborhood (e.g. +/- 4 steps lat = +/- 1.0°, +/- 6 steps lon = +/- 1.5°)
# or up to +/- 6 steps lat (+/- 1.5°), +/- 8 steps lon (+/- 2.0°)
for b in boxes:
    c_lat, c_lon = b['center_lat'], b['center_lon']
    cur_depth, _ = get_depth_at(c_lat, c_lon)
    if cur_depth >= 300:
        continue
        
    best_target = None
    min_dist_to_center = 999999
    
    # Search nearby cells on 0.25° grid
    for d_lat in range(-4, 5):
        for d_lon in range(-6, 7):
            cand_lat = round(c_lat + d_lat * 0.25, 2)
            cand_lon = round(c_lon + d_lon * 0.25, 2)
            cand_depth, _ = get_depth_at(cand_lat, cand_lon)
            if cand_depth >= 300:
                d_coast = compute_distance_to_coast_km(cand_lat, cand_lon)
                if 0.0 < d_coast <= NEARSHORE_MAX_KM:
                    offset_dist = np.hypot(d_lat * 27.78, d_lon * 27.78 * np.cos(np.radians(c_lat)))
                    # Prefer closest point to original center that reaches >= 300m
                    # (and if equal, prefer deeper)
                    if offset_dist < min_dist_to_center:
                        min_dist_to_center = offset_dist
                        best_target = {
                            "lat": cand_lat,
                            "lon": cand_lon,
                            "depth": cand_depth,
                            "dist_coast": d_coast,
                            "offset_lat": d_lat * 0.25,
                            "offset_lon": d_lon * 0.25,
                            "offset_km": offset_dist,
                        }
                    elif abs(offset_dist - min_dist_to_center) < 1.0:
                        if cand_depth > best_target['depth']:
                            best_target = {
                                "lat": cand_lat,
                                "lon": cand_lon,
                                "depth": cand_depth,
                                "dist_coast": d_coast,
                                "offset_lat": d_lat * 0.25,
                                "offset_lon": d_lon * 0.25,
                                "offset_km": offset_dist,
                            }
                            
    if best_target:
        can_reach_300.append((b, cur_depth, best_target))
    else:
        genuinely_shallow.append((b, cur_depth))

print(f"Total boxes: {len(boxes)}")
print(f"Already >= 300m: {len(boxes) - len(can_reach_300) - len(genuinely_shallow)}")
print(f"Can be moved to reach >= 300m: {len(can_reach_300)}")
print(f"Genuinely shallow (cannot reach 300m nearby): {len(genuinely_shallow)}")

print("\n--- BOXES TO BE MOVED (reaching >= 300m) ---")
for b, cur_d, target in can_reach_300:
    print(f"  {b['id']}: ({b['center_lat']}, {b['center_lon']}) [{cur_d}m, {b['distance_to_coast_km']}km] -> ({target['lat']}, {target['lon']}) [Achieved: {target['depth']}m, Coast: {target['dist_coast']}km, Offset: {target['offset_km']:.1f}km ({target['offset_lat']:+.2f}°, {target['offset_lon']:+.2f}°)]")

print("\n--- GENUINELY SHALLOW (left as-is) ---")
for b, cur_d in genuinely_shallow:
    print(f"  {b['id']}: center=({b['center_lat']}, {b['center_lon']}), max_depth={cur_d}m, dist_coast={b['distance_to_coast_km']}km")
