"""
test_features.py - Kiem thu MedicationReminder va PhoneController.

Dung 'now_provider' gia lap de kiem soat thoi gian -> test on dinh, khong phu thuoc
gio thuc te. Dung file tam (tmp_path) de khong dung cham du lieu that.
Chay: pytest -q
"""

import json
import os
import sys
from datetime import datetime

# Them thu muc goc du an vao duong dan import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from features import MedicationReminder, PhoneController  # noqa: E402


def make_now(hour, minute):
    """Tra ve mot ham gia lap thoi gian hien tai la hour:minute (ngay co dinh)."""
    fixed = datetime(2026, 1, 1, hour, minute, 0)
    return lambda: fixed


# ======================================================================
#  MedicationReminder
# ======================================================================
def test_add_and_list_medication(tmp_path):
    store = tmp_path / "meds.json"
    reminder = MedicationReminder(storage_file=str(store))

    assert reminder.add_medication("Vitamin C", "08:00", "1 tablet") is True
    meds = reminder.list_medications()
    assert len(meds) == 1
    assert meds[0]["name"] == "Vitamin C"
    # Phai duoc luu xuong file
    assert store.exists()
    saved = json.loads(store.read_text(encoding="utf-8"))
    assert saved[0]["time"] == "08:00"


def test_add_invalid_time_rejected(tmp_path):
    store = tmp_path / "meds.json"
    reminder = MedicationReminder(storage_file=str(store))
    assert reminder.add_medication("Bad Med", "25:99", "1") is False
    assert reminder.add_medication("No Time", "abc", "1") is False
    assert len(reminder.list_medications()) == 0


def test_remove_medication(tmp_path):
    store = tmp_path / "meds.json"
    reminder = MedicationReminder(storage_file=str(store))
    reminder.add_medication("Med A", "08:00")
    reminder.add_medication("Med B", "09:00")

    assert reminder.remove_medication(0) is True
    assert len(reminder.list_medications()) == 1
    # Xoa vi tri khong hop le -> False
    assert reminder.remove_medication(99) is False


def test_list_sorted_by_time(tmp_path):
    store = tmp_path / "meds.json"
    reminder = MedicationReminder(storage_file=str(store))
    reminder.add_medication("Evening", "20:00")
    reminder.add_medication("Morning", "07:00")
    times = [m["time"] for m in reminder.list_medications()]
    assert times == ["07:00", "20:00"]


def test_check_due_now_within_window(tmp_path):
    store = tmp_path / "meds.json"
    # Gio gia lap: 08:10, thuoc luc 08:00 -> nam trong cua so 30 phut -> den gio
    reminder = MedicationReminder(storage_file=str(store), now_provider=make_now(8, 10))
    reminder.add_medication("Morning Pill", "08:00", "1 tablet")

    due = reminder.check_due_now(window_minutes=30)
    assert len(due) == 1
    assert due[0]["name"] == "Morning Pill"
    assert "time to take your medicine" in reminder.describe_due().lower()


def test_check_due_now_outside_window(tmp_path):
    store = tmp_path / "meds.json"
    # Gio gia lap: 06:00, thuoc luc 08:00 -> chua den gio
    reminder = MedicationReminder(storage_file=str(store), now_provider=make_now(6, 0))
    reminder.add_medication("Morning Pill", "08:00")

    assert reminder.check_due_now() == []
    # describe_due phai goi y lan ke tiep
    text = reminder.describe_due()
    assert "next medicine" in text.lower()


def test_next_dose_text_none_left(tmp_path):
    store = tmp_path / "meds.json"
    # Gio gia lap: 23:00, khong con thuoc nao sau do
    reminder = MedicationReminder(storage_file=str(store), now_provider=make_now(23, 0))
    reminder.add_medication("Morning Pill", "08:00")
    assert "no more medicine" in reminder.next_dose_text().lower()


# ======================================================================
#  PhoneController
# ======================================================================
def test_phone_call_known_contact(tmp_path):
    contacts = tmp_path / "contacts.json"
    contacts.write_text(json.dumps({"daughter": "+1 555 0101"}), encoding="utf-8")
    phone = PhoneController(contacts_file=str(contacts))

    reply = phone.call("daughter")
    assert "Calling daughter" in reply
    assert "+1 555 0101" in reply


def test_phone_call_unknown_contact(tmp_path):
    contacts = tmp_path / "contacts.json"
    contacts.write_text(json.dumps({}), encoding="utf-8")
    phone = PhoneController(contacts_file=str(contacts))

    reply = phone.call("stranger")
    assert "Calling stranger" in reply
    assert "not in your contacts" in reply.lower()


def test_phone_call_empty_name(tmp_path):
    phone = PhoneController(contacts_file=str(tmp_path / "c.json"))
    assert "who" in phone.call("").lower()


def test_open_app_simulation(tmp_path):
    phone = PhoneController(contacts_file=str(tmp_path / "c.json"))
    # App khong co trong WEB_APPS -> mo phong, khong mo trinh duyet
    reply = phone.open_app("calculator")
    assert "calculator" in reply.lower()
    assert "simulation" in reply.lower()
