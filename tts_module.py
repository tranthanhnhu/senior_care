"""
tts_module.py - Module Text-to-Speech (chuyen van ban thanh giong noi).

Su dung Google TTS (thu vien gTTS - MIEN PHI, can internet) de tao file mp3,
sau do phat ra loa bang pygame (on dinh tren Windows/macOS/Linux).

Cach dung:
    from tts_module import TextToSpeech
    tts = TextToSpeech()
    tts.speak("Hello, it is time to take your medicine.")
"""

import os
import tempfile
import threading

from gtts import gTTS

import config


class TextToSpeech:
    """Lop bao boc viec tao giong noi va phat am thanh."""

    def __init__(self, language: str = config.TTS_LANGUAGE):
        self.language = language
        # Khoa de tranh phat 2 cau cung luc (gay chong tieng)
        self._lock = threading.Lock()
        self._mixer_ready = self._init_mixer()

    def _init_mixer(self) -> bool:
        """Khoi tao bo phat am thanh cua pygame. Tra True neu thanh cong."""
        try:
            import pygame
            pygame.mixer.init()
            self._pygame = pygame
            return True
        except Exception as exc:  # noqa: BLE001 - may khong co thiet bi am thanh
            print(f"[TTS] Khong khoi tao duoc bo phat am thanh: {exc}")
            self._pygame = None
            return False

    def speak(self, text: str) -> bool:
        """
        Doc to van ban 'text'. Tra ve True neu phat thanh cong, False neu loi.

        Cac buoc: gTTS tao mp3 tam -> pygame phat -> cho phat xong -> xoa file tam.
        Tat ca deu nam trong try/except de khong lam treo ung dung.
        """
        if not text or not text.strip():
            return False

        # Dung khoa de moi lan chi phat 1 cau
        with self._lock:
            tmp_path = None
            try:
                # 1) Tao file mp3 tam thoi
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                    tmp_path = tmp.name
                tts = gTTS(text=text, lang=self.language, slow=False)
                tts.save(tmp_path)
            except Exception as exc:  # noqa: BLE001 - loi mang gTTS hoac ghi file
                print(f"[TTS] Loi khi tao giong noi (gTTS): {exc}")
                self._safe_remove(tmp_path)
                return False

            # 2) Neu khong co bo phat am thanh thi chi bao loi (van da tao file)
            if not self._mixer_ready:
                print("[TTS] Khong co thiet bi am thanh de phat.")
                self._safe_remove(tmp_path)
                return False

            # 3) Phat file mp3 va cho den khi phat xong
            try:
                self._pygame.mixer.music.load(tmp_path)
                self._pygame.mixer.music.play()
                while self._pygame.mixer.music.get_busy():
                    self._pygame.time.Clock().tick(10)
                # Giai phong file de co the xoa (quan trong tren Windows)
                self._pygame.mixer.music.unload()
            except Exception as exc:  # noqa: BLE001
                print(f"[TTS] Loi khi phat am thanh: {exc}")
                return False
            finally:
                self._safe_remove(tmp_path)

            return True

    @staticmethod
    def _safe_remove(path):
        """Xoa file tam mot cach an toan (bo qua neu khong xoa duoc)."""
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


# Chay thu nhanh: python tts_module.py
if __name__ == "__main__":
    TextToSpeech().speak("Hello! It is time to take your medicine.")
