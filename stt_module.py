"""
stt_module.py - Module Speech-to-Text (chuyen giong noi thanh van ban).

Su dung thu vien SpeechRecognition voi engine Google Web Speech API (MIEN PHI).
Khong can API key. Yeu cau co microphone va ket noi internet.

Cach dung:
    from stt_module import SpeechToText
    stt = SpeechToText()
    text = stt.listen()   # tra ve chuoi van ban, hoac None neu that bai
"""

import speech_recognition as sr

import config


class SpeechToText:
    """Lop bao boc (wrapper) cho viec thu am va nhan dang giong noi."""

    def __init__(self, language: str = config.STT_LANGUAGE):
        # recognizer: doi tuong xu ly nhan dang giong noi
        self.recognizer = sr.Recognizer()
        self.language = language
        # Nguong nang luong de phat hien giong noi (tu dong dieu chinh khi thu am)
        self.recognizer.dynamic_energy_threshold = True

    def listen(self, timeout: int = config.STT_TIMEOUT,
               phrase_time_limit: int = config.STT_PHRASE_TIME_LIMIT):
        """
        Thu am tu microphone va chuyen thanh van ban.

        Tra ve:
            - str: van ban nhan dang duoc (chu thuong, da bo khoang trang thua)
            - None: neu khong nghe duoc / khong nhan dang duoc / loi ket noi

        Moi truong hop loi deu duoc bat (try/except) de UI khong bi treo.
        """
        try:
            # Mo microphone bang context manager de tu dong giai phong tai nguyen
            with sr.Microphone() as source:
                # Hieu chinh tieng on moi truong trong ~0.5 giay de nhan dang tot hon
                self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
                # Lang nghe nguoi dung noi
                audio = self.recognizer.listen(
                    source,
                    timeout=timeout,
                    phrase_time_limit=phrase_time_limit,
                )
        except sr.WaitTimeoutError:
            # Nguoi dung khong noi gi trong khoang thoi gian cho
            print("[STT] Het thoi gian cho: khong nghe thay giong noi.")
            return None
        except OSError as exc:
            # Khong tim thay microphone hoac loi thiet bi am thanh
            print(f"[STT] Loi thiet bi microphone: {exc}")
            return None
        except Exception as exc:  # noqa: BLE001 - bat moi loi con lai khi thu am
            print(f"[STT] Loi khong xac dinh khi thu am: {exc}")
            return None

        # --- Da co du lieu am thanh, tien hanh nhan dang bang Google (mien phi) ---
        try:
            text = self.recognizer.recognize_google(audio, language=self.language)
            cleaned = text.strip()
            print(f"[STT] Nhan dang duoc: {cleaned}")
            return cleaned
        except sr.UnknownValueError:
            # Google khong hieu duoc am thanh (noi khong ro, qua nho...)
            print("[STT] Khong nhan dang duoc giong noi (am thanh khong ro).")
            return None
        except sr.RequestError as exc:
            # Loi ket noi toi dich vu Google (mat mang, bi chan...)
            print(f"[STT] Loi ket noi dich vu nhan dang: {exc}")
            return None
        except Exception as exc:  # noqa: BLE001
            print(f"[STT] Loi khong xac dinh khi nhan dang: {exc}")
            return None


# Cho phep chay thu nhanh: python stt_module.py
if __name__ == "__main__":
    print("Hay noi mot cau bang tieng Anh (vi du: 'Do I need to take medicine?')...")
    result = SpeechToText().listen()
    print("Ket qua:", result if result else "(khong nhan dang duoc)")
