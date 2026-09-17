"""
Regression test suite for coastal shelf subsurface temperature profiles.
Verifies:
1. Physical temperature floor (>= 4.0°C) across all depths for ocean pixels (never negative).
2. Elimination of deep bathymetric zero collapse (no 3+ consecutive 0.0°C values).
3. Monotonic non-increasing behavior below 100m (depths 100m to 1000m).
4. Specific fix at Gulf of Mannar (9.0°N, 78.9°E) on 2023-12-21 (was -0.9°C at 200m, 0.0°C below).
5. Robustness across coastal shelf locations (Gulf of Mannar, Gulf of Kutch, Palk Strait)
   and open ocean (Central Arabian Sea, Bay of Bengal) across 2021, 2022, 2023.
"""

import os
import sys
import unittest
import urllib.request
import json

sys.path.insert(0, os.path.abspath("backend"))
sys.path.insert(0, os.path.abspath("."))

from backend.inference import predict_temperature_profile, STANDARD_DEPTHS


class TestTemperatureShelfDepths(unittest.TestCase):
    def setUp(self):
        self.coords = [
            (9.0, 78.9, "Gulf of Mannar"),
            (22.5, 69.0, "Gulf of Kutch"),
            (10.0, 79.5, "Palk Strait"),
            (15.5, 65.0, "Central Arabian Sea"),
            (12.4, 88.6, "Bay of Bengal"),
        ]
        self.dates = ["2021-02-14", "2022-07-02", "2023-12-21"]

    def test_gulf_of_mannar_upstream_bug_resolved(self):
        """Specifically verifies the Gulf of Mannar profile reported on 2023-12-21."""
        prof = predict_temperature_profile(9.0, 78.9, "2023-12-21")
        
        # 100m should be warm tropical subsurface
        self.assertGreaterEqual(prof[100], 20.0, f"100m should be >= 20°C, got {prof[100]}")
        # 200m was previously -0.9°C
        self.assertGreaterEqual(prof[200], 12.0, f"200m was previously -0.9°C, got {prof[200]}")
        # 300m was previously -0.1°C
        self.assertGreaterEqual(prof[300], 10.0, f"300m was previously -0.1°C, got {prof[300]}")
        # 500m, 700m, 1000m were previously flat 0.0°C
        self.assertGreaterEqual(prof[500], 8.0, f"500m was previously 0.0°C, got {prof[500]}")
        self.assertGreaterEqual(prof[700], 7.0, f"700m was previously 0.0°C, got {prof[700]}")
        self.assertGreaterEqual(prof[1000], 4.0, f"1000m was previously 0.0°C, got {prof[1000]}")

    def test_temperature_floor_and_no_zero_collapses(self):
        """Asserts temperatures >= 4.0°C and no 3+ consecutive 0.0°C across coordinates and dates."""
        for lat, lon, name in self.coords:
            for date_str in self.dates:
                with self.subTest(location=name, date=date_str):
                    prof = predict_temperature_profile(lat, lon, date_str)
                    vals = [prof[d] for d in STANDARD_DEPTHS]
                    
                    # 1. Physical Indian Ocean temperature floor (>= 4.0°C)
                    for d, t in zip(STANDARD_DEPTHS, vals):
                        self.assertGreaterEqual(
                            t, 4.0,
                            f"Unphysical low/negative temperature {t}°C at depth {d}m at {name} on {date_str}"
                        )
                    
                    # 2. No 3+ consecutive exact 0.0 values anywhere
                    for i in range(len(vals) - 2):
                        consecutive_zeros = (vals[i] == 0.0 and vals[i+1] == 0.0 and vals[i+2] == 0.0)
                        self.assertFalse(
                            consecutive_zeros,
                            f"Found 3 consecutive 0.0°C at {name} on {date_str}: depths {STANDARD_DEPTHS[i:i+3]}"
                        )

    def test_monotonic_non_increasing_below_100m(self):
        """Asserts temperatures are monotonic non-increasing below 100m (indices 7 to 14)."""
        for lat, lon, name in self.coords:
            for date_str in self.dates:
                with self.subTest(location=name, date=date_str):
                    prof = predict_temperature_profile(lat, lon, date_str, raw=False)
                    vals = [prof[d] for d in STANDARD_DEPTHS]
                    
                    # Below 100m (depths 125, 150, 200, 300, 500, 700, 1000m)
                    for i in range(8, len(STANDARD_DEPTHS)):
                        d_curr = STANDARD_DEPTHS[i]
                        d_prev = STANDARD_DEPTHS[i - 1]
                        self.assertLessEqual(
                            vals[i], vals[i - 1] + 1e-3,
                            f"Unphysical inversion below 100m at {name} on {date_str}: {d_curr}m ({vals[i]}°C) > {d_prev}m ({vals[i-1]}°C)"
                        )

    def test_live_api_predict_and_indices_transparency(self):
        """Tests the running FastAPI /predict endpoint for profile and formula breakdown."""
        req_data = json.dumps({"latitude": 9.0, "longitude": 78.9, "date": "2023-12-21"}).encode("utf-8")
        req = urllib.request.Request(
            "http://localhost:8000/predict",
            data=req_data,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                
                # Check profile
                prof_dict = {p["depth"]: p["temperature"] for p in body["profile"]}
                self.assertGreaterEqual(prof_dict[200], 12.0)
                self.assertGreaterEqual(prof_dict[1000], 4.0)

                # Check indices transparency
                indices = body["indices"]
                self.assertIn("thermal_front_gradient", indices)
                self.assertIn("thermal_front_strength", indices)
                self.assertIn("pfz_formula", indices)
                
                formula = indices["pfz_formula"]
                self.assertEqual(formula["model_derived_pct"], 85)
                self.assertEqual(formula["heuristic_pct"], 15)
                self.assertAlmostEqual(sum(formula["weights"].values()), 1.0, places=2)
        except urllib.error.URLError as e:
            self.skipTest(f"FastAPI backend on port 8000 not reachable: {e}")


if __name__ == "__main__":
    unittest.main()
