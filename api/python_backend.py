import sys
from pathlib import Path

# Ensure Python can resolve imports relative to the backend/python directory on Vercel
python_backend_path = Path(__file__).parent.parent / "backend" / "python"
sys.path.append(str(python_backend_path))

from main import app
