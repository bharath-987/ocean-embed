"""Read the three handed-over files at request time with little memory. numpy only.

The files come as compressed .npz (field_*, products_*, embeddings_*). A compressed .npz cannot be
memory-mapped: np.load decompresses a whole array the moment you touch it, and the full-range field
is ~800 MB as float16 (~1.6 GB as float32). So there are two steps:

  1. ONCE, at build/deploy time:   unpack("field_....npz", "data/field")   (same for products, embeddings)
     Every array becomes a plain .npy file, the JSON metadata becomes meta.json.
  2. At startup:                   data = ServingData("data/field", "data/products", "data/embeddings",
                                                      correction="correction_....json")
     Arrays are opened with mmap_mode="r": a request reads only the bytes it touches (one profile =
     15 values), so resident memory stays small whatever the date range.

Rules this reader enforces (docs/handoff_bharath.md, section 4):
  * the stored temperature is RAW; `corrected` = raw minus the correction's depth_bias, per depth;
  * the correction must belong to the same model as the field (refused otherwise);
  * NaN / masked cells come back as None, never 0.0 (a 0 would look like a real 0 degC reading);
  * product maps are served as stored (D20/D26/TCHP already corrected, MLD from the raw profile).

File layouts (what `unpack` writes, and what the arrays mean):

  field/        temperature (days, 15, 101, 241) float16 degC RAW, NaN outside valid_mask
                valid_mask (15, 101, 241) bool   dates (days,) str   depths (15,)   lats (101,)   lons (241,)
  products/     d20, d26, tchp, mld (days, 101, 241) float16 (m, m, kJ/cm2, m), NaN where undefined
                ocean (101, 241) bool   dates   lats   lons
  embeddings/   rgb (days, 3, 101, 241) uint8 (0 on land)
                cluster_labels (days, 101, 241) int8, -1 on land   cluster_colors (k, 3) uint8
                cluster_profiles (k, 15) float32 mean temperature profile of each regime
                search_vectors (days, n_ocean, 16) float16, ocean cells in ocean.ravel() order
                ocean (101, 241) bool   dates   depths   lats   lons
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

PRODUCTS = ("d20", "d26", "tchp", "mld")
PRODUCT_UNITS = {"d20": "m", "d26": "m", "tchp": "kJ/cm2", "mld": "m"}


def unpack(npz_path, out_dir) -> Path:
    """Write every array of a handed-over .npz as <out_dir>/<name>.npy, and meta_json as meta.json.

    Run once per file; it needs enough RAM to decompress the largest array one time (~800 MB for the
    full-range field), so do it on a laptop or at image build time, not on the 512 MB box."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    with np.load(npz_path, allow_pickle=False) as z:
        for name in z.files:
            if name == "meta_json":
                (out / "meta.json").write_text(str(z[name]))
            else:
                np.save(out / f"{name}.npy", z[name])
    return out


def _clean(x) -> float | None:
    x = float(x)
    return None if (math.isnan(x) or math.isinf(x)) else round(x, 3)


class _Folder:
    def __init__(self, path):
        self.path = Path(path)
        if not self.path.is_dir():
            raise FileNotFoundError(f"{self.path} is not an unpacked folder; run unpack() on the .npz first")
        self.meta = json.loads((self.path / "meta.json").read_text()) if (self.path / "meta.json").exists() else {}
        self._arrays: dict[str, np.ndarray] = {}

    def __getitem__(self, name: str) -> np.ndarray:
        if name not in self._arrays:
            self._arrays[name] = np.load(self.path / f"{name}.npy", mmap_mode="r", allow_pickle=False)
        return self._arrays[name]

    def has(self, name: str) -> bool:
        return (self.path / f"{name}.npy").exists()


class ServingData:
    """One model's field + products + embeddings, memory-mapped. Any of the three may be omitted."""

    def __init__(self, field_dir=None, products_dir=None, embeddings_dir=None, correction=None, bands=None):
        self.field = _Folder(field_dir) if field_dir else None
        self.products = _Folder(products_dir) if products_dir else None
        self.embeddings = _Folder(embeddings_dir) if embeddings_dir else None
        first = self.field or self.products or self.embeddings
        if first is None:
            raise ValueError("give at least one unpacked folder")
        self.lats = np.asarray(first["lats"], dtype="float64")
        self.lons = np.asarray(first["lons"], dtype="float64")
        self.model = first.meta.get("data_source", "unknown")
        for f in (self.field, self.products, self.embeddings):
            if f is not None and f.meta.get("data_source", self.model) != self.model:
                raise ValueError(f"{f.path} is from {f.meta.get('data_source')!r}, not {self.model!r}")
        self._dates = {k: {str(d): i for i, d in enumerate(f["dates"])}
                       for k, f in (("field", self.field), ("products", self.products),
                                    ("embeddings", self.embeddings)) if f is not None}
        self.bias = None
        if correction is not None:
            c = json.loads(Path(correction).read_text())
            if f"model_{c.get('model')}" != self.model:
                raise ValueError(f"correction is for {c.get('model')!r}, the files are {self.model!r}")
            if self.field is not None and [int(d) for d in c["depths"]] != [int(d) for d in self.field["depths"]]:
                raise ValueError("correction depths differ from the field's depths")
            self.bias = np.asarray(c["depth_bias"], dtype="float64")
            self.correction = c
        self.bands = None
        if bands is not None:
            b_path = Path(bands)
            if b_path.exists():
                self.bands = json.loads(b_path.read_text())

    # ---------------------------------------------------------------- lookups
    def _day(self, which: str, date: str) -> int:
        idx = self._dates[which]
        if date not in idx:
            ds = list(idx)
            raise KeyError(f"{date} not in the {which} file ({ds[0]} .. {ds[-1]}, {len(ds)} days)")
        return idx[date]

    def cell(self, lat: float, lon: float) -> tuple[int, int]:
        if not (self.lats[0] - 0.125 <= lat <= self.lats[-1] + 0.125
                and self.lons[0] - 0.125 <= lon <= self.lons[-1] + 0.125):
            raise ValueError(f"({lat}, {lon}) is outside {self.lats[0]}-{self.lats[-1]}N {self.lons[0]}-{self.lons[-1]}E")
        return int(np.abs(self.lats - lat).argmin()), int(np.abs(self.lons - lon).argmin())

    def dates(self, which: str = "field") -> list[str]:
        return list(self._dates[which])

    # ---------------------------------------------------------------- temperature
    def profile(self, lat: float, lon: float, date: str) -> dict[str, Any]:
        """15-level profile at the nearest cell: raw and (if a correction was given) Argo-corrected."""
        i, j = self.cell(lat, lon)
        raw = np.asarray(self.field["temperature"][self._day("field", date), :, i, j], dtype="float64")
        raw = np.where(self.field["valid_mask"][:, i, j], raw, np.nan)
        out = {"lat": float(self.lats[i]), "lon": float(self.lons[j]), "date": date,
               "depths_m": [int(d) for d in self.field["depths"]],
               "raw_c": [_clean(v) for v in raw], "is_ocean": bool(np.isfinite(raw).any()),
               "data_source": self.model}
        if self.bias is not None:
            out["corrected_c"] = [_clean(v) for v in raw - self.bias]
        return out

    def temperature_map(self, date: str, depth: int, corrected: bool = False) -> np.ndarray:
        """(101, 241) float32, NaN where there is no data. Convert NaN to None before JSON."""
        depths = [int(d) for d in self.field["depths"]]
        if int(depth) not in depths:
            raise KeyError(f"{depth} m is not one of {depths}")
        z = depths.index(int(depth))
        m = np.asarray(self.field["temperature"][self._day("field", date), z], dtype="float32")
        m = np.where(self.field["valid_mask"][z], m, np.nan)
        if corrected:
            if self.bias is None:
                raise ValueError("no correction loaded")
            m = m - np.float32(self.bias[z])
        return m

    # ---------------------------------------------------------------- products
    def product_map(self, name: str, date: str) -> np.ndarray:
        """(101, 241) float32 map of d20 / d26 / tchp / mld, as stored (rules already applied)."""
        if name not in PRODUCTS:
            raise KeyError(f"{name!r} is not one of {PRODUCTS}")
        return np.asarray(self.products[name][self._day("products", date)], dtype="float32")

    # ---------------------------------------------------------------- embeddings
    def regimes(self, date: str) -> dict[str, Any]:
        """Regime label map (-1 = land) with each regime's colour and mean profile, and the RGB map."""
        d = self._day("embeddings", date)
        e = self.embeddings
        return {"labels": np.asarray(e["cluster_labels"][d]), "rgb": np.asarray(e["rgb"][d]),
                "colors": np.asarray(e["cluster_colors"]), "profiles": np.asarray(e["cluster_profiles"]),
                "depths_m": [int(x) for x in e["depths"]]}

    def search_vector(self, lat: float, lon: float, date: str) -> np.ndarray | None:
        """The 16-number fingerprint at one cell, or None on land. Ocean cells are stored in
        ocean.ravel() order, so the row is the cell's rank among ocean cells."""
        i, j = self.cell(lat, lon)
        ocean = np.asarray(self.embeddings["ocean"])
        if not ocean[i, j]:
            return None
        row = int(ocean.ravel()[: i * ocean.shape[1] + j].sum())
        return np.asarray(self.embeddings["search_vectors"][self._day("embeddings", date), row], dtype="float32")
