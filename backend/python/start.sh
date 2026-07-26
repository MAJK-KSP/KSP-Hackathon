#!/bin/sh
export PYTHONPATH=".:$PYTHONPATH"
PORT="${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-${LISTEN_PORT:-8000}}}"

# Install requirements if not present
if ! python3 -c "import uvicorn" 2>/dev/null; then
    echo "Installing requirements..."
    python3 -m pip install -r requirements.txt
fi

python3 main.py || python main.py || python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
