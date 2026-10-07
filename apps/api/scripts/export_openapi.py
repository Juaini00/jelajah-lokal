"""Export the live FastAPI OpenAPI schema to contracts/openapi.json.

Usage:
    uv run --directory apps/api python -m scripts.export_openapi
"""

import json
from pathlib import Path

from app.main import app

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / 'contracts' / 'openapi.json'


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Wrote {OUTPUT}')


if __name__ == '__main__':
    main()
