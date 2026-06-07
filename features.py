"""
features.py - Cac tinh nang chinh cua tro ly.

Gom 2 lop:
  1) MedicationReminder : quan ly lich uong thuoc (them/xoa/liet ke), luu ra file JSON,
     chay mot thread nen kiem tra dinh ky va goi callback khi den gio uong thuoc.
  2) PhoneController    : mo phong viec goi dien cho danh ba va mo ung dung.

Cac lop khong tu phat giong noi; chung tra ve van ban / goi callback de main.py
quyet dinh hien thi UI va doc bang TTS. Cach lam nay giup de kiem thu (test).
"""

import json
import os
import threading
import time
import webbrowser
from datetime import datetime

import config


# ======================================================================
#  Tien ich doc/ghi file JSON an toan
# ======================================================================
def _load_json(path, default):
    """Doc file JSON. Neu khong co file hoac loi -> tra ve gia tri 'default'."""
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[DATA] Loi doc {path}: {exc}")
    return default


def _save_json(path, data) -> bool:
    """Ghi du lieu ra file JSON. Tra True neu thanh cong."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except OSError as exc:
        print(f"[DATA] Loi ghi {path}: {exc}")
        return False


# ======================================================================
#  1) Nhac nho uong thuoc
# ======================================================================
class MedicationReminder:
    """Quan ly lich uong thuoc va nhac nho bang thread nen."""

    def __init__(self, storage_file: str = config.MEDICATIONS_FILE,
                 now_provider=datetime.now):
        # now_provider: ham tra ve thoi gian hien tai (cho phep test de dang giam lap)
        self._now = now_provider
        self.storage_file = storage_file
        # Danh sach thuoc: moi phan tu la dict {name, time "HH:MM", dose}
        self.medications = _load_json(storage_file, [])
        # Cac bien dieu khien thread nen
        self._thread = None
        self._stop_event = threading.Event()
        # Ghi nho cac lan da nhac trong ngay de khong nhac trung lap
        # Dinh dang phan tu: "YYYY-MM-DD HH:MM|<ten thuoc>"
        self._fired = set()

    # ----------------------- Quan ly danh sach -----------------------
    def add_medication(self, name: str, med_time: str, dose: str = "") -> bool:
        """
        Them mot loai thuoc moi.
            name     : ten thuoc
            med_time : gio uong dang "HH:MM" (24 gio)
            dose     : lieu luong (vi du "1 tablet")
        Tra True neu them thanh cong (gio hop le).
        """
        if not name or not self._is_valid_time(med_time):
            print("[MED] Du lieu khong hop le (ten rong hoac gio sai dinh dang HH:MM).")
            return False
        self.medications.append({
            "name": name.strip(),
            "time": med_time.strip(),
            "dose": dose.strip(),
        })
        return _save_json(self.storage_file, self.medications)

    def remove_medication(self, index: int) -> bool:
        """Xoa thuoc theo vi tri (index) trong danh sach."""
        if 0 <= index < len(self.medications):
            self.medications.pop(index)
            return _save_json(self.storage_file, self.medications)
        print("[MED] Vi tri can xoa khong hop le.")
        return False

    def list_medications(self) -> list:
        """Tra ve danh sach thuoc (da sap xep theo gio uong)."""
        return sorted(self.medications, key=lambda m: m.get("time", "99:99"))

    # ----------------------- Kiem tra theo gio -----------------------
    def check_due_now(self, window_minutes: int = 30) -> list:
        """
        Tra ve danh sach thuoc 'den gio' tai thoi diem hien tai.

        Mot loai thuoc duoc coi la 'den gio' neu gio hien tai nam trong khoang
        [gio_uong, gio_uong + window_minutes]. Dung cho cau hoi
        "Do I need to take medicine?".
        """
        now = self._now()
        now_minutes = now.hour * 60 + now.minute
        due = []
        for med in self.medications:
            med_minutes = self._to_minutes(med.get("time", ""))
            if med_minutes is None:
                continue
            if 0 <= (now_minutes - med_minutes) <= window_minutes:
                due.append(med)
        return due

    def describe_due(self) -> str:
        """Tao cau tra loi tieng Anh cho cau hoi 've thuoc'."""
        due = self.check_due_now()
        if due:
            names = ", ".join(f"{m['name']} ({m['dose']})" if m.get("dose")
                              else m["name"] for m in due)
            return f"Yes, it is time to take your medicine: {names}."
        # Neu chua den gio: goi y lan uong ke tiep trong ngay
        return self.next_dose_text()

    def next_dose_text(self) -> str:
        """Cho biet lan uong thuoc ke tiep trong ngay (neu co)."""
        now = self._now()
        now_minutes = now.hour * 60 + now.minute
        upcoming = []
        for med in self.medications:
            med_minutes = self._to_minutes(med.get("time", ""))
            if med_minutes is not None and med_minutes > now_minutes:
                upcoming.append((med_minutes, med))
        if not upcoming:
            return "You have no more medicine scheduled for today. Well done!"
        upcoming.sort(key=lambda x: x[0])
        med = upcoming[0][1]
        return (f"Not right now. Your next medicine is {med['name']} "
                f"at {med['time']}.")

    # ----------------------- Thread nen nhac nho ---------------------
    def start(self, on_due):
        """
        Bat dau thread nen kiem tra lich thuoc.
            on_due: ham callback nhan vao mot dict thuoc khi den gio,
                    vi du: on_due(med) -> hien popup + doc TTS.
        """
        if self._thread and self._thread.is_alive():
            return  # da chay roi
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop, args=(on_due,), daemon=True
        )
        self._thread.start()

    def stop(self):
        """Dung thread nen."""
        self._stop_event.set()

    def _run_loop(self, on_due):
        """Vong lap chay nen: cu moi REMINDER_CHECK_INTERVAL giay kiem tra 1 lan."""
        while not self._stop_event.is_set():
            try:
                self._check_and_fire(on_due)
            except Exception as exc:  # noqa: BLE001 - khong de loi lam chet thread
                print(f"[MED] Loi trong vong lap nhac nho: {exc}")
            # Cho ngat quang nhung van phan ung nhanh khi can dung
            self._stop_event.wait(config.REMINDER_CHECK_INTERVAL)

    def _check_and_fire(self, on_due):
        """Kiem tra dung gio (HH:MM khop) thi goi callback, moi thuoc chi nhac 1 lan."""
        now = self._now()
        current_hhmm = now.strftime("%H:%M")
        current_day = now.strftime("%Y-%m-%d")
        for med in self.medications:
            if med.get("time") == current_hhmm:
                key = f"{current_day} {current_hhmm}|{med['name']}"
                if key not in self._fired:
                    self._fired.add(key)
                    on_due(med)

    # ----------------------- Tien ich noi bo -----------------------
    @staticmethod
    def _to_minutes(hhmm: str):
        """Doi chuoi 'HH:MM' thanh so phut tu nua dem. Tra None neu sai dinh dang."""
        if not MedicationReminder._is_valid_time(hhmm):
            return None
        hour, minute = hhmm.split(":")
        return int(hour) * 60 + int(minute)

    @staticmethod
    def _is_valid_time(hhmm: str) -> bool:
        """Kiem tra chuoi co dung dinh dang 'HH:MM' (00:00 - 23:59) khong."""
        if not isinstance(hhmm, str):
            return False
        parts = hhmm.strip().split(":")
        if len(parts) != 2:
            return False
        try:
            hour, minute = int(parts[0]), int(parts[1])
        except ValueError:
            return False
        return 0 <= hour <= 23 and 0 <= minute <= 59


# ======================================================================
#  2) Dieu khien dien thoai (mo phong)
# ======================================================================
class PhoneController:
    """Mo phong goi dien cho danh ba va mo ung dung."""

    # Mot so app web pho bien co the mo that bang trinh duyet
    WEB_APPS = {
        "youtube": "https://www.youtube.com",
        "facebook": "https://www.facebook.com",
        "gmail": "https://mail.google.com",
        "maps": "https://maps.google.com",
        "weather": "https://weather.com",
        "news": "https://news.google.com",
    }

    def __init__(self, contacts_file: str = config.CONTACTS_FILE):
        self.contacts_file = contacts_file
        # Danh ba: dict {ten_thuong: so_dien_thoai}
        self.contacts = _load_json(contacts_file, {})

    def call(self, name: str) -> str:
        """
        Mo phong cuoc goi den 'name'. Tra ve cau thong bao (tieng Anh).
        Neu khong tim thay trong danh ba van bao dang goi (mo phong than thien).
        """
        if not name:
            return "Who would you like me to call?"
        key = name.strip().lower()
        if key in self.contacts:
            number = self.contacts[key]
            return f"Calling {name} now at {number}..."
        # Khong co trong danh ba -> van mo phong goi nhung nhac them
        return (f"Calling {name} now... "
                f"(Note: {name} is not in your contacts yet.)")

    def open_app(self, app: str) -> str:
        """
        Mo phong mo ung dung 'app'. Neu la app web da biet thi mo trinh duyet that.
        Tra ve cau thong bao (tieng Anh).
        """
        if not app:
            return "Which app would you like me to open?"
        key = app.strip().lower()
        if key in self.WEB_APPS:
            try:
                webbrowser.open(self.WEB_APPS[key])
                return f"Opening {app} for you now."
            except Exception as exc:  # noqa: BLE001
                print(f"[PHONE] Loi khi mo trinh duyet: {exc}")
                return f"Sorry, I could not open {app} right now."
        # App khong nam trong danh sach web -> mo phong
        return f"Opening {app} now... (This is a simulation.)"


# Chay thu nhanh: python features.py
if __name__ == "__main__":
    reminder = MedicationReminder()
    print("Danh sach thuoc:", reminder.list_medications())
    print("Den gio chua?:", reminder.describe_due())

    phone = PhoneController()
    print(phone.call("daughter"))
    print(phone.open_app("youtube"))
