"""Single shared AI client for the entire app.

Every AI-backed feature (bill OCR, daily-sheet OCR, and anything added later)
must go through `extract_json` below. This is intentionally the *only* place
in the codebase that talks to an AI provider. The model itself is selected
purely via the OCR_MODEL_ID env var/config value — never reference the
underlying model by name anywhere else (code, UI copy, logs, comments).
"""

import base64
import json
import logging
import re

from anthropic import AsyncAnthropic

from app.config import get_settings

logger = logging.getLogger("ocr_client")

settings = get_settings()
_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    return match.group(1) if match else text


def _extract_first_json_object(text: str) -> str:
    text = _strip_code_fence(text)
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    for i, ch in enumerate(text[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]


async def _call_model(prompt: str, image_b64: str | None, media_type: str | None, max_tokens: int) -> str:
    content: list[dict] = []
    if image_b64:
        content.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type or "image/jpeg", "data": image_b64},
            }
        )
    content.append({"type": "text", "text": prompt})

    response = await _get_client().messages.create(
        model=settings.ocr_model_id,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": content}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


async def extract_json(
    prompt: str,
    image_bytes: bytes | None = None,
    media_type: str = "image/jpeg",
    max_tokens: int = 8192,
) -> dict:
    """Send a prompt (optionally with an image) to the configured OCR model and
    parse the first JSON object out of its reply. Retries once, with a
    completely fresh request, if the first reply doesn't parse as JSON.
    """
    image_b64 = base64.b64encode(image_bytes).decode("utf-8") if image_bytes else None

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            raw = await _call_model(prompt, image_b64, media_type, max_tokens)
            return json.loads(_extract_first_json_object(raw))
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            logger.warning("OCR JSON parse failed on attempt %d: %s", attempt + 1, exc)

    raise ValueError(f"OCR extraction failed to produce valid JSON after retry: {last_error}")
