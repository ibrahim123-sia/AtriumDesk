"""
transcribe.py — Local speech-to-text via faster-whisper.

Replaces AssemblyAI for voice-message transcription. The model is loaded
once on first use and reused for subsequent requests.

Output:
  {
    "success": bool,
    "text": str,
    "language": str,
    "duration": float,   # seconds
    "service": "whisper",
    "error": str | None,
  }
"""

from __future__ import annotations  # For modern typing annotations in older Python runtimes

import os             # For verifying if the audio file exists at the given path
from typing import Optional  # For using Optional type hint for the language parameter

import config         # Local application configuration for Whisper model parameters



_model = None


def _get_model():
    """Lazy-load the Whisper model; cached for the process lifetime."""
    global _model
    if _model is not None:
        return _model

    from faster_whisper import WhisperModel  # Local Whisper speech-to-text model for transcribing voice messages


    print(f"Loading Whisper model: {config.WHISPER_MODEL} "
          f"(device={config.WHISPER_DEVICE}, compute={config.WHISPER_COMPUTE_TYPE})")
    _model = WhisperModel(
        config.WHISPER_MODEL,
        device=config.WHISPER_DEVICE,
        compute_type=config.WHISPER_COMPUTE_TYPE,
    )
    print("  Whisper model ready")
    return _model


def transcribe_audio(file_path: str, language: Optional[str] = None) -> dict:
    """Transcribe an audio file.

    `language` is an optional ISO-639-1 code ("en", "ur"). If omitted, Whisper
    auto-detects. For Roman-Urdu speech, Whisper recognises the audio as Urdu
    and writes it in the Urdu script — we let the caller decide what to do
    with that (the chatbot's language detector handles the response side).
    """
    if not os.path.exists(file_path):
        return {
            "success": False,
            "text": "",
            "language": "",
            "duration": 0.0,
            "service": "whisper",
            "error": "Audio file not found",
        }

    try:
        model = _get_model()
        segments, info = model.transcribe(
            file_path,
            language=language,
            beam_size=1,           # greedy; faster on CPU
            vad_filter=True,       # skip silence
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()

        if not text:
            return {
                "success": False,
                "text": "",
                "language": info.language if info else "",
                "duration": float(info.duration) if info else 0.0,
                "service": "whisper",
                "error": "No speech detected",
            }

        return {
            "success": True,
            "text": text,
            "language": info.language,
            "duration": float(info.duration),
            "service": "whisper",
            "error": None,
        }
    except Exception as exc:
        return {
            "success": False,
            "text": "",
            "language": "",
            "duration": 0.0,
            "service": "whisper",
            "error": f"Transcription failed: {exc}",
        }
