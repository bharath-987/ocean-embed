# CLAUDE.md — Agent & Assistant Guidelines

> **IMPORTANT**: This repository operates under strict development and release rules. Refer to [AGENTS.md](file:///c:/Users/Asus/OneDrive/Documents/Projects/ocean-embed/AGENTS.md) for full protocol details.

---

## 1. Non-Negotiable Directives

1. **NO COMMITS WITHOUT RIGOROUS TESTING**:
   - Never commit or push changes to git/remote unless all relevant verification checks (lint/syntax, backend endpoints, UI gating, edge cases) pass 100%.
   - Broken or partially working code must never enter the git history.

2. **UPDATE `TODO.md` AFTER EVERY SINGLE TASK**:
   - The user will not remind you.
   - Every task completed must be immediately logged and marked done in [TODO.md](file:///c:/Users/Asus/OneDrive/Documents/Projects/ocean-embed/TODO.md) with details on changes and verification.

3. **MAINTAIN `RESEARCH.md`**:
   - Keep [RESEARCH.md](file:///c:/Users/Asus/OneDrive/Documents/Projects/ocean-embed/RESEARCH.md) synchronized with technical insights, architectural specs, API contracts, and oceanographic formulas.

---

## 2. Common Commands

- **Start ML Backend**:
  ```powershell
  cd D:\oceanembed_handoff
  python -m uvicorn api_server:app --host 0.0.0.0 --port 8000
  ```
- **Start Frontend Server**:
  ```powershell
  cd c:\Users\Asus\OneDrive\Documents\Projects\ocean-embed
  npm run dev
  # Serves at http://localhost:5500
  ```
- **Test Backend API Health**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:8000/temperature-grid?date=2023-10-22&depth=200"
  Invoke-RestMethod -Uri "http://localhost:8000/parameter-grid?param=ssh&date=2023-10-22"
  ```
- **Check Git Status**:
  ```powershell
  git status
  git diff
  ```

---

## 3. Architecture & Functional Gating Summary

- **App Name**: Kyogre (formerly OceanEmbed).
- **Core Purpose**: High-resolution 3D subsurface ocean temperature profile reconstruction and 2D satellite surface parameter visualization across the North Indian Ocean (5°N–30°N, 45°E–105°E).
- **Gating Matrix**:
  - **Subsurface Heatmap Overlay**: Gated on `Date + Depth` (Location NOT required).
  - **Surface Parameter Overlays**: Gated on `Parameter Selection` (Automatically locks depth to `0 m (Surface)` and displays real 2D spatial slice).
  - **TVD Table/Graph & Top 4 Stat Cards**: Strictly gated on `Location + Date`.
