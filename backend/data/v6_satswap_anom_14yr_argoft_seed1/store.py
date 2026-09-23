"""
Data access layer for the OceanEmbed inference API.

Design note: this service serves PRECOMPUTED prediction fields rather than running
the model per request. The model is run once (in Colab, on GPU) and its output is
dumped to a single .npz field file; this layer slices that file. Consequences:

  - no torch dependency, no GPU, no 27-channel preprocessing chain in deployment
  - sub-millisecond responses instead of a forward pass per request
  - the frontend is fully decoupled from the model

Every response carries `data_source`. If the loaded field file is synthetic sample
data, `data_source` says so and a `warning` is attached, so sample values can never
be silently presented as real model output.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

# Model grid — must match the training grid exactly.
# target_lats = np.arange(5, 30 + 0.25, 0.25)   -> 101 values
# target_lons = np.arange(45, 105 + 0.25, 0.25) -> 241 values
LAT_MIN, LAT_MAX = 5.0, 30.0
LON_MIN, LON_MAX = 45.0, 105.0
RESOLUTION_DEG = 0.25

STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]


class FieldNotLoaded(RuntimeError):
    """Raised when a request arrives before any field file has been loaded."""


class OutOfDomain(ValueError):
    """Raised for coordinates, dates or depths the loaded field does not cover."""


def _clean(x: float) -> float | None:
    """NaN/Inf are not valid JSON. Invalid cells become null, not 0.0 — a zero here
    would look like a real 0 degrees C reading to the frontend."""
    if x is None:
        return None
    xf = float(x)
    return None if (math.isnan(xf) or math.isinf(xf)) else round(xf, 3)


class FieldStore:
    """Holds one precomputed prediction field in memory and slices it."""

    def __init__(self) -> None:
        self.temperature: np.ndarray | None = None   # (n_days, n_depths, n_lat, n_lon)
        self.valid_mask: np.ndarray | None = None    # (n_depths, n_lat, n_lon) bool
        self.dates: list[str] = []
        self.depths: list[int] = []
        self.lats: np.ndarray | None = None
        self.lons: np.ndarray | None = None
        self.meta: dict[str, Any] = {}
        self.source_path: str | None = None

    # ---------------------------------------------------------------- loading

    def load(self, path: str | Path) -> None:
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(
                f"Field file not found: {path}. Generate sample data with "
                f"`python api/make_sample.py`, or point OCEANEMBED_FIELD at a real "
                f"field exported by api/export_predictions.py."
            )
        with np.load(path, allow_pickle=False) as z:
            self.temperature = z["temperature"].astype("float32")
            self.valid_mask = z["valid_mask"].astype(bool)
            self.dates = [str(d) for d in z["dates"]]
            self.depths = [int(d) for d in z["depths"]]
            self.lats = z["lats"].astype("float64")
            self.lons = z["lons"].astype("float64")
            self.meta = json.loads(str(z["meta_json"]))
        self.source_path = str(path)
        self._validate_shapes()

    def _validate_shapes(self) -> None:
        t = self.temperature
        assert t is not None and self.valid_mask is not None
        expected = (len(self.dates), len(self.depths), len(self.lats), len(self.lons))
        if t.shape != expected:
            raise ValueError(
                f"Field file shape mismatch: temperature is {t.shape}, but dates/"
                f"depths/lats/lons imply {expected}. The file is likely truncated — "
                f"re-export it."
            )
        if self.valid_mask.shape != expected[1:]:
            raise ValueError(
                f"valid_mask shape {self.valid_mask.shape} does not match "
                f"(depths, lat, lon) = {expected[1:]}."
            )

    @property
    def loaded(self) -> bool:
        return self.temperature is not None

    def _require(self) -> None:
        if not self.loaded:
            raise FieldNotLoaded(
                "No prediction field is loaded. Start the server with a valid "
                "OCEANEMBED_FIELD path, or run `python api/make_sample.py` first."
            )

    # ------------------------------------------------------------- provenance

    @property
    def is_synthetic(self) -> bool:
        return bool(self.meta.get("synthetic", False))

    @property
    def data_source(self) -> str:
        return str(self.meta.get("data_source", "unknown"))

    def provenance(self) -> dict[str, Any]:
        """Attached to every response so the frontend always knows what it has."""
        out: dict[str, Any] = {"data_source": self.data_source}
        if self.is_synthetic:
            out["warning"] = self.meta.get(
                "warning",
                "SYNTHETIC SAMPLE DATA — not model output. Do not present as results.",
            )
        return out

    # ----------------------------------------------------------- index lookup

    def _date_index(self, date: str) -> int:
        self._require()
        try:
            return self.dates.index(date)
        except ValueError:
            raise OutOfDomain(
                f"Date {date!r} is not in the loaded field. Available range: "
                f"{self.dates[0]} to {self.dates[-1]} ({len(self.dates)} days). "
                f"Use GET /meta to list coverage."
            ) from None

    def _depth_index(self, depth: int) -> int:
        self._require()
        try:
            return self.depths.index(int(depth))
        except ValueError:
            raise OutOfDomain(
                f"Depth {depth} m is not a standard level. Valid levels: {self.depths}."
            ) from None

    def _cell_index(self, lat: float, lon: float) -> tuple[int, int]:
        self._require()
        assert self.lats is not None and self.lons is not None
        if not (LAT_MIN <= lat <= LAT_MAX) or not (LON_MIN <= lon <= LON_MAX):
            raise OutOfDomain(
                f"Coordinate ({lat}, {lon}) is outside the model domain "
                f"({LAT_MIN}-{LAT_MAX}N, {LON_MIN}-{LON_MAX}E)."
            )
        return int(np.argmin(np.abs(self.lats - lat))), int(np.argmin(np.abs(self.lons - lon)))

    # ---------------------------------------------------------------- queries

    def metadata(self) -> dict[str, Any]:
        self._require()
        assert self.lats is not None and self.lons is not None
        return {
            "region": {
                "lat_min": LAT_MIN, "lat_max": LAT_MAX,
                "lon_min": LON_MIN, "lon_max": LON_MAX,
                "resolution_deg": RESOLUTION_DEG,
                "name": "North Indian Ocean (Arabian Sea + Bay of Bengal)",
            },
            "grid": {"n_lat": len(self.lats), "n_lon": len(self.lons)},
            "depths_m": self.depths,
            "dates": {
                "start": self.dates[0],
                "end": self.dates[-1],
                "count": len(self.dates),
            },
            "model": self.meta.get("model", {}),
            "ocean_cells_by_depth": {
                str(d): int(self.valid_mask[i].sum())          # type: ignore[index]
                for i, d in enumerate(self.depths)
            },
            **self.provenance(),
        }

    def profile(self, lat: float, lon: float, date: str) -> dict[str, Any]:
        """Full 15-level temperature profile at one grid cell — the 'click the map,
        see a depth profile' call."""
        self._require()
        assert self.temperature is not None and self.valid_mask is not None
        assert self.lats is not None and self.lons is not None
        di = self._date_index(date)
        yi, xi = self._cell_index(lat, lon)

        column = self.temperature[di, :, yi, xi]
        valid = self.valid_mask[:, yi, xi]
        temps = [_clean(v) if ok else None for v, ok in zip(column, valid)]

        if not any(t is not None for t in temps):
            # Entire column masked — land, or outside the ocean mask.
            return {
                "requested": {"lat": lat, "lon": lon, "date": date},
                "grid_cell": {
                    "lat": float(self.lats[yi]), "lon": float(self.lons[xi]),
                    "lat_index": yi, "lon_index": xi,
                },
                "depths_m": self.depths,
                "temperature_c": temps,
                "is_ocean": False,
                "note": "This grid cell is land (or outside the ocean mask); no profile exists.",
                **self.provenance(),
            }

        return {
            "requested": {"lat": lat, "lon": lon, "date": date},
            "grid_cell": {
                "lat": float(self.lats[yi]), "lon": float(self.lons[xi]),
                "lat_index": yi, "lon_index": xi,
            },
            "depths_m": self.depths,
            "temperature_c": temps,
            "is_ocean": True,
            **self.provenance(),
        }

    def map_slice(self, depth: int, date: str) -> dict[str, Any]:
        """2-D temperature field at one depth and date — the map layer.
        Land and sub-seafloor cells are null, never 0.0."""
        self._require()
        assert self.temperature is not None and self.valid_mask is not None
        assert self.lats is not None and self.lons is not None
        di = self._date_index(date)
        zi = self._depth_index(depth)

        field = self.temperature[di, zi].astype("float64").copy()
        mask = self.valid_mask[zi]
        field[~mask] = np.nan

        finite = field[np.isfinite(field)]
        value_range = (
            {"min": round(float(finite.min()), 3), "max": round(float(finite.max()), 3)}
            if finite.size else {"min": None, "max": None}
        )

        # None (not NaN) for JSON validity; frontend renders these as "no data".
        rows = [[_clean(v) for v in row] for row in field]

        return {
            "depth_m": int(depth),
            "date": date,
            "lats": [round(float(v), 4) for v in self.lats],
            "lons": [round(float(v), 4) for v in self.lons],
            "temperature_c": rows,
            "value_range": value_range,
            "valid_cells": int(mask.sum()),
            **self.provenance(),
        }

    def timeseries(self, lat: float, lon: float, depth: int) -> dict[str, Any]:
        """One depth at one cell across every available date — for a trend chart."""
        self._require()
        assert self.temperature is not None and self.valid_mask is not None
        assert self.lats is not None and self.lons is not None
        yi, xi = self._cell_index(lat, lon)
        zi = self._depth_index(depth)

        is_ocean = bool(self.valid_mask[zi, yi, xi])
        series = self.temperature[:, zi, yi, xi]

        return {
            "requested": {"lat": lat, "lon": lon, "depth_m": int(depth)},
            "grid_cell": {
                "lat": float(self.lats[yi]), "lon": float(self.lons[xi]),
                "lat_index": yi, "lon_index": xi,
            },
            "dates": self.dates,
            "temperature_c": [_clean(v) for v in series] if is_ocean else [None] * len(self.dates),
            "is_ocean": is_ocean,
            **({} if is_ocean else {"note": "Cell has no data at this depth (land or shallower than this level)."}),
            **self.provenance(),
        }


# Module-level singleton — the app loads into this at startup.
store = FieldStore()
