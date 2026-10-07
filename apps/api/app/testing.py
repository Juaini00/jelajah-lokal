"""Test-only harness. Never imported by the production request path (app.main).

Provides a deterministic fake Gemini client and a FastAPI app factory that
overrides the real `get_gemini_client` dependency with it via pure dependency
injection. Used by pytest fixtures and the CI-only `scripts/run_test_harness.py`
launcher for acceptance testing (e.g. Bruno) against deterministic AI output.
Never used by `app.main:app` and never enabled by an environment flag.
"""

from fastapi import FastAPI

from app.main import create_app
from app.services.gemini import get_gemini_client

FIXTURE_EXCERPT = 'Ringkasan uji deterministik untuk artikel ini, disiapkan khusus oleh rangkaian uji otomatis tanpa memanggil Gemini sungguhan sama sekali.'
FIXTURE_META_DESCRIPTION = 'Deskripsi meta uji deterministik yang dipakai oleh rangkaian pengujian penerimaan otomatis untuk memverifikasi alur asisten editorial end-to-end.'
FIXTURE_TAGS = ['uji-coba', 'deterministik', 'editorial']


class FakeGeminiClient:
    """Deterministic double implementing the GeminiClient protocol."""

    def count_tokens(self, text: str) -> int:
        return max(1, len(text.split()))

    def generate_metadata(self, text: str) -> dict:
        return {
            'excerpt': FIXTURE_EXCERPT,
            'metaDescription': FIXTURE_META_DESCRIPTION,
            'suggestedTags': list(FIXTURE_TAGS),
        }

    def generate_review(self, text: str) -> dict:
        # One claim quoted from the article and one invented sentence, so grounding is exercised.
        quote = ' '.join(text.split()[:6])
        return {
            'summary': 'Artikel cukup lengkap; periksa klaim yang ditandai sebelum terbit.',
            'claims': [
                {'quote': quote, 'kind': 'lainnya', 'note': 'Pastikan pernyataan ini masih akurat.'},
                {'quote': 'Tiket masuk Rp50.000 per orang.', 'kind': 'harga', 'note': 'Kalimat ini tidak ada di artikel.'},
            ],
            'gaps': [{'topic': 'Akses', 'suggestion': 'Tambahkan cara menuju lokasi.'}],
        }


def build_test_app() -> FastAPI:
    app = create_app()
    app.dependency_overrides[get_gemini_client] = lambda: FakeGeminiClient()
    return app
