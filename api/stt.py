"""
api/stt.py - Speech-to-Text qua Groq Whisper (mien phi, nhanh).

Fallback cho trinh duyet khong ho tro Web Speech API (Firefox, Chrome iOS).
Tren Chrome/Safari desktop, STT chay truc tiep trong trinh duyet, endpoint
nay khong can duoc goi.
"""

import os
import tempfile

from fastapi import HTTPException, UploadFile

import config


async def transcribe_upload(audio: UploadFile) -> dict:
    """Nhan file am thanh tu trinh duyet, tra ve van ban qua Groq Whisper."""

    if not config.GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Voice upload requires GROQ_API_KEY. Add it to your .env file.",
        )

    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")

    suffix = ".webm"
    if audio.filename and "." in audio.filename:
        suffix = "." + audio.filename.rsplit(".", 1)[-1].lower()

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)

        with open(tmp_path, "rb") as audio_file:
            result = client.audio.transcriptions.create(
                model="whisper-large-v3-turbo",
                file=(audio.filename or f"audio{suffix}", audio_file),
                language="en",
                response_format="text",
            )

        text = (result if isinstance(result, str) else getattr(result, "text", "")).strip()
        if not text:
            return {"text": None, "error": "Could not understand audio"}
        return {"text": text}

    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
