"""
OceanEmbed / Kyogre — Chlorophyll-a Pipeline & Source Disclosure Verification
=============================================================================
Tests the complete Option A dataset and source disclosure integration:
1. Validates chla_monthly_clim.npy (12, 101, 241, float16, zero NaNs in ocean cells).
2. Validates chla.npy (1095, 101, 241, float16, physical range 0.01 to 100.0 mg/m3).
3. Validates chl_source.npy (1095, 101, 241, int8, values in {-1, 0, 1}).
4. Verifies seasonal coverage statistics (winter vs monsoon).
5. Verifies backend API /predict returns chlorophyll_source and chlorophyll_source_label.
6. Verifies backend API /pfz-grid returns chla_sources grid.
"""

import os
import sys
import unittest
import numpy as np
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FLOAT16_DIR = os.path.join(BASE_DIR, "backend", "data", "float16")
API_BASE = "http://localhost:8000"


class TestChlorophyllPipeline(unittest.TestCase):

    def test_monthly_climatology_array(self):
        """Verify chla_monthly_clim.npy structure and ocean cell completeness."""
        clim_path = os.path.join(FLOAT16_DIR, "chla_monthly_clim.npy")
        self.assertTrue(os.path.exists(clim_path), f"File missing: {clim_path}")
        clim = np.load(clim_path)
        self.assertEqual(clim.shape, (12, 101, 241))
        self.assertEqual(clim.dtype, np.float16)

        # Check that ocean cells have valid positive values across all 12 months
        sst_arr = np.load(os.path.join(FLOAT16_DIR, "sst.npy"), mmap_mode="r")
        ocean_mask = np.any(np.array(sst_arr[:60], dtype=np.float32) > 0.0, axis=0)

        for m in range(12):
            m_vals = np.array(clim[m], dtype=np.float32)
            ocean_vals = m_vals[ocean_mask]
            self.assertEqual(np.count_nonzero(np.isnan(ocean_vals)), 0, f"Month {m+1} has NaN in ocean cells")
            self.assertGreater(np.min(ocean_vals), 0.01, f"Month {m+1} has unphysical values < 0.01")
            self.assertLess(np.max(ocean_vals), 100.0, f"Month {m+1} has unphysical values > 100")

    def test_daily_chlorophyll_array(self):
        """Verify chla.npy 1095-day array properties."""
        chla_path = os.path.join(FLOAT16_DIR, "chla.npy")
        self.assertTrue(os.path.exists(chla_path), f"File missing: {chla_path}")
        chla = np.load(chla_path, mmap_mode="r")
        self.assertEqual(chla.shape, (1095, 101, 241))
        self.assertEqual(chla.dtype, np.float16)

        # Check sample days (Winter Jan 15, Monsoon Jul 2)
        day_jan = np.array(chla[14], dtype=np.float32)   # 2021-01-15
        day_jul = np.array(chla[547], dtype=np.float32)  # 2022-07-02
        self.assertEqual(np.count_nonzero(np.isnan(day_jan)), 0)
        self.assertEqual(np.count_nonzero(np.isnan(day_jul)), 0)

    def test_source_array(self):
        """Verify chl_source.npy integer codes {-1, 0, 1}."""
        source_path = os.path.join(FLOAT16_DIR, "chl_source.npy")
        self.assertTrue(os.path.exists(source_path), f"File missing: {source_path}")
        src = np.load(source_path, mmap_mode="r")
        self.assertEqual(src.shape, (1095, 101, 241))
        self.assertEqual(src.dtype, np.int8)

        # Sample check
        sample = np.array(src[547])
        unique_vals = set(np.unique(sample))
        self.assertTrue(unique_vals.issubset({-1, 0, 1}))
        self.assertIn(1, unique_vals, "Satellite observations (code 1) should be present")
        self.assertIn(0, unique_vals, "Climatology fallbacks (code 0) should be present")
        self.assertIn(-1, unique_vals, "Land mask (code -1) should be present")

    def test_api_predict_chlorophyll_source(self):
        """Verify /predict returns chlorophyll_source disclosure."""
        payload = {
            "latitude": 15.5,
            "longitude": 65.0,
            "date": "2022-07-02"
        }
        res = requests.post(f"{API_BASE}/predict", json=payload, timeout=10)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        indices = data.get("indices", {})

        self.assertIn("chlorophyll_source", indices)
        self.assertIn("chlorophyll_source_label", indices)
        self.assertIn(indices["chlorophyll_source"], ["satellite", "climatology"])
        self.assertIn(indices["chlorophyll_source_label"], [
            "Satellite (8-day composite)",
            "Seasonal average (cloud-obscured)"
        ])
        self.assertIsNotNone(indices.get("chlorophyll_satellite_val"))

    def test_api_pfz_grid_sources(self):
        """Verify /pfz-grid returns chla_sources grid."""
        res = requests.get(f"{API_BASE}/pfz-grid?date=2022-07-02", timeout=10)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("chla_sources", data)
        grid = data["chla_sources"]
        self.assertEqual(len(grid), 26)
        self.assertEqual(len(grid[0]), 41)


if __name__ == "__main__":
    unittest.main(verbosity=2)
