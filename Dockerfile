# ==============================================================================
# Kyogre Backend — Hugging Face Space Dockerfile (Custom Docker SDK)
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing .pyc files and ensure immediate stdout/stderr flush
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    USE_FULL_FLOAT16_DATA=true \
    HF_DATASET_REPO_ID="bharath-987/ocean-embed-data" \
    PORT=7860 \
    HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Create non-root user with UID 1000 (Mandatory requirement for Hugging Face Spaces)
RUN useradd -m -u 1000 user

WORKDIR /app

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies from repo requirements.txt
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Copy backend application code into /app
COPY --chown=user:user backend/ /app/

# Ensure entrypoint script has execution permissions and clean LF line endings
RUN chmod +x /app/entrypoint.sh && sed -i 's/\r$//' /app/entrypoint.sh

# Ensure the non-root user owns the application directory and float16 data destination
RUN mkdir -p /app/data/float16 && chown -R user:user /app

# Switch to non-root user
USER user

# Expose Hugging Face Space default HTTP port
EXPOSE 7860

# Run entrypoint script to verify dataset before starting uvicorn
ENTRYPOINT ["/app/entrypoint.sh"]

# Launch FastAPI backend with Uvicorn on 0.0.0.0:7860
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "7860"]
