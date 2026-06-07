"""
test_api_chat.py - Kiem thu FastAPI /api/chat endpoint.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from api.app import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_config():
    r = client.get("/api/config")
    assert r.status_code == 200
    data = r.json()
    assert "supabaseUrl" in data
    assert "appTitle" in data


def test_chat_medication_intent():
    r = client.post("/api/chat", json={"text": "Do I need to take medicine?"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "medication"
    assert data["reply"] is None  # frontend resolves via Supabase


def test_chat_call_intent():
    r = client.post("/api/chat", json={"text": "Call my daughter"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "call"
    assert data["entity"] == "daughter"


def test_chat_time_intent():
    r = client.post("/api/chat", json={"text": "What time is it?"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "time"
    assert "time is" in data["reply"].lower()


def test_chat_greeting():
    r = client.post("/api/chat", json={"text": "Hello"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "greeting"
    assert data["reply"]


def test_serve_index():
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")


def test_serve_login():
    r = client.get("/login")
    assert r.status_code == 200
