"""CI-only launcher serving app.testing:build_test_app() (real app, fake Gemini
client via dependency override) for deterministic acceptance runs (e.g. Bruno).
Never used in production; requires ENVIRONMENT=test and a real TEST_DATABASE_URL.

Usage:
    uv run --directory apps/api python -m scripts.run_test_harness [--host 127.0.0.1] [--port 8000]
"""

import argparse

import uvicorn

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    if settings.environment != 'test':
        raise SystemExit('run_test_harness requires ENVIRONMENT=test')
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    uvicorn.run('app.testing:build_test_app', host=args.host, port=args.port, factory=True, log_level='info')


if __name__ == '__main__':
    main()
