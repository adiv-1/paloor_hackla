"""
Deep Analysis API endpoints.

Provides endpoints to trigger, monitor, and retrieve multi-agent
trading analyses. Progress is streamed via SSE for real-time updates.
"""
from __future__ import annotations

import json
import logging
import queue
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user, UserInfo
from chat.deep_analysis import (
    run_analysis,
    get_analysis,
    list_user_analyses,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    ticker: str
    conversation_id: Optional[str] = None


class AnalysisResponse(BaseModel):
    analysis_id: str
    status: str
    ticker: str


# ---------------------------------------------------------------------------
# POST /api/analysis — Trigger a new deep analysis (SSE progress stream)
# ---------------------------------------------------------------------------

@router.post("")
async def create_analysis(
    req: AnalysisRequest,
    user: UserInfo = Depends(get_current_user),
):
    """
    Start a deep analysis and stream progress via SSE.
    Returns an SSE stream with agent progress events and the final result.
    """
    ticker = req.ticker.upper().strip()
    if not ticker or len(ticker) > 10:
        raise HTTPException(400, "Invalid ticker")

    # Thread-safe queue for progress updates
    progress_queue: queue.Queue = queue.Queue()
    result_holder: list = [None]
    error_holder: list = [None]

    def progress_callback(agent_name: str, status: str, label: str):
        progress_queue.put({
            "type": "agent_progress",
            "agent": agent_name,
            "status": status,
            "label": label,
        })

    def run_in_thread():
        try:
            result = run_analysis(
                user_id=user.id,
                ticker=ticker,
                conversation_id=req.conversation_id,
                progress_callback=progress_callback,
            )
            result_holder[0] = result
        except Exception as e:
            logger.error("Analysis failed: %s", e)
            error_holder[0] = str(e)
        finally:
            progress_queue.put(None)  # Signal completion

    # Start analysis in background thread
    thread = threading.Thread(target=run_in_thread, daemon=True)
    thread.start()

    def event_stream():
        def _json_dumps(obj):
            return json.dumps(obj, default=str)

        while True:
            try:
                event = progress_queue.get(timeout=300)  # 5 min timeout
            except queue.Empty:
                yield f"data: {_json_dumps({'type': 'error', 'message': 'Analysis timed out'})}\n\n"
                break

            if event is None:
                # Analysis complete
                if error_holder[0]:
                    yield f"data: {_json_dumps({'type': 'error', 'message': error_holder[0]})}\n\n"
                elif result_holder[0]:
                    yield f"data: {_json_dumps({'type': 'analysis_complete', 'analysis': result_holder[0]})}\n\n"
                break
            else:
                yield f"data: {_json_dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/analysis — List user's analyses
# ---------------------------------------------------------------------------

@router.get("")
async def list_analyses(
    limit: int = Query(20, le=50),
    user: UserInfo = Depends(get_current_user),
):
    """List the user's past analyses."""
    analyses = list_user_analyses(user.id, limit=limit)
    return {"analyses": analyses}


# ---------------------------------------------------------------------------
# GET /api/analysis/{analysis_id} — Get full analysis with reports
# ---------------------------------------------------------------------------

@router.get("/{analysis_id}")
async def get_analysis_detail(
    analysis_id: str,
    user: UserInfo = Depends(get_current_user),
):
    """Get a complete analysis with all agent reports."""
    analysis = get_analysis(analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    if analysis["user_id"] != user.id:
        raise HTTPException(403, "Not authorized")
    return analysis
