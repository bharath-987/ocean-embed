#!/usr/bin/env python3
"""
test_regression_guard.py — Strict Regression Guard for Stale Benchmarks & Strings

Fails if any banned stale strings appear in customer-facing files:
- "0.75" (stale RMSE from obsolete early prototype)
- "+20.0" (stale skill score claim)
- "41 floats" (stale float count, superseded by 81 floats Jun-Dec / 92 full-year)
- "615" or "615 points" (stale point count, superseded by 24,185 points)
"""

import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Banned strings and their human-readable explanations
BANNED_PATTERNS = [
    ("0.75", "Stale 0.75°C RMSE figure (superseded by 1.00°C raw / 0.90°C corrected in-window, 0.94°C full-year)"),
    ("+20.0", "Stale +20.0% skill claim (superseded by +41.4% raw skill / +52.6% corrected)"),
    ("41 floats", "Stale 41 floats count (superseded by 81 floats Jun-Dec / 92 full-year 2023)"),
    ("615 points", "Stale 615 points count (superseded by 24,185 depth points)"),
    ("615", "Stale 615 points reference"),
]

# Customer-facing files and directories to guard
CUSTOMER_FACING_FILES = [
    "explore.html",
    "argo.html",
    "fisheries.html",
    "marine-ecology.html",
    "fingerprint.html",
    "index.html",
    "app.js",
    "argo.js",
    "fisheries.js",
    "marine-ecology.js",
    "fingerprint.js",
    "README.md",
    "PITCH.md",
]

CUSTOMER_FACING_DIRS = [
    os.path.join("src", "components"),
]

# Files explicitly exempt (e.g. this test itself, historical changelogs/research archives)
EXEMPT_FILES = {
    "test_regression_guard.py",
    "TODO.md",
    "RESEARCH.md",
    "AGENTS.md",
}


def check_file(filepath):
    errors = []
    if os.path.basename(filepath) in EXEMPT_FILES:
        return errors

    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    for line_idx, line in enumerate(lines, 1):
        # Ignore comments or markdown links to old commits if any
        for pattern, explanation in BANNED_PATTERNS:
            if pattern in line:
                # Special exemption: Chart.js barPercentage: 0.75 or opacity 0.75 or rgb alpha 0.75
                # We only ban 0.75 when used as an accuracy/RMSE metric, or literal "0.75" / 0.75°C
                if pattern == "0.75":
                    # Check if it's CSS/canvas styling like opacity: 0.75, barPercentage: 0.75, or stop: 0.75
                    is_css_or_chart = any(css_kw in line for css_kw in [
                        "barPercentage", "opacity", "stop", "{ t: 0.75", "rgba(", "0.75 *", "0.75)"
                    ])
                    if is_css_or_chart:
                        continue
                if pattern == "615":
                    # Only ban when referring to profiles / points / floats count
                    # e.g., "615 profiles", "615 points", "615 observations", "615 depth"
                    is_data_count = any(kw in line.lower() for kw in [
                        "profile", "point", "float", "sample", "615 "
                    ])
                    if not is_data_count:
                        continue

                errors.append({
                    "file": filepath,
                    "line": line_idx,
                    "text": line.strip(),
                    "pattern": pattern,
                    "explanation": explanation
                })

    return errors


def main():
    root = os.path.abspath(os.path.dirname(__file__))
    all_errors = []

    # Check top-level customer files
    for filename in CUSTOMER_FACING_FILES:
        filepath = os.path.join(root, filename)
        if os.path.exists(filepath):
            all_errors.extend(check_file(filepath))

    # Check src components
    for dir_path in CUSTOMER_FACING_DIRS:
        full_dir = os.path.join(root, dir_path)
        if os.path.exists(full_dir):
            for fname in os.listdir(full_dir):
                if fname.endswith((".tsx", ".ts", ".jsx", ".js")):
                    filepath = os.path.join(full_dir, fname)
                    all_errors.extend(check_file(filepath))

    print("=" * 70)
    print("REGRESSION GUARD TEST — BANNED STALE BENCHMARKS")
    print("=" * 70)

    if not all_errors:
        print("PASS: Zero occurrences of banned stale strings found across all customer-facing files.")
        print(f"Checked {len(CUSTOMER_FACING_FILES)} primary files and {len(CUSTOMER_FACING_DIRS)} directories.")
        return 0

    print(f"FAILED: Found {len(all_errors)} occurrences of banned stale strings:")
    for err in all_errors:
        print(f"  - [{err['file']}:{err['line']}] Found '{err['pattern']}': {err['text']}")
        print(f"    Explanation: {err['explanation']}")
    print("=" * 70)
    return 1


if __name__ == "__main__":
    sys.exit(main())
