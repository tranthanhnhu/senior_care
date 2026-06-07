# Senior Care Assistant

AI Voice Assistant for Elderly Healthcare Support — web app with Supabase auth, medication reminders, and voice chat.

## Features

- Voice chat (Web Speech API) + text input
- Medication schedule & reminders (client-side, while tab is open)
- Contacts with real phone dial (`tel:` links on mobile)
- Supabase login (magic link email)
- OpenAI-powered conversational replies (optional)

## Quick Start (Local)

### 1. Install dependencies

**Web app (deploy / local server):**
```bash
pip install -r requirements.txt
```

**Desktop app + tests (local only):**
```bash
pip install -r requirements-desktop.txt
```

### 2. Configure Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Run [`supabase/schema.sql`](supabase/schema.sql) in SQL Editor
3. Enable Email auth — **turn OFF "Confirm email"** (instant sign-in). See [`supabase/README.md`](supabase/README.md).
4. Set **Site URL** to `http://localhost:8000` and add redirect URL `http://localhost:8000/**`

See [`supabase/README.md`](supabase/README.md) for details.

### 3. Environment variables

Copy `.env.example` to `.env` and fill in:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
USE_OPENAI=True
```

### 4. Run web app

```bash
uvicorn api.app:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000/login](http://localhost:8000/login)

### 5. Run tests

```bash
pytest -q
```

### Desktop app (optional)

```bash
pip install -r requirements-desktop.txt
python main.py
```

## Deploy to Render (Free)

1. Push code to GitHub
2. Create account at [render.com](https://render.com)
3. **New → Blueprint** or **Web Service** → connect repo
4. Use settings from [`render.yaml`](render.yaml):
   - **Runtime**: Python 3.11 (via [`runtime.txt`](runtime.txt))
   - Build: `pip install -r requirements.txt` (web only — no pygame/PyAudio)
   - Start: `uvicorn api.app:app --host 0.0.0.0 --port $PORT`
5. Add environment variables (same as `.env`)
6. Update Supabase **Site URL** and **Redirect URLs** to your Render URL
7. Set `CORS_ORIGINS` to your Render URL

> Render free tier sleeps after 15 min idle — first load may take ~30 seconds.

## Project Structure

```
api/           FastAPI backend + static file serving
web/           Frontend (HTML, CSS, JS)
supabase/      Database schema + setup guide
nlp_module.py  NLP / intent processing
features.py    Desktop feature logic (tests)
main.py        Desktop Tkinter app (optional)
tests/         pytest unit tests
```

## Architecture

```
Browser (Web Speech STT/TTS)
    ↓ POST /api/chat
FastAPI → nlp_module.py → OpenAI (optional)
    ↓
Browser handles medications/calls via Supabase (direct)
```

## License

Academic project — Team 1, CCU.
