"""
api/app.py - FastAPI entry point cho web app.

- POST /api/chat     : xu ly NLP
- GET  /api/health   : health check (Render)
- GET  /api/config   : tra Supabase public keys cho frontend
- Serve static files tu thu muc web/
"""

import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import config
from api.chat import ChatRequest, ChatResponse, process_chat
from api.news import get_daily_greeting, get_health_tip, get_today_news
from api.stt import transcribe_upload

# Duong dan thu muc web static
WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(title="Senior Care Assistant API", version="1.0.0")

# CORS cho phep frontend goi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in config.CORS_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Health check cho Render."""
    return {"status": "ok", "service": "senior-care-assistant"}


@app.get("/api/config")
def public_config():
    """Tra cau hinh public cho frontend (Supabase anon key an toan de dung client-side)."""
    return {
        "supabaseUrl": config.SUPABASE_URL,
        "supabaseAnonKey": config.SUPABASE_ANON_KEY,
        "appTitle": config.APP_TITLE,
        "openaiEnabled": config.USE_OPENAI and bool(config.OPENAI_API_KEY),
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(body: ChatRequest):
    """Nhan van ban, tra intent + reply."""
    try:
        return process_chat(body.text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/news")
def news():
    """Tin tuc hom nay (RSS mien phi + tom tat de doc)."""
    try:
        return get_today_news()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/greeting")
def greeting():
    """Loi chao theo buoi trong ngay."""
    return get_daily_greeting()


@app.get("/api/health-tip")
def health_tip():
    """Meo suc khoe ngau nhien."""
    return get_health_tip()


@app.post("/api/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """STT fallback: ghi am tu Chrome iOS -> Whisper."""
    return await transcribe_upload(audio)


# Serve static assets (css, js, manifest)
if WEB_DIR.exists():
    app.mount("/css", StaticFiles(directory=WEB_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=WEB_DIR / "js"), name="js")

    @app.get("/")
    def serve_index():
        return FileResponse(WEB_DIR / "index.html")

    @app.get("/login")
    def serve_login():
        return FileResponse(WEB_DIR / "login.html")

    @app.get("/medications")
    def serve_medications():
        return FileResponse(WEB_DIR / "medications.html")

    @app.get("/contacts")
    def serve_contacts():
        return FileResponse(WEB_DIR / "contacts.html")

    @app.get("/manifest.json")
    def serve_manifest():
        return FileResponse(WEB_DIR / "manifest.json")
