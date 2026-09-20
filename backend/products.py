"""
oceanembed / kyogre products module.
Empirical Argo warm-bias correction and physical oceanographic indices.

PINNED MODEL: v6_satswap_anom_14yr (serving via v6_adapter.py / model_v6_satswap_anom_best.pt)
CRITICAL NOTE: The empirical depth-bias vector ARGO_DEPTH_BIAS is specifically tuned
for the 14-year V6 model (v6_satswap_anom_14yr, correction_v6_satswap_anom_14yr.json).
If the checkpoint changes or is retrained, the bias vector MUST be refitted against the validation dataset.
"""

from typing import List, Optional, Union
import numpy as np

# 15 Standard Depths in meters matching V6 model output
DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]

# Empirical Argo depth bias vector (v6_satswap_anom_14yr, correction_v6_satswap_anom_14yr.json)
ARGO_DEPTH_BIAS = np.array([
    0.02692635, -0.01744583, 0.01577189, 0.11663548, 0.15960154,
    0.40214999,  0.23907496, 1.07216843, -0.15642495, -0.30402927,
    0.39556680, -0.35816629, -0.39205419, 0.31647621, 0.61763212
], dtype=np.float32)

# Post-processing empirical TCHP adjustment constants (v6_satswap_anom_14yr)
TCHP_OFFSET = 2.47      # kJ/cm², added after computing TCHP from the corrected profile
TCHP_BAND = 11.8        # kJ/cm², new empirical error band (±11.8 kJ/cm², updated from ±15.7)


def correct_profile(raw_profile: Union[np.ndarray, List[float]]) -> np.ndarray:
    """
    Apply empirical Argo warm-bias correction: raw_profile - ARGO_DEPTH_BIAS.
    Preserves NaN levels (e.g. depths masked by bathymetry or land).

    Args:
        raw_profile: Array or list with depth dimension of length 15 matching DEPTHS.
                     Supports:
                     - 1D profile of shape (15,)
                     - 2D profile of shape (..., 15) [depths along last axis]
                     - 2D/3D grid of shape (15, ...) [depths along first axis, e.g. (15, N) or (15, H, W)]

    Returns:
        np.ndarray: Bias-corrected profile where valid depths have ARGO_DEPTH_BIAS subtracted
                    and NaN levels stay NaN.
    """
    arr = np.asarray(raw_profile, dtype=np.float32).copy()
    nan_mask = np.isnan(arr)

    if arr.ndim == 1:
        if len(arr) != len(DEPTHS):
            raise ValueError(f"Expected 1D profile with {len(DEPTHS)} depths, got {len(arr)}")
        corrected = arr - ARGO_DEPTH_BIAS
    elif arr.shape[-1] == len(DEPTHS):
        corrected = arr - ARGO_DEPTH_BIAS
    elif arr.shape[0] == len(DEPTHS):
        shape_broadcast = [len(DEPTHS)] + [1] * (arr.ndim - 1)
        corrected = arr - ARGO_DEPTH_BIAS.reshape(shape_broadcast)
    else:
        raise ValueError(f"Cannot broadcast ARGO_DEPTH_BIAS of length {len(DEPTHS)} to shape {arr.shape}")

    corrected[nan_mask] = np.nan
    return corrected


def compute_d20(profile: Union[np.ndarray, List[float]], depths: Optional[List[int]] = None) -> Optional[float]:
    """
    Compute D20 Isotherm Depth (meters): depth at which temperature first drops to 20°C,
    linearly interpolating between bracketing levels.
    """
    if depths is None:
        depths = DEPTHS
    p = np.asarray(profile, dtype=float)
    if len(p) == 0 or np.isnan(p[0]):
        return None
    if p[0] <= 20.0:
        return float(depths[0])
    for i in range(1, len(p)):
        if np.isnan(p[i]):
            break
        if p[i] <= 20.0:
            d0, d1 = depths[i - 1], depths[i]
            t0, t1 = p[i - 1], p[i]
            denom = (t0 - t1) if abs(t0 - t1) > 1e-6 else 1.0
            frac = (t0 - 20.0) / denom
            return round(float(d0 + frac * (d1 - d0)), 1)
    return None


def compute_d26(profile: Union[np.ndarray, List[float]], depths: Optional[List[int]] = None) -> Optional[float]:
    """
    Compute D26 Isotherm Depth (meters): depth at which temperature first drops to 26°C,
    linearly interpolating between bracketing levels.
    """
    if depths is None:
        depths = DEPTHS
    p = np.asarray(profile, dtype=float)
    if len(p) == 0 or np.isnan(p[0]):
        return None
    if p[0] <= 26.0:
        return float(depths[0])
    for i in range(1, len(p)):
        if np.isnan(p[i]):
            break
        if p[i] <= 26.0:
            d0, d1 = depths[i - 1], depths[i]
            t0, t1 = p[i - 1], p[i]
            denom = (t0 - t1) if abs(t0 - t1) > 1e-6 else 1.0
            frac = (t0 - 26.0) / denom
            return round(float(d0 + frac * (d1 - d0)), 1)
    return None


def compute_mld(raw_profile: Union[np.ndarray, List[float]], depths: Optional[List[int]] = None) -> Optional[float]:
    """
    Mixed Layer Depth (MLD) calculation using de Boyer Montégut (2004) criterion:
    depth where temperature first drops 0.2°C below 10m reference depth T(10m).

    CRITICAL: Compute MLD from the RAW (uncorrected) profile.
    The bias correction changes 50m by ~0.5°C while leaving 10m alone, tripping the 0.2°C
    threshold prematurely and shoaling MLD by 8–10m (MLD bias worsens from +0.3m to -7.5m).
    """
    if depths is None:
        depths = DEPTHS
    p = np.asarray(raw_profile, dtype=float)
    if len(p) <= 2 or np.isnan(p[0]):
        return None
    idx10 = depths.index(10) if 10 in depths else 2
    if idx10 >= len(p) or np.isnan(p[idx10]):
        return None
    t_ref = p[idx10]
    target_t = t_ref - 0.2
    for i in range(idx10 + 1, len(p)):
        if np.isnan(p[i]):
            break
        if p[i] <= target_t:
            d0, d1 = depths[i - 1], depths[i]
            t0, t1 = p[i - 1], p[i]
            denom = (t0 - t1) if abs(t0 - t1) > 1e-6 else 1.0
            frac = (t0 - target_t) / denom
            return round(float(d0 + frac * (d1 - d0)), 1)
    return None


def compute_tchp(profile: Union[np.ndarray, List[float]], depths: Optional[List[int]] = None) -> Optional[float]:
    """
    Tropical Cyclone Heat Potential (TCHP) in kJ/cm²:
    TCHP = (rho * cp / 1e7) * integral_0^D26 (T(z) - 26) dz
    rho = 1025 kg/m³, cp = 3993 J/(kg·K)
    Factor = 1025 * 3993 / 1e7 = 0.4092825 kJ/(cm²·K·m)

    - If surface temperature is < 26.0°C, returns 0.0 (by physical definition, no heat > 26°C).
    - If surface temperature is >= 26.0°C but the 26°C isotherm is not reached within
      the valid (non-null) water column (i.e. d26 is None due to shallow bathymetry cutoff),
      returns None because the water column is truncated at the seafloor and TCHP cannot
      be meaningfully determined.
    """
    if depths is None:
        depths = DEPTHS
    p = np.asarray(profile, dtype=float)
    if len(p) == 0 or np.isnan(p[0]):
        return None
    if p[0] < 26.0:
        return 0.0

    d26 = compute_d26(p, depths)
    if d26 is None:
        # Water column is truncated at the seafloor while still >= 26°C; D26 is unobserved
        return None
    if d26 <= 0.0:
        return 0.0

    factor = (1025.0 * 3993.0) / 1e7  # 0.4092825 kJ/(cm²·K·m)
    heat_sum = 0.0

    for i in range(1, len(depths)):
        if np.isnan(p[i]) or np.isnan(p[i - 1]):
            break
        z_prev, z_curr = depths[i - 1], depths[i]
        t_prev, t_curr = p[i - 1], p[i]

        if z_curr <= d26:
            avg_temp_above_26 = ((t_prev - 26.0) + (t_curr - 26.0)) / 2.0
            dz = z_curr - z_prev
            heat_sum += max(0.0, avg_temp_above_26) * dz
        elif z_prev < d26:
            dz = d26 - z_prev
            avg_temp_above_26 = (t_prev - 26.0) / 2.0
            heat_sum += max(0.0, avg_temp_above_26) * dz
            break
        else:
            break

    return float(factor * heat_sum)


def tchp_argo_corrected(corrected_profile: Union[np.ndarray, List[float]], depths: Optional[List[int]] = None) -> dict:
    """
    Compute TCHP from corrected profile and apply empirical TCHP offset.
    tchp_value = max(tchp(corrected) + TCHP_OFFSET, 0.0)
    If raw_tchp is None (e.g. truncated shallow water column where D26 is unobserved),
    returns None for value, band, and raw_tchp to prevent returning misleading zeros.
    Returns dict with value, band, and unit.
    """
    raw_tchp = compute_tchp(corrected_profile, depths)
    if raw_tchp is None:
        return {
            "value": None,
            "band": None,
            "raw_tchp": None,
            "unit": "kJ/cm²",
        }
    if raw_tchp > 0:
        tchp_val = round(max(raw_tchp + TCHP_OFFSET, 0.0), 1)
    else:
        tchp_val = 0.0
    return {
        "value": tchp_val,
        "band": TCHP_BAND,
        "raw_tchp": round(raw_tchp, 2),
        "unit": "kJ/cm²",
    }


def compute_ohc300(profile: Union[np.ndarray, List[float]], depths: Optional[List[int]] = None) -> Optional[float]:
    """
    Ocean Heat Content in upper 300m (OHC₃₀₀) in kJ/cm²:
    OHC = (rho * cp / 1e7) * integral_0^300 T(z) dz
    rho = 1025 kg/m³, cp = 3993 J/(kg·K)
    Factor = 1025 * 3993 / 1e7 = 0.4092825 kJ/(cm²·K·m)

    CRITICAL: If the valid water column does not reach 300m (i.e. seafloor is shallower
    than 300m, or any layer <= 300m is NaN), returns None because OHC₃₀₀ cannot be
    meaningfully computed over a partial/shallow water column.
    """
    if depths is None:
        depths = DEPTHS
    p = np.asarray(profile, dtype=float)
    if len(p) == 0 or np.isnan(p[0]):
        return None

    if 300 not in depths:
        return None
    idx300 = depths.index(300)
    if idx300 >= len(p):
        return None

    # All depths up to 300m must be valid non-NaN numbers
    for i in range(idx300 + 1):
        if np.isnan(p[i]):
            return None

    factor = (1025.0 * 3993.0) / 1e7
    heat_sum = 0.0
    for i in range(1, idx300 + 1):
        dz = depths[i] - depths[i - 1]
        avg_t = (p[i - 1] + p[i]) / 2.0
        heat_sum += avg_t * dz

    return round(float(factor * heat_sum), 1)

