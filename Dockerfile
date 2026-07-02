# Symphony Music Dashboard — Hugging Face Spaces Dockerfile
# Serves Next.js frontend and FastAPI backend on a single port (7860) for HF Spaces compatibility.

FROM python:3.11-slim

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget \
        gnupg && \
    # Install Node.js 20
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    # Install Go 1.22
    wget https://go.dev/dl/go1.22.4.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.22.4.linux-amd64.tar.gz && \
    rm go1.22.4.linux-amd64.tar.gz && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV PATH=$PATH:/usr/local/go/bin

WORKDIR /app

# ── Copy entire project ──────────────────────────────────────────────────────
COPY . .

# ── Python dependencies ──────────────────────────────────────────────────────
RUN pip install --no-cache-dir -r api/requirements.txt

# ── Build Go binary ──────────────────────────────────────────────────────────
WORKDIR /app/collector_go
RUN CGO_ENABLED=0 go build -o youtube_enricher

# ── Build Next.js frontend ───────────────────────────────────────────────────
WORKDIR /app/frontend
ENV NEXT_PUBLIC_API_URL=""
RUN npm ci && npm run build

# ── Startup script ───────────────────────────────────────────────────────────
RUN cat > /app/start.sh <<'EOF'
#!/bin/bash
set -e

# Start the FastAPI backend in the background on port 8000
cd /app/api
uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/uvicorn.log 2>&1 &

# Wait for backend to be ready before starting frontend
echo "Waiting for backend..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8000/api/stats > /dev/null 2>&1; then
        echo "Backend is ready!"
        break
    fi
    sleep 1
done

# Start the Next.js frontend in the foreground on port 7860
cd /app/frontend
export PORT=7860
export HOSTNAME=0.0.0.0
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
