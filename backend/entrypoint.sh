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

# Determine effective listening port: default to 7860 for Hugging Face Spaces,
# or dynamically adapt to $PORT provided by Render at runtime
APP_PORT="${PORT:-7860}"

# If CMD starts uvicorn, rewrite --port argument to match dynamic $APP_PORT
if [ "$1" = "uvicorn" ]; then
    NEW_ARGS=""
    SKIP_NEXT=0
    for arg in "$@"; do
        if [ "$SKIP_NEXT" -eq 1 ]; then
            NEW_ARGS="$NEW_ARGS $APP_PORT"
            SKIP_NEXT=0
        elif [ "$arg" = "--port" ]; then
            NEW_ARGS="$NEW_ARGS --port"
            SKIP_NEXT=1
        else
            NEW_ARGS="$NEW_ARGS $arg"
        fi
    done
    if [ "$SKIP_NEXT" -eq 1 ]; then
        NEW_ARGS="$NEW_ARGS $APP_PORT"
    fi
    exec $NEW_ARGS
fi

# Start the application passed via CMD
exec "$@"

