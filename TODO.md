# TODO.md — Task Tracking & Verification Log

> [!IMPORTANT]
> **MANDATORY PROTOCOL**: This file **MUST** be updated after **EVERY SINGLE TASK** without exception or user reminder.
> Record status, files changed, and verification evidence for every item.

---

## Current Active Task

- [x] **Git Commit & Push to GitHub Remote** `[Completed 2026-09-06]`
  - Completed pre-commit verification checklist via `python test_system.py` with 100% pass across all tests.
  - Staged all changes: UI redesign (Kyogre branding, top stat cards, date picker, depth selector, decoupled heatmap, ocean parameter overlays), documentation (`AGENTS.md`, `CLAUDE.md`, `RESEARCH.md`, `TODO.md`), startup scripts, and test suite.
  - Pushed to `https://github.com/bharath-987/ocean-embed` master branch.

- [x] **Setup Agent Protocols & System Documentation** `[Completed 2026-09-06]`
  - Created [AGENTS.md](file:///c:/Users/Asus/OneDrive/Documents/Projects/ocean-embed/AGENTS.md) establishing the non-negotiable rule: **NO git commits or pushes without rigorous testing**, mandatory pre-commit verification checklists, and rules for maintaining `TODO.md` and `RESEARCH.md`.
  - Created [CLAUDE.md](file:///c:/Users/Asus/OneDrive/Documents/Projects/ocean-embed/CLAUDE.md) providing quick reference commands, key architecture points, and testing requirements.
  - Created [RESEARCH.md](file:///c:/Users/Asus/OneDrive/Documents/Projects/ocean-embed/RESEARCH.md) documenting the complete technical architecture, 15 depth levels, 0.25° grid specs, 6 surface parameters, oceanographic formulas (MLD, OHC₃₀₀, SVAD), and API contracts.
  - Created [TODO.md](file:///c:/Users/Asus/OneDrive/Documents/Projects/ocean-embed/TODO.md) for continuous progress tracking.

---

## Completed Tasks

### 1. Ocean Parameters, Depth, and Heatmap Decoupling
- **Status**: Completed `[2026-09-06]`
- **Requirements**:
  1. None of the 6 surface parameter tiles pre-selected on initial load (clean state).
  2. Clicking ANY surface parameter card auto-locks Depth to `0 m (Surface)` and displays that parameter's 2D spatial raster overlay with appropriate colorscale and legend.
  3. Subsurface temperature heatmap decoupled from location (gated ONLY on `Date + Depth`).
  4. Point-specific data (TVD Table/Graph & Top 4 Stat Cards) strictly gated on `Location + Date`.
- **Files Modified**:
  - `explore.html` (cleaned initial tile classes, verified depth select & legend elements)
  - `app.js` (implemented `selectedParam`, `paramToColor`, `generateParamGridCanvas`, auto-lock depth to 0m, updated `checkAndRefreshHeatmap` gating)
  - `D:\oceanembed_handoff\api_server.py` (added `/parameter-grid` and `/temperature-grid` endpoints)
- **Verification**: Tested backend endpoints via REST calls; verified grid generation for SST, SSH, SSS, SLA, Current, Wind, and temperature slices at multiple depths.

### 2. Depth Dropdown on Map & Heatmap Gating
- **Status**: Completed `[2026-09-06]`
- **Requirements**:
  1. Top-left map dropdown with 15 standard ocean depths (0 to 1000m).
  2. Default placeholder: `"Select depth"`.
  3. Heatmap gated until depth selection.
- **Files Modified**: `explore.html`, `app.js`, `style.css`
- **Verification**: Dropdown click and change handlers verified; depth switching updates overlay and legend ticks adaptively.

### 3. Header Repositioning & Date Picker Popover Fix
- **Status**: Completed `[2026-09-06]`
- **Requirements**:
  1. Swap Date (left) and Live Data (right) in header.
  2. Fix non-responsive date dropdown click handler with custom date picker button and native calendar popover.
  3. Restrict date range to Jan 1, 2021 – Dec 31, 2023 with default placeholder `"Select date"`.
- **Files Modified**: `explore.html`, `app.js`, `style.css`
- **Verification**: Verified calendar popover opens on button click; dates outside range or prior to day 10 properly guarded.

### 4. Stat Cards Redesign & Subtext Removal
- **Status**: Completed `[2026-09-06]`
- **Requirements**:
  1. Top 4 cards: Mixed Layer Depth (MLD), Ocean Heat Content (OHC₃₀₀), Sound Velocity Depth, RMSE.
  2. Remove all caption subtext below cards (show only icon, label, and value).
- **Files Modified**: `explore.html`, `app.js`, `style.css`
- **Verification**: Clean rounded cards rendered with colored icon chips and no subtext.

### 5. Kyogre Rebranding
- **Status**: Completed `[2026-09-06]`
- **Requirements**:
  1. Replace "OceanEmbed" with bold blue "Kyogre" wordmark.
  2. Remove sub-taglines.
  3. Update footer copyright to "© 2025 Kyogre. All rights reserved." and add satellite data disclaimer note.
- **Files Modified**: `explore.html`, `index.html`, `style.css`
- **Verification**: Verified typography, layout, and footer copyright notes across pages.

---

## Upcoming & Backlog Tasks

- [x] **Automated Testing Suite (`test_system.py`)** `[Completed 2026-09-06]`
  - Created automated test suite validating `/predict`, `/temperature-grid` (0m, 100m, 200m, 1000m), and `/parameter-grid` (all 6 parameters: SST, SSH, SSS, SLA, Current, Wind).
  - Validates DOM elements, HTML structure, JavaScript declarations, and decoupled gating rules.
- [ ] **Performance & Canvas Optimization**
  - Benchmark canvas generation latency for 101×241 grids.
  - Consider WebGL shader raster overlay or OffscreenCanvas web workers if high-frequency scrubbing is required.
- [ ] **Mobile & Responsive Layout Polish**
  - Verify map legend, depth dropdown, and TVD drawer responsiveness on viewports < 768px.
- [ ] **Pre-Release Rigorous Verification Protocol**
  - Run `python test_system.py` before preparing any git commit or push to remote.

---

## Verification & Testing Record

| Date | Scope / Feature | Test Type | Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 2026-09-06 | `/temperature-grid` (Depth 200m) | REST API via PowerShell | **PASS** | Returns 101×241 grid slice correctly |
| 2026-09-06 | `/parameter-grid` (`ssh`) | REST API via PowerShell | **PASS** | Returns 101×241 SSH anomaly slice |
| 2026-09-06 | Gating decoupling in `app.js` | Code analysis & verification | **PASS** | Heatmap relies on Date+Layer; TVD relies on Location+Date |
| 2026-09-06 | Agent protocol files setup | File verification | **PASS** | `AGENTS.md`, `CLAUDE.md`, `RESEARCH.md`, `TODO.md` created |
| 2026-09-06 | Full System & API Suite | `python test_system.py` | **PASS** | All API endpoints, DOM hooks, 6 params & 4 depth slices verified |
