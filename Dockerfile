# Multi-stage Docker build for Node.js + Python FastAPI on Zoho Catalyst AppSail
FROM python:3.11-slim

# Install Node.js 20 and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY backend/python/requirements.txt ./backend/python/

# Install Node.js and Python dependencies
RUN npm ci
RUN python3 -m pip install --no-cache-dir -r ./backend/python/requirements.txt

# Copy source code
COPY . .

# Build Vite React SPA and compile Node.js TypeScript server
RUN npm run build

# Set permissions for launch script
RUN chmod +x start.sh

# AppSail port (overridden by X_ZOHO_CATALYST_LISTEN_PORT at runtime)
EXPOSE 3000

CMD ["sh", "start.sh"]
