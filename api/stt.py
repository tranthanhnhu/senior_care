"""
api/stt.py - Speech-to-Text qua OpenAI Whisper (fallback cho Chrome tren iPhone).

Apple chi cho phep Web Speech API tren Safari iOS. Chrome/Firefox tren iPhone
khong co SpeechRecognition -> ghi am bang MediaRecorder va gui len day.
"""

import os
import tempfile

from fastapi import HTTPException, UploadFile

import config


async def transcribe_upload(audio: UploadFile) -> dict:
    """Nhan file am thanh tu trinh duyet, tra ve van ban."""
    if not config.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Voice upload requires OPENAI_API_KEY (Whisper). Use Safari or type instead.",
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

        from openai import OpenAI
        client = OpenAI(api_key=config.OPENAI_API_KEY)
        with open(tmp_path, "rb") as audio_file:
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="en",
            )
        text = (result.text or "").strip()
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
