import json
from functools import lru_cache
from typing import Protocol

from fastapi import Depends

from app.config import Settings, get_settings


class GeminiError(Exception):
    pass


class GeminiTimeout(GeminiError):
    pass


class GeminiRateLimited(GeminiError):
    pass


class GeminiProviderError(GeminiError):
    pass


class GeminiInvalidOutput(GeminiError):
    pass


class GeminiTooManyTokens(GeminiError):
    def __init__(self, tokens: int):
        self.tokens = tokens
        super().__init__(f'{tokens} tokens exceeds budget')


PROMPT_TEMPLATE = (
    'Anda adalah asisten editorial Jelajah Lokal. Berdasarkan isi artikel berikut (bahasa Indonesia), '
    'hasilkan metadata ringkas dan akurat tanpa klaim operasional baru. Jangan menambahkan informasi yang '
    'tidak ada pada teks.\n\nArtikel:\n{text}'
)

RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'excerpt': {'type': 'STRING'},
        'metaDescription': {'type': 'STRING'},
        'suggestedTags': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
    },
    'required': ['excerpt', 'metaDescription', 'suggestedTags'],
}


class GeminiClient(Protocol):
    def count_tokens(self, text: str) -> int: ...

    def generate_metadata(self, text: str) -> dict: ...


class RealGeminiClient:
    def __init__(self, settings: Settings):
        from google import genai

        self._settings = settings
        self._client = genai.Client(api_key=settings.gemini_api_key.get_secret_value())
        self._model = settings.gemini_model

    def count_tokens(self, text: str) -> int:
        try:
            result = self._client.models.count_tokens(model=self._model, contents=text)
        except Exception as exc:
            raise GeminiProviderError(str(exc)) from exc
        return int(result.total_tokens)

    def generate_metadata(self, text: str) -> dict:
        from google.genai import types

        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=PROMPT_TEMPLATE.format(text=text),
                config=types.GenerateContentConfig(
                    response_mime_type='application/json',
                    response_schema=RESPONSE_SCHEMA,
                    max_output_tokens=self._settings.ai_max_output_tokens,
                    temperature=0.2,
                    http_options=types.HttpOptions(timeout=self._settings.ai_timeout_ms),
                ),
            )
        except TimeoutError as exc:
            raise GeminiTimeout(str(exc)) from exc
        except Exception as exc:
            message = str(exc).lower()
            if 'rate' in message or '429' in message:
                raise GeminiRateLimited(str(exc)) from exc
            raise GeminiProviderError(str(exc)) from exc
        text_out = getattr(response, 'text', None)
        if not text_out:
            raise GeminiInvalidOutput('Empty provider response')
        try:
            payload = json.loads(text_out)
        except ValueError as exc:
            raise GeminiInvalidOutput('Provider response was not valid JSON') from exc
        if not isinstance(payload, dict) or not all(k in payload for k in ('excerpt', 'metaDescription', 'suggestedTags')):
            raise GeminiInvalidOutput('Provider response missing required fields')
        return payload


@lru_cache
def _cached_client(model: str, api_key: str) -> RealGeminiClient:
    return RealGeminiClient(get_settings())


def get_gemini_client(settings: Settings = Depends(get_settings)) -> GeminiClient:
    return _cached_client(settings.gemini_model, settings.gemini_api_key.get_secret_value())
