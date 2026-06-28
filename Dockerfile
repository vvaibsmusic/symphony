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

# ── Build Next.js static frontend ────────────────────────────────────────────
WORKDIR /app/frontend
RUN npm ci && npm run build

# ── Deploy static assets to nginx ────────────────────────────────────────────
RUN rm -rf /var/www/html/* && \
    cp -r /app/frontend/out/* /var/www/html/

# ── Nginx configuration (port 7860) ──────────────────────────────────────────
RUN cat > /etc/nginx/sites-available/default <<'EOF'
server {
    listen 7860;
    server_name _;

    root /var/www/html;
    index index.html;

    # Proxy API requests to the FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA routing — serve static files, fall back to index.html
    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }
}
EOF

# ── Startup script ───────────────────────────────────────────────────────────
RUN cat > /app/start.sh <<'EOF'
#!/bin/bash
set -e

# Start nginx in the background
nginx -g 'daemon off;' &

# Start the FastAPI backend
cd /app/api
exec uvicorn main:app --host 0.0.0.0 --port 8000
EOF
RUN chmod +x /app/start.sh

WORKDIR /app

EXPOSE 7860

CMD ["/app/start.sh"]
