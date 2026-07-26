#!/bin/sh

echo "============================================="
echo " Starting KSP Command Terminal AppSail Container"
echo "============================================="

# Resolve absolute path of project root directory dynamically
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Launch Python FastAPI AI Engine asynchronously in background (so port health check passes instantly)
(
  cd "$ROOT_DIR/backend/python" 2>/dev/null || exit 1
  if ! python3 -c "import uvicorn" 2>/dev/null; then
      echo "Installing Python requirements in background..."
      python3 -m pip install -r requirements.txt --quiet 2>/dev/null
  fi
  python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
) &

# 2. Immediately start Node.js Express Gateway on AppSail port
echo "Launching Node.js Express Gateway on port ${X_ZOHO_CATALYST_LISTEN_PORT:-3000}..."
cd "$ROOT_DIR" || exit 1
exec node dist/server.js
