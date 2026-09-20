"""
OceanEmbed / Kyogre — Automated Verification Suite for External Datasets
========================================================================
Validates NASA MODIS Chlorophyll-a regridding, ECMWF ERA5 wind stress,
Large & Pond (1981) bulk drag coefficient, spherical curl, and Ekman pumping.
"""

import os
import sys
import unittest
import numpy as np

# Ensure backend directory is in path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

import process_external_datasets as ped
import download_modis_chla as dmc


class TestExternalDatasetsPipeline(unittest.TestCase):

    def test_composite_window_calculation(self):
        """Verify 8-day composite window mapping logic."""
        import datetime
        # Day 183 of 2022 is July 2
        d = datetime.date(2022, 7, 2)
        start, end = dmc.get_8day_composite_bounds(d)
        self.assertEqual(start, datetime.date(2022, 6, 26))
        self.assertEqual(end, datetime.date(2022, 7, 3))
        self.assertEqual((end - start).days, 7) # 8 days inclusive

        # Jan 1
        d_jan = datetime.date(2022, 1, 1)
        s_jan, e_jan = dmc.get_8day_composite_bounds(d_jan)
        self.assertEqual(s_jan, datetime.date(2022, 1, 1))
        self.assertEqual(e_jan, datetime.date(2022, 1, 8))

        # Dec 31
        d_dec = datetime.date(2022, 12, 31)
        s_dec, e_dec = dmc.get_8day_composite_bounds(d_dec)
        self.assertEqual(e_dec, datetime.date(2022, 12, 31))

    def test_large_and_pond_drag_coefficient(self):
        """Verify Large & Pond (1981) drag coefficient and wind stress physics."""
        # Calm winds (< 11 m/s): constant 1.2e-3
        u_calm = np.full((101, 241), 5.0, dtype=np.float32)
        v_calm = np.full((101, 241), 0.0, dtype=np.float32)
        res_calm = ped.compute_wind_stress_and_ekman(u_calm, v_calm)
        
        expected_tau_calm = 1.225 * 1.2e-3 * 5.0 * 5.0 # ~0.03675 N/m2
        np.testing.assert_allclose(res_calm["tau_mag"], expected_tau_calm, rtol=1e-3)
        np.testing.assert_allclose(res_calm["tau_x"], expected_tau_calm, rtol=1e-3)
        np.testing.assert_allclose(res_calm["tau_y"], 0.0, atol=1e-6)

        # High winds (> 11 m/s): (0.49 + 0.065*W) * 1e-3
        w_high = 15.0
        u_high = np.full((101, 241), w_high, dtype=np.float32)
        v_high = np.full((101, 241), 0.0, dtype=np.float32)
        res_high = ped.compute_wind_stress_and_ekman(u_high, v_high)
        
        cd_high = (0.49 + 0.065 * 15.0) * 1e-3 # 1.465e-3
        expected_tau_high = 1.225 * cd_high * 15.0 * 15.0 # ~0.4039 N/m2
        np.testing.assert_allclose(res_high["tau_mag"], expected_tau_high, rtol=1e-3)

    def test_era5_sample_file_processing(self):
        """Verify processing of real downloaded ERA5 sample file."""
        era5_path = os.path.join(BASE_DIR, "backend", "data", "downloads", "era5_sample_20220702.nc")
        self.assertTrue(os.path.exists(era5_path), f"Sample file missing: {era5_path}")
        
        res = ped.process_era5_winds_nc(era5_path)
        self.assertIn("wind_speed", res)
        self.assertIn("tau_mag", res)
        self.assertIn("ekman_upwelling_day", res)
        
        # Check grid dimensions
        self.assertEqual(res["wind_speed"].shape[-2:], (101, 241))
        
        # Check physical bounds
        self.assertGreater(np.max(res["wind_speed"]), 10.0) # Monsoon jet > 10 m/s
        self.assertGreater(np.max(res["tau_mag"]), 0.20)    # Peak stress > 0.2 N/m2
        
        # Check Oman Findlater Jet upwelling center (18°N, 57.5°E)
        i_oman = int(np.argmin(np.abs(ped.TARGET_LATS - 18.0)))
        j_oman = int(np.argmin(np.abs(ped.TARGET_LONS - 57.5)))
        w_oman = float(res["ekman_upwelling_day"][0, i_oman, j_oman])
        self.assertGreater(w_oman, 0.5, f"Oman upwelling pumping should be > 0.5 m/day, got {w_oman:.2f}")

    def test_modis_chlorophyll_regridding(self):
        """Verify 4km MODIS chlorophyll regridding to 0.25° grid."""
        chl_path = os.path.join(BASE_DIR, "backend", "data", "downloads", "AQUA_MODIS.20220626_20220703.L3m.8D.CHL.chlor_a.4km.nc")
        self.assertTrue(os.path.exists(chl_path), f"Sample file missing: {chl_path}")
        
        regrid = ped.regrid_modis_chlorophyll(chl_path)
        self.assertEqual(regrid.shape, (101, 241))
        
        valid = regrid[~np.isnan(regrid)]
        self.assertGreater(len(valid), 3000) # Over 3000 valid ocean cells
        self.assertGreater(np.min(valid), 0.0)
        self.assertLess(np.max(valid), 100.0)
        
        # Check Malabar coastal bloom (10°N, 75.5°E)
        i_mal = int(np.argmin(np.abs(ped.TARGET_LATS - 10.0)))
        j_mal = int(np.argmin(np.abs(ped.TARGET_LONS - 75.5)))
        chl_mal = float(regrid[i_mal, j_mal])
        self.assertFalse(np.isnan(chl_mal), "Malabar coastal bloom should not be NaN")
        self.assertGreater(chl_mal, 1.5, f"Malabar bloom should be > 1.5 mg/m3, got {chl_mal:.2f}")

    def test_era5_float16_arrays(self):
        """Verify the 1095-day float16 ERA5 wind and upwelling arrays."""
        float16_dir = os.path.join(BASE_DIR, "backend", "data", "float16")
        for name in ["wind_speed.npy", "wind_stress_mag.npy", "ekman_upwelling.npy", "tau_x.npy", "tau_y.npy"]:
            fpath = os.path.join(float16_dir, name)
            self.assertTrue(os.path.exists(fpath), f"Array file missing: {fpath}")
            arr = np.load(fpath, mmap_mode="r")
            self.assertEqual(arr.shape, (1095, 101, 241), f"{name} shape mismatch: {arr.shape}")
            self.assertEqual(arr.dtype, np.float16, f"{name} dtype mismatch: {arr.dtype}")
            # Check a sample day for NaNs
            sample = np.array(arr[547], dtype=np.float32) # Day 547 is mid-2022
            self.assertEqual(np.count_nonzero(np.isnan(sample)), 0, f"{name} contains NaNs on day 547")
            self.assertEqual(np.count_nonzero(np.isinf(sample)), 0, f"{name} contains Infs on day 547")


if __name__ == "__main__":
    unittest.main(verbosity=2)
