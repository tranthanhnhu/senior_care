"""
config.py - Cau hinh tap trung cho toan bo ung dung.

Muc dich: gom tat ca cac tham so co the thay doi (ngon ngu, co chu UI,
duong dan file du lieu, bat/tat OpenAI...) vao mot noi de de quan ly.
Cac module khac chi can: from config import <ten_bien>
"""

import os

# ------------------------------------------------------------------
# Duong dan thu muc goc cua du an va thu muc luu du lieu
# ------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

# Tu dong doc bien moi truong tu file .env (OPENAI_API_KEY, ...)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except ImportError:
    pass  # python-dotenv chua cai thi bo qua, dung bien he thong

# File JSON luu lich uong thuoc va danh ba (tu tao neu chua co)
MEDICATIONS_FILE = os.path.join(DATA_DIR, "medications.json")
CONTACTS_FILE = os.path.join(DATA_DIR, "contacts.json")

# ------------------------------------------------------------------
# Cau hinh ngon ngu
# ------------------------------------------------------------------
# Ma ngon ngu cho STT (Google Speech Recognition), vi du "en-US", "vi-VN"
STT_LANGUAGE = "en-US"
# Ma ngon ngu cho TTS (gTTS), vi du "en", "vi"
TTS_LANGUAGE = "en"

# ------------------------------------------------------------------
# Cau hinh thu am (STT)
# ------------------------------------------------------------------
# So giay toi da cho ung dung cho nguoi dung BAT DAU noi
STT_TIMEOUT = 6
# So giay toi da cho mot cau noi
STT_PHRASE_TIME_LIMIT = 12

# ------------------------------------------------------------------
# Cau hinh nhac nho uong thuoc
# ------------------------------------------------------------------
# Khoang thoi gian (giay) giua moi lan thread nen kiem tra lich thuoc
REMINDER_CHECK_INTERVAL = 30

# ------------------------------------------------------------------
# Cau hinh NLP (OpenRouter - TUY CHON, mac dinh BAT neu co key)
# ------------------------------------------------------------------
# Dat True neu ban muon dung OpenRouter cho phan tro chuyen tu do.
# Khi False, he thong dung hoan toan rule-based offline (mien phi, khong can key).
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.environ.get("LANGCHAIN_MODEL_NAME", "openai/gpt-4o-mini")
USE_OPENAI = bool(OPENROUTER_API_KEY)
# Giu tuong thich nguoc voi code cu
OPENAI_API_KEY = OPENROUTER_API_KEY
OPENAI_MODEL = OPENROUTER_MODEL

# ------------------------------------------------------------------
# Cau hinh Supabase (web app)
# ------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# CORS: cho phep frontend goi API (them URL Render khi deploy)
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000",
).split(",")

# ------------------------------------------------------------------
# Cau hinh giao dien (UI) - thiet ke chu lon cho nguoi cao tuoi
# ------------------------------------------------------------------
APP_TITLE = "Senior Care - Voice Assistant"

# Bang mau tuong phan cao, de nhin (phong cach web hien dai)
COLOR_BG = "#0b1220"          # nen chinh
COLOR_SIDEBAR = "#111827"     # nen sidebar
COLOR_CARD = "#1e293b"        # nen the/khung
COLOR_CARD_BORDER = "#334155"
COLOR_TEXT = "#f8fafc"        # chu sang
COLOR_TEXT_MUTED = "#94a3b8"  # chu phu
COLOR_ACCENT = "#38bdf8"      # mau nhan (xanh duong sang)
COLOR_USER = "#fbbf24"        # mau chu loi nguoi dung
COLOR_ASSISTANT = "#4ade80"   # mau chu loi tro ly
COLOR_SPEAK = "#16a34a"       # nut Speak
COLOR_MED = "#2563eb"         # nut thuoc
COLOR_CONTACT = "#7c3aed"     # nut danh ba
COLOR_TIME = "#0891b2"        # nut gio
COLOR_HELP = "#d97706"        # nut tro giup
COLOR_EXIT = "#dc2626"        # nut thoat
COLOR_INPUT_BG = "#0f172a"    # nen o nhap van ban

# Font chu lon cho de doc
FONT_FAMILY = "Segoe UI"
FONT_TITLE = (FONT_FAMILY, 26, "bold")
FONT_SUBTITLE = (FONT_FAMILY, 13)
FONT_LOG = (FONT_FAMILY, 17)
FONT_BUTTON = (FONT_FAMILY, 15, "bold")
FONT_BUTTON_ICON = (FONT_FAMILY, 22)
FONT_STATUS = (FONT_FAMILY, 14)
FONT_INPUT = (FONT_FAMILY, 16)

# Kich thuoc cua so
WINDOW_WIDTH = 1100
WINDOW_HEIGHT = 720
SIDEBAR_WIDTH = 260
