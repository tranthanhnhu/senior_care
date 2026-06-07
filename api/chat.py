"""
api/chat.py - Endpoint xu ly hoi thoai (NLP).

Nhan van ban tu frontend, tra ve intent + entity + reply.
Frontend tu thuc thi hanh dong (Supabase, tel:, v.v.) dua tren intent.
"""

from pydantic import BaseModel, Field

import config
from nlp_module import NLPProcessor

# Khoi tao NLP mot lan (tai su dung giua cac request)
_nlp = NLPProcessor()


class ChatRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class ChatResponse(BaseModel):
    intent: str
    entity: str | None = None
    reply: str | None = None


def build_reply(intent: str, entity: str | None, nlp_reply: str | None) -> str | None:
    """
    Tao cau tra loi cuoi cung cho cac intent co the xu ly hoan toan tren server.
    Cac intent can du lieu Supabase (medication, call) de reply=None cho frontend xu ly.
    """
    if intent == "time":
        return None  # frontend dung gio local cua thiet bi
    if intent == "date":
        return None
    if intent in ("medication", "call", "open_app"):
        return None
    return nlp_reply


def process_chat(text: str) -> ChatResponse:
    """Phan tich van ban va tra ve ket qua co cau truc."""
    result = _nlp.process(text.strip())
    intent = result.get("intent", "unknown")
    entity = result.get("entity")
    reply = build_reply(intent, entity, result.get("reply"))
    return ChatResponse(intent=intent, entity=entity, reply=reply)
