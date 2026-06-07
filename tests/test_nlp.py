"""
test_nlp.py - Kiem thu module NLP (phan loai y dinh rule-based).

Cac test nay KHONG can microphone, loa hay internet -> chay duoc o moi may.
Chay: pytest -q
"""

import os
import sys

# Them thu muc goc du an vao duong dan import (de import duoc nlp_module)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from nlp_module import NLPProcessor  # noqa: E402


nlp = NLPProcessor()


def test_medication_intent():
    """Cau hoi ve thuoc phai cho intent 'medication' (use case trong de bai)."""
    assert nlp.process("Do I need to take medicine?")["intent"] == "medication"
    assert nlp.process("Should I take my pill now?")["intent"] == "medication"


def test_call_intent_and_entity():
    """Lenh goi dien phai nhan dien intent 'call' va trich dung ten (use case de bai)."""
    result = nlp.process("Call my daughter")
    assert result["intent"] == "call"
    assert result["entity"] == "daughter"

    result2 = nlp.process("call the doctor")
    assert result2["intent"] == "call"
    assert result2["entity"] == "doctor"


def test_open_app_intent():
    """Lenh mo app phai cho intent 'open_app' va trich ten app."""
    result = nlp.process("Open youtube")
    assert result["intent"] == "open_app"
    assert result["entity"] == "youtube"


def test_time_and_date_intent():
    assert nlp.process("What time is it?")["intent"] == "time"
    assert nlp.process("What day is it today?")["intent"] == "date"


def test_greeting_intent():
    assert nlp.process("Hello")["intent"] == "greeting"
    assert nlp.process("Good morning")["intent"] == "greeting"


def test_emotional_support_intent():
    """Cau noi buon/co don phai duoc nhan dien la can ho tro tinh than."""
    result = nlp.process("I feel so lonely today")
    assert result["intent"] == "emotional_support"
    assert result["reply"]  # phai co cau dong vien


def test_exit_intent():
    assert nlp.process("Goodbye")["intent"] == "exit"


def test_unknown_intent_has_reply():
    """Cau khong hieu duoc van phai co cau tra loi (khong de None)."""
    result = nlp.process("xyz random gibberish 123")
    assert result["intent"] == "unknown"
    assert result["reply"]


def test_empty_input():
    """Dau vao rong phai duoc xu ly an toan."""
    result = nlp.process("")
    assert result["intent"] == "unknown"
