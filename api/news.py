"""
api/news.py - Lay tin tuc hom nay tu RSS mien phi (BBC) va doc than thien cho nguoi cao tuoi.
"""

import xml.etree.ElementTree as ET

import httpx

import config

# RSS mien phi, khong can API key
BBC_WORLD_RSS = "https://feeds.bbci.co.uk/news/world/rss.xml"
HEADLINE_LIMIT = 5


def _fetch_headlines(limit: int = HEADLINE_LIMIT) -> list[str]:
    """Doc tieu de tin tu BBC RSS."""
    with httpx.Client(timeout=12.0, follow_redirects=True) as client:
        response = client.get(BBC_WORLD_RSS)
        response.raise_for_status()
    root = ET.fromstring(response.text)
    headlines = []
    for item in root.findall(".//item")[:limit]:
        title_el = item.find("title")
        if title_el is not None and title_el.text:
            headlines.append(title_el.text.strip())
    return headlines


def _build_simple_summary(headlines: list[str]) -> str:
    """Tao doan van ngan de doc bang giong noi."""
    if not headlines:
        return "Sorry, I could not fetch the news right now. Please try again later."
    intro = "Here are today's top news headlines for you."
    parts = [f"Number {i + 1}: {title}." for i, title in enumerate(headlines)]
    return f"{intro} {' '.join(parts)}"


def _build_ai_summary(headlines: list[str]) -> str | None:
    """Dung OpenAI tom tat tin tuc than thien hon (tuy chon)."""
    if not (config.USE_OPENAI and config.OPENAI_API_KEY):
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=config.OPENAI_API_KEY)
        bullet_list = "\n".join(f"- {h}" for h in headlines)
        response = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a warm assistant for elderly users. Summarize these news "
                        "headlines in 3-4 short, clear sentences. Speak slowly and simply. "
                        "Do not cause alarm."
                    ),
                },
                {"role": "user", "content": f"Headlines:\n{bullet_list}"},
            ],
            max_tokens=180,
            temperature=0.6,
        )
        return response.choices[0].message.content.strip()
    except Exception:  # noqa: BLE001
        return None


def get_today_news() -> dict:
    """
    Tra ve tin tuc hom nay.
    Returns: { headlines: list[str], summary: str }
    """
    try:
        headlines = _fetch_headlines()
    except Exception:  # noqa: BLE001
        return {
            "headlines": [],
            "summary": "Sorry, I couldn't load the news right now. Please check your internet and try again.",
        }

    summary = _build_ai_summary(headlines) or _build_simple_summary(headlines)
    return {"headlines": headlines, "summary": summary}


# Meo suc khoe mien phi (offline) — xoay vong theo ngay
HEALTH_TIPS = [
    "Remember to drink a glass of water. Staying hydrated helps your body and mind.",
    "A short walk, even around your home, can brighten your mood and keep you active.",
    "Take a moment to breathe slowly. In for four counts, out for four counts.",
    "Calling a friend or family member today is a wonderful way to feel connected.",
    "Good sleep helps your medicine work better. Try to rest at the same time each night.",
    "Eating fruits and vegetables gives your body the vitamins it needs to stay strong.",
    "If you feel dizzy when standing up, rise slowly and hold onto something steady.",
    "Smiling, even a little, can help you feel a bit happier. You are doing great.",
]


def get_health_tip() -> dict:
    """Tra ve mot meo suc khoe (xoay vong theo ngay trong thang)."""
    from datetime import datetime
    day = datetime.now().day
    tip = HEALTH_TIPS[day % len(HEALTH_TIPS)]
    return {"tip": tip}


def get_daily_greeting() -> dict:
    """Loi chao buoi sang/chieu/toi kem ngay thang."""
    from datetime import datetime
    now = datetime.now()
    hour = now.hour
    if hour < 12:
        period = "Good morning"
    elif hour < 17:
        period = "Good afternoon"
    else:
        period = "Good evening"
    date_str = now.strftime("%A, %B %d")
    message = (
        f"{period}! Today is {date_str}. "
        "I hope you are feeling well. I'm here if you need anything."
    )
    return {"greeting": message, "date": date_str, "period": period}
