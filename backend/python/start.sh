#!/bin/sh
export PYTHONPATH=".:$PYTHONPATH"
PORT="${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-${LISTEN_PORT:-8000}}}"

python3 main.py || python main.py || python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
