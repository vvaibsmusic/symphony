# Symphony Music Dashboard — Hugging Face Spaces Dockerfile
# Serves static Next.js frontend via nginx and FastAPI backend via uvicorn
# on a single port (7860) for HF Spaces compatibility.

FROM python:3.11-slim

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        nginx && \
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

# ── Nginx configuration (port 7860) ──────────────────────────────────────────
RUN cat > /etc/nginx/sites-available/default <<'EOF'
server {
    listen 7860;
    server_name _;

    # Proxy API requests to the FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy everything else to Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# ── Startup script ───────────────────────────────────────────────────────────
RUN cat > /app/start.sh <<'EOF'
#!/bin/bash
set -e

# Start nginx in the background
nginx -g 'daemon off;' &

# Start the Next.js frontend in the background
cd /app/frontend
npm start &

# Start the FastAPI backend in the foreground
cd /app/api
exec uvicorn main:app --host 0.0.0.0 --port 8000
EOF
RUN chmod +x /app/start.sh

WORKDIR /app

EXPOSE 7860

CMD ["/app/start.sh"]
