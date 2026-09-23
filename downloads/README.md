# Static NetCDF Dataset Downloads

This directory documents static downloadable dataset archives for the Kyogre Ocean Intelligence platform.

## File Information
- **Filename**: `oceanembed_v6_satswap_anom_14yr_2023.nc`
- **File Size**: 173,669,183 bytes (~173.7 MB / 165.62 MiB)
- **SHA-256 Checksum**: `b462e9d99fc0e5e9e4e73c0ac8534f6b51fb797a5063c89d3a07d9b48415be47`
- **Format**: NetCDF-4 (HDF5 data model)
- **Domain**: North Indian Ocean (5.0°N–30.0°N, 45.0°E–105.0°E at 0.25° resolution, 101 × 241 grid)
- **Depths**: 15 standard levels (`0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000 m`)
- **Temporal Coverage**: Full calendar year 2023 (365 days, `2023-01-01` to `2023-12-31`)
- **Variables**:
  - `temperature_corrected`: 3D subsurface temperature with depth-specific Argo empirical bias correction applied (recommended for general use).
  - `temperature_raw`: 3D subsurface temperature direct model reconstruction (uncorrected).
  - `d20`: 20°C isotherm depth (m).
  - `d26`: 26°C isotherm depth (m).
  - `tchp`: Tropical Cyclone Heat Potential (kJ/cm²).
  - `mld`: Mixed Layer Depth (m).
  - Coordinate dimensions: `time`, `depth`, `lat`, `lon`.

## Hosting & Production Architecture

### Production Direct Download URL
- **Hugging Face Dataset Repository**: `bharath-987/ocean-embed-data`
- **Direct HTTPS Resolve URL**:
  `https://huggingface.co/datasets/bharath-987/ocean-embed-data/resolve/main/oceanembed_v6_satswap_anom_14yr_2023.nc`
- **CDN Edge Delivery**: Hugging Face datasets automatically route through AWS CloudFront / HF CDN (`application/x-netcdf`), supporting resumable byte-range downloads and high throughput worldwide.

### Local Development vs Production Access
- **Production / Deployed Site**:
  The static HTML (`explore.html`) links directly to the Hugging Face HTTPS download URL (`#btn-download-netcdf`), ensuring reliable downloads on any hosting platform (Render, Vercel, Netlify, HF Spaces) without requiring the 173.7 MB binary in the git tree.
- **Local Dev Fallback**:
  In local development (`localhost` or `127.0.0.1`), `app.js` issues a `HEAD` request to `downloads/oceanembed_v6_satswap_anom_14yr_2023.nc`. If the file exists on the local dev server, the button's `href` automatically points to the local copy for instant 0ms local access. If the local file is not present, it stays pointing to the Hugging Face URL.
- **Git Exclusions**:
  `.nc` files remain excluded via `.gitignore` (`*.nc`) to comply with GitHub's 100 MB per-file limit.
