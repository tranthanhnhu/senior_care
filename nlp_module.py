"""
nlp_module.py - Module xu ly ngon ngu tu nhien (NLP).

Nhiem vu: nhan van ban tu nguoi dung -> hieu Y DINH (intent) -> tra ve ket qua
co cau truc gom: intent, entity (thuc the di kem), reply (cau tra loi mac dinh).

Thiet ke 2 lop xu ly:
  1) Rule-based (mac dinh): dung tu khoa/bieu thuc chinh quy -> MIEN PHI, offline,
     khong can API key. Phu hop bai tap nhom, toi uu chi phi.
  2) OpenAI (TUY CHON, mac dinh TAT): neu config.USE_OPENAI = True va co API key,
     dung System Prompt dong vai tro ly y te than thien de tro chuyen tu nhien hon.
     Neu loi -> tu dong fallback ve rule-based.

Cac intent ho tro:
  - medication      : hoi ve viec uong thuoc
  - call            : goi dien cho mot nguoi trong danh ba (entity = ten)
  - open_app        : mo mot ung dung (entity = ten app)
  - greeting        : chao hoi
  - how_are_you     : hoi tham
  - emotional_support: can dong vien, buon, co don
  - time            : hoi gio
  - date            : hoi ngay
  - help            : hoi tro ly lam duoc gi
  - exit            : tam biet / thoat
  - unknown         : khong xac dinh duoc y dinh
"""

import re

import config


class NLPProcessor:
    """Bo xu ly y dinh dua tren luat (rule-based), co tuy chon dung OpenAI."""

    def __init__(self):
        # Doc cau hinh OpenAI tu config
        self.use_openai = config.USE_OPENAI and bool(config.OPENAI_API_KEY)
        self._openai_client = None
        if self.use_openai:
            # Chi khoi tao client OpenAI khi that su bat tinh nang nay
            self._init_openai()

    # ------------------------------------------------------------------
    # Khoi tao OpenAI (tuy chon)
    # ------------------------------------------------------------------
    def _init_openai(self):
        """Khoi tao client OpenAI. Neu that bai thi tat tinh nang va dung rule-based."""
        try:
            from openai import OpenAI  # import tre de khong bat buoc cai openai
            self._openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
        except Exception as exc:  # noqa: BLE001
            print(f"[NLP] Khong the khoi tao OpenAI, dung rule-based: {exc}")
            self.use_openai = False

    # ------------------------------------------------------------------
    # Ham xu ly chinh
    # ------------------------------------------------------------------
    def process(self, text: str) -> dict:
        """
        Phan tich van ban dau vao va tra ve dict:
            {
                "intent": <str>,        # ten y dinh
                "entity": <str|None>,   # thuc the di kem (ten nguoi, ten app...)
                "reply":  <str|None>,   # cau tra loi mac dinh (None neu can du lieu ngoai)
            }

        Voi cac intent hanh dong (medication/call/open_app), 'reply' co the la None
        vi cau tra loi cuoi cung phu thuoc du lieu thuc te (lich thuoc, danh ba)
        do tang main.py ket hop voi module features.
        """
        if not text or not text.strip():
            return {"intent": "unknown", "entity": None,
                    "reply": "Sorry, I didn't catch that. Could you say it again?"}

        # Luon phan tich intent bang rule-based truoc (nhanh, on dinh)
        result = self._rule_based(text.lower().strip(), original=text.strip())

        # Neu bat OpenAI va day la cuoc tro chuyen tu do (khong phai hanh dong cu the),
        # dung OpenAI de tao cau tra loi tu nhien hon.
        conversational = {"greeting", "how_are_you", "emotional_support", "unknown"}
        if self.use_openai and result["intent"] in conversational:
            ai_reply = self._ask_openai(text.strip())
            if ai_reply:
                result["reply"] = ai_reply

        return result

    # ------------------------------------------------------------------
    # Xu ly bang luat (tu khoa / regex)
    # ------------------------------------------------------------------
    def _rule_based(self, text: str, original: str) -> dict:
        """Phan loai y dinh dua tren tu khoa va mau cau."""

        # --- 1) Goi dien: "call my daughter", "call the doctor" ---
        call_match = re.search(r"\bcall\b\s+(?:my\s+|the\s+)?([a-z]+)", text)
        if call_match:
            name = call_match.group(1)
            return {"intent": "call", "entity": name, "reply": None}

        # --- 2) Mo ung dung: "open youtube", "open the camera" ---
        open_match = re.search(r"\bopen\b\s+(?:my\s+|the\s+)?([a-z]+)", text)
        if open_match:
            app = open_match.group(1)
            return {"intent": "open_app", "entity": app, "reply": None}

        # --- 3) Hoi ve thuoc ---
        med_keywords = ["medicine", "medication", "pill", "tablet", "drug", "medicines"]
        if any(k in text for k in med_keywords) or "take my" in text:
            return {"intent": "medication", "entity": None, "reply": None}

        # --- 4) Hoi gio ---
        if re.search(r"\bwhat('?s| is)? the time\b", text) or "what time is it" in text:
            return {"intent": "time", "entity": None, "reply": None}

        # --- 5) Hoi ngay ---
        if "what day" in text or "what's the date" in text or "what is the date" in text \
                or "today's date" in text:
            return {"intent": "date", "entity": None, "reply": None}

        # --- 6) Hoi tham "how are you" ---
        if "how are you" in text:
            return {"intent": "how_are_you", "entity": None,
                    "reply": "I'm doing great, thank you for asking! "
                             "I'm always here to help you. How are you feeling today?"}

        # --- 7) Can dong vien / co don / buon ---
        sad_keywords = ["lonely", "sad", "depressed", "alone", "unhappy",
                        "tired of", "miss", "scared", "afraid", "worried"]
        if any(k in text for k in sad_keywords):
            return {"intent": "emotional_support", "entity": None,
                    "reply": "I'm sorry you're feeling this way. You are not alone, "
                             "I'm right here with you. Would you like to talk about it, "
                             "or maybe call a family member?"}

        # --- 8) Chao hoi ---
        greet_keywords = ["hello", "hi ", "hey", "good morning", "good afternoon",
                          "good evening"]
        if text in ("hi", "hello", "hey") or any(k in text for k in greet_keywords):
            return {"intent": "greeting", "entity": None,
                    "reply": "Hello! It's wonderful to hear from you. "
                             "How can I help you today?"}

        # --- 9) Tam biet / thoat ---
        bye_keywords = ["goodbye", "bye", "see you", "good night", "exit", "quit", "stop"]
        if any(k in text for k in bye_keywords):
            return {"intent": "exit", "entity": None,
                    "reply": "Goodbye! Take care of yourself. I'm here whenever you need me."}

        # --- 10) Hoi tro ly lam duoc gi ---
        help_keywords = ["what can you do", "help me", "how do you work", "what do you do"]
        if any(k in text for k in help_keywords):
            return {"intent": "help", "entity": None,
                    "reply": "I can remind you to take your medicine, tell you the time "
                             "and date, call your family, open apps, and chat with you. "
                             "Just tell me what you need!"}

        # --- Khong xac dinh duoc ---
        return {"intent": "unknown", "entity": None,
                "reply": "I'm not sure I understood that. You can ask me about your "
                         "medicine, ask me to call someone, or just chat with me."}

    # ------------------------------------------------------------------
    # Goi OpenAI (tuy chon) - dong vai tro ly y te than thien
    # ------------------------------------------------------------------
    def _ask_openai(self, user_text: str):
        """Goi OpenAI API de tao cau tra loi than thien. Tra None neu loi."""
        system_prompt = (
            "You are a warm, patient, and friendly healthcare voice assistant for "
            "elderly users. Speak slowly and clearly using short, simple sentences. "
            "Be encouraging and supportive. Never give specific medical diagnoses; "
            "instead, gently suggest contacting a doctor or family member when needed."
        )
        try:
            response = self._openai_client.chat.completions.create(
                model=config.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_text},
                ],
                max_tokens=120,
                temperature=0.7,
            )
            return response.choices[0].message.content.strip()
        except Exception as exc:  # noqa: BLE001 - loi mang/quota/key -> fallback
            print(f"[NLP] Loi goi OpenAI, dung cau tra loi rule-based: {exc}")
            return None


# Chay thu nhanh: python nlp_module.py
if __name__ == "__main__":
    nlp = NLPProcessor()
    for sample in [
        "Do I need to take medicine?",
        "Call my daughter",
        "Open youtube",
        "Hello",
        "I feel so lonely today",
        "What time is it?",
    ]:
        print(f"{sample!r} -> {nlp.process(sample)}")
