"""
Regression test suite for coastal shelf subsurface temperature profiles.
Verifies:
1. Strict bathymetry masking: depths beyond the local seabed are None in Python / null in JSON.
2. Depths above the seabed are physically valid temperatures (>= 4.0°C).
3. Monotonic non-increasing behavior below 100m for valid depths.
4. Specific shelf/gulf points: Sundarbans (~20m), West-coast Arabian Sea (~20m),
   Persian Gulf (~50m), Gulf of Mannar (~10m), Gulf of Kutch (~5m), Palk Strait (~5m).
5. Open ocean integrity: Central Arabian Sea and Bay of Bengal have all 15 depths valid numbers.
6. Anti-flatline regression guard: no run of 5+ consecutive identical numeric values.
"""

import json
import math
import os
import sys
import unittest
import urllib.request

sys.path.insert(0, os.path.abspath("backend"))
sys.path.insert(0, os.path.abspath("."))

from backend.inference import predict_temperature_profile, STANDARD_DEPTHS


class TestTemperatureShelfDepths(unittest.TestCase):
    def setUp(self):
        # (lat, lon, name, seafloor_depth_m)
        self.shelf_coords = [
            (20.90, 87.20, "Sundarbans Delta", 20),
            (19.92, 71.75, "West-coast Arabian Sea", 20),
            (28.13, 50.45, "Persian Gulf", 50),
            (9.57, 79.48, "Gulf of Mannar", 10),
            (22.50, 69.00, "Gulf of Kutch", 5),
            (10.00, 79.50, "Palk Strait", 5),
        ]
        self.open_ocean_coords = [
            (15.50, 65.00, "Central Arabian Sea"),
            (12.40, 88.60, "Bay of Bengal"),
        ]
        self.dates = ["2021-02-14", "2022-07-02", "2023-12-21"]

    def test_shelf_locations_strict_bathymetry_masking(self):
        """Asserts depths above seafloor are valid numbers and depths beyond seafloor are None."""
        for lat, lon, name, seafloor_d in self.shelf_coords:
            for date_str in self.dates:
                with self.subTest(location=name, date=date_str):
                    prof = predict_temperature_profile(lat, lon, date_str)
                    
                    for d in STANDARD_DEPTHS:
                        val = prof[d]
                        if d <= seafloor_d:
                            self.assertIsNotNone(
                                val,
                                f"Depth {d}m at {name} ({lat}, {lon}) on {date_str} is above seafloor ({seafloor_d}m) but returned None"
                            )
                            self.assertGreaterEqual(
                                val, 4.0,
                                f"Unphysical temperature {val}°C at depth {d}m at {name} on {date_str}"
                            )
                        else:
                            self.assertIsNone(
                                val,
                                f"Depth {d}m at {name} ({lat}, {lon}) on {date_str} is beyond seafloor ({seafloor_d}m) but returned {val} instead of None"
                            )

    def test_open_ocean_all_depths_valid(self):
        """Asserts open ocean points have all 15 depths valid and physically realistic."""
        for lat, lon, name in self.open_ocean_coords:
            for date_str in self.dates:
                with self.subTest(location=name, date=date_str):
                    prof = predict_temperature_profile(lat, lon, date_str)
                    vals = [prof[d] for d in STANDARD_DEPTHS]
                    
                    # All 15 depths must be valid numbers >= 4.0°C
                    for d, t in zip(STANDARD_DEPTHS, vals):
                        self.assertIsNotNone(t, f"Open ocean depth {d}m at {name} must not be None")
                        self.assertGreaterEqual(t, 4.0, f"Open ocean depth {d}m at {name} must be >= 4.0°C, got {t}")

                    # Monotonic non-increasing below 100m
                    for i in range(8, len(STANDARD_DEPTHS)):
                        self.assertLessEqual(
                            vals[i], vals[i - 1] + 1e-3,
                            f"Inversion below 100m at {name}: {STANDARD_DEPTHS[i]}m ({vals[i]}°C) > {STANDARD_DEPTHS[i-1]}m ({vals[i-1]}°C)"
                        )

    @staticmethod
    def _has_numeric_flatline(profile_vals, run_length=5):
        """
        Inspects a profile list. Only considers valid numeric values (filtering out None, null,
        and NaN). Returns True if there is any run of >= run_length consecutive identical numeric values.
        Explicitly excludes None, null, and NaN so that shallow shelf seabeds with 6+ consecutive
        trailing nulls are never falsely flagged as flatlines.
        """
        valid_nums = []
        for v in profile_vals:
            # Exclude None, null, NaN, Inf, and non-numeric types explicitly
            if v is None:
                continue
            if isinstance(v, (int, float)):
                if math.isnan(v) or math.isinf(v):
                    continue
                valid_nums.append(float(v))

        if len(valid_nums) < run_length:
            return False

        for i in range(len(valid_nums) - run_length + 1):
            window = valid_nums[i:i + run_length]
            if all(abs(w - window[0]) < 1e-4 for w in window):
                return True
        return False

    def test_anti_flatline_regression_guard(self):
        """
        Asserts no profile ever returns a run of 5+ consecutive identical numeric values.
        Explicitly excludes null/None/NaN values from comparison so shelf seabeds
        with 6+ trailing nulls are not treated as flatlines, while catching any
        real numeric flatline (e.g. 5+ consecutive 4.0°C).
        """
        # --- UNIT TESTS FOR DETECTOR INTEGRITY ---
        # 1. Profile with 11 consecutive None/nulls (simulating Sundarbans 30-1000m seabed)
        #    MUST NOT trigger flatline detection (no false positive / false negative)
        mock_shelf_nulls = [30.03, 30.13, 30.08, 29.91] + [None] * 11
        self.assertFalse(
            self._has_numeric_flatline(mock_shelf_nulls, run_length=5),
            "Detector falsely flagged 11 consecutive nulls as a flatline!"
        )

        # 2. Profile with 6+ consecutive float('nan') values MUST NOT trigger flatline detection
        mock_shelf_nans = [30.03, 30.13, 30.08, 29.91] + [float("nan")] * 11
        self.assertFalse(
            self._has_numeric_flatline(mock_shelf_nans, run_length=5),
            "Detector falsely flagged consecutive NaNs as a flatline!"
        )

        # 3. Real 5-run numeric flatline followed by nulls MUST be detected
        mock_bad_flatline = [30.03, 4.0, 4.0, 4.0, 4.0, 4.0] + [None] * 9
        self.assertTrue(
            self._has_numeric_flatline(mock_bad_flatline, run_length=5),
            "Detector failed to catch a genuine run of 5 consecutive 4.0°C values!"
        )

        # 4. Prove that naive comparison without null exclusion would have failed:
        naive_window = mock_shelf_nulls[4:9]
        naive_all_equal = all(w == naive_window[0] for w in naive_window)
        self.assertTrue(
            naive_all_equal,
            "Sanity check: in naive comparison, [None]*5 all match because None == None."
        )

        # --- RECURSIVE CHECK ACROSS ALL MODEL PROFILES ---
        all_coords = [(lat, lon, name) for lat, lon, name, _ in self.shelf_coords] + self.open_ocean_coords
        for lat, lon, name in all_coords:
            for date_str in self.dates:
                with self.subTest(location=name, date=date_str):
                    prof = predict_temperature_profile(lat, lon, date_str)
                    vals = [prof[d] for d in STANDARD_DEPTHS]
                    has_flatline = self._has_numeric_flatline(vals, run_length=5)
                    self.assertFalse(
                        has_flatline,
                        f"Flatline collapse detected at {name} on {date_str}"
                    )

    def test_live_api_predict_shelf_and_ocean_parity(self):
        """Tests FastAPI /predict endpoint for both shelf and open ocean locations, including indices."""
        try:
            # 1. Test shallow shelf point: Sundarbans Delta (seafloor ~20m)
            req_shelf = urllib.request.Request(
                "http://localhost:8000/predict",
                data=json.dumps({"latitude": 20.90, "longitude": 87.20, "date": "2022-07-02"}).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req_shelf, timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                prof_dict = {p["depth"]: p["temperature"] for p in body["profile"]}
                
                # 0-20m valid
                self.assertIsNotNone(prof_dict[0])
                self.assertIsNotNone(prof_dict[20])
                # 30-1000m null
                self.assertIsNone(prof_dict[30])
                self.assertIsNone(prof_dict[100])
                self.assertIsNone(prof_dict[1000])

                # Indices depth-range validation:
                indices = body.get("indices", {})
                self.assertIsNone(indices.get("d20"), "Sundarbans D20 should be None (water >= 29.9°C to bed)")
                self.assertIsNone(indices.get("d26"), "Sundarbans D26 should be None (water >= 29.9°C to bed)")
                self.assertIsNone(indices.get("mld"), "Sundarbans MLD should be None (delta < 0.2°C in 20m)")
                self.assertIsNone(indices.get("ohc300"), "Sundarbans OHC300 should be None (water column < 300m)")
                self.assertIsNone(indices.get("tchp"), "Sundarbans TCHP should be None (D26 unreached before seafloor)")

            # 2. Test shallow shelf point: Persian Gulf (seafloor ~50m)
            req_pg = urllib.request.Request(
                "http://localhost:8000/predict",
                data=json.dumps({"latitude": 28.13, "longitude": 50.45, "date": "2022-07-02"}).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req_pg, timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                indices = body.get("indices", {})
                self.assertIsNone(indices.get("d20"), "Persian Gulf D20 should be None (column stays > 21°C)")
                self.assertIsNotNone(indices.get("d26"), "Persian Gulf D26 should be present (~24.5m)")
                self.assertLessEqual(indices.get("d26"), 50.0, "D26 must be <= 50m seafloor")
                self.assertIsNotNone(indices.get("mld"), "Persian Gulf MLD should be present (~10.8m)")
                self.assertLessEqual(indices.get("mld"), 50.0, "MLD must be <= 50m seafloor")
                self.assertIsNone(indices.get("ohc300"), "Persian Gulf OHC300 should be None (water column < 300m)")
                self.assertIsNotNone(indices.get("tchp"), "Persian Gulf TCHP should be valid")

            # 3. Test open ocean: Central Arabian Sea (1000m valid)
            req_ocean = urllib.request.Request(
                "http://localhost:8000/predict",
                data=json.dumps({"latitude": 15.50, "longitude": 65.00, "date": "2022-07-02"}).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req_ocean, timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                prof_dict = {p["depth"]: p["temperature"] for p in body["profile"]}
                for d in STANDARD_DEPTHS:
                    self.assertIsNotNone(prof_dict[d])
                    self.assertGreaterEqual(prof_dict[d], 4.0)
                indices = body.get("indices", {})
                self.assertIsNotNone(indices.get("d20"), "Open ocean D20 must be present")
                self.assertIsNotNone(indices.get("d26"), "Open ocean D26 must be present")
                self.assertIsNotNone(indices.get("mld"), "Open ocean MLD must be present")
                self.assertIsNotNone(indices.get("ohc300"), "Open ocean OHC300 must be present")
                self.assertGreater(indices.get("ohc300"), 1000.0, "Open ocean OHC300 must be > 1000 kJ/cm²")

        except urllib.error.URLError as e:
            self.skipTest(f"FastAPI backend on port 8000 not reachable: {e}")


if __name__ == "__main__":
    unittest.main()

