# Symphony Music Dashboard — Hugging Face Spaces Dockerfile
# Serves Next.js frontend and FastAPI backend on a single port (7860) for HF Spaces compatibility.

FROM python:3.11-slim

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        gnupg && \
    # Install Node.js 20
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Copy entire project ──────────────────────────────────────────────────────
COPY . .

# ── Python dependencies ──────────────────────────────────────────────────────
RUN pip install --no-cache-dir -r api/requirements.txt && \
    pip install --no-cache-dir -r collector/requirements.txt

# ── Build Next.js frontend ───────────────────────────────────────────────────
WORKDIR /app/frontend
RUN npm ci && npm run build

# ── Startup script ───────────────────────────────────────────────────────────
RUN cat > /app/start.sh <<'EOF'
#!/bin/bash
set -e

# Start the FastAPI backend in the background on port 8000
cd /app/api
uvicorn main:app --host 127.0.0.1 --port 8000 &

# Start the Next.js frontend in the foreground on port 7860
# Next.js will automatically proxy /api to the FastAPI backend
cd /app/frontend
export PORT=7860
exec npm start
EOF
RUN chmod +x /app/start.sh

# Set correct permissions for Hugging Face Spaces (user 1000)
RUN chmod -R 777 /app
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /app

EXPOSE 7860

CMD ["/app/start.sh"]
