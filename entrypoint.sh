#!/bin/sh
set -e

# ==============================================================================
# Kyogre Container Entrypoint — Dataset Ingestion & Service Startup
# ==============================================================================

# Verify and download full float16 dataset if running in float16 mode
if [ "$USE_FULL_FLOAT16_DATA" = "true" ] || [ "$USE_FLOAT16_DATA" = "true" ]; then
    echo "================================================================="
    echo "  Container Startup: Checking Float16 Dataset Readiness..."
    echo "================================================================="
    python fetch_data.py
fi

# Start the application passed via CMD
exec "$@"
