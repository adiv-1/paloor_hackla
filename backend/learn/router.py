"""HTTP routes for the learning loop."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import get_current_user, UserInfo
from learn import models as learn_models
from learn.checkpoint import (
    evaluate_checkpoint,
    post_simulation_feedback,
    chat_turn,
    explain_term,
)
from learn.voice import synthesize, transcribe, VoiceUnavailable

router = APIRouter(prefix="/api/learn", tags=["learn"])


# ----------------------------- Request schemas -----------------------------


class StepUpdate(BaseModel):
    module_id: str
    step_index: int = Field(ge=0)


class CompleteRequest(BaseModel):
    module_id: str


class CheckpointRequest(BaseModel):
    module_id: str
    step_key: str
    module_title: str
    concept: str
    key_ideas: list[str]
    question: str
    user_response: str = ""


class FeedbackRequest(BaseModel):
    module_id: str
    module_title: str
    concept: str
    user_choices: dict
    sim_outputs: dict


# --------------------------------- Routes ---------------------------------


@router.get("/progress")
def get_all_progress(user: UserInfo = Depends(get_current_user)):
    items = learn_models.list_progress(user.id)
    return {
        "items": items,
        "total_credits": learn_models.total_credits(user.id),
    }


@router.get("/progress/{module_id}")
def get_module_progress(module_id: str, user: UserInfo = Depends(get_current_user)):
    return learn_models.get_progress(user.id, module_id)


@router.post("/progress")
def advance_step(req: StepUpdate, user: UserInfo = Depends(get_current_user)):
    return learn_models.upsert_step(user.id, req.module_id, req.step_index)


@router.post("/complete")
def complete(req: CompleteRequest, user: UserInfo = Depends(get_current_user)):
    return learn_models.complete_module(user.id, req.module_id)


@router.post("/checkpoint")
def checkpoint(req: CheckpointRequest, user: UserInfo = Depends(get_current_user)):
    if not req.user_response.strip():
        raise HTTPException(400, "user_response is required")
    result = evaluate_checkpoint(
        module_title=req.module_title,
        concept=req.concept,
        key_ideas=req.key_ideas,
        question=req.question,
        user_response=req.user_response,
    )
    learn_models.record_checkpoint_score(
        user.id, req.module_id, req.step_key, result["hidden_score"]
    )
    # Soft checkpoint — never gate the user. Always pass.
    return {
        "pass": True,
        "feedback": result["feedback"],
        "key_ideas_hit": result["key_ideas_hit"],
    }


@router.post("/feedback")
def feedback(req: FeedbackRequest, user: UserInfo = Depends(get_current_user)):
    result = post_simulation_feedback(
        module_title=req.module_title,
        concept=req.concept,
        user_choices=req.user_choices,
        sim_outputs=req.sim_outputs,
    )
    return result


# ----------------------------- Multi-turn chat tutor -----------------------------


class ChatTurn(BaseModel):
    role: str  # 'user' | 'assistant'
    text: str


class ChatRequest(BaseModel):
    module_id: str
    step_key: str
    module_title: str
    concept: str
    key_ideas: list[str]
    question: str
    history: list[ChatTurn]


@router.post("/chat")
def chat(req: ChatRequest, user: UserInfo = Depends(get_current_user)):
    if not req.history:
        raise HTTPException(400, "history must contain at least one user turn")
    result = chat_turn(
        module_title=req.module_title,
        concept=req.concept,
        key_ideas=req.key_ideas,
        question=req.question,
        history=[t.model_dump() for t in req.history],
    )
    learn_models.record_checkpoint_score(
        user.id, req.module_id, req.step_key, result["hidden_score"]
    )
    return {"reply": result["reply"], "done": result["done"]}


# ----------------------------- Glossary explain -----------------------------


class ExplainRequest(BaseModel):
    term: str = ""
    context: str = ""
    question: str = ""


@router.post("/explain")
def explain(req: ExplainRequest, user: UserInfo = Depends(get_current_user)):
    text = explain_term(term=req.term, context=req.context, question=req.question)
    return {"explanation": text}


# ----------------------------- Voice (ElevenLabs) -----------------------------


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None


@router.post("/voice/tts")
def voice_tts(req: TTSRequest, user: UserInfo = Depends(get_current_user)):
    try:
        audio = synthesize(req.text, voice_id=req.voice_id)
    except VoiceUnavailable as e:
        raise HTTPException(503, str(e))
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/voice/stt")
async def voice_stt(
    file: UploadFile = File(...),
    user: UserInfo = Depends(get_current_user),
):
    data = await file.read()
    try:
        text = transcribe(data, mime=file.content_type or "audio/webm")
    except VoiceUnavailable as e:
        raise HTTPException(503, str(e))
    return {"text": text}


@router.get("/voice/status")
def voice_status(user: UserInfo = Depends(get_current_user)):
    from config import settings
    return {"enabled": bool((settings.elevenlabs_api_key or "").strip())}
