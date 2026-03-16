"""
Digital Twin Teaching Platform — FastAPI backend.

Routes:
  GET  /api/health                → health check
  GET  /api/replicas              → list Tavus replicas (find your replica_id)
  GET  /api/personas              → list existing Tavus personas
  POST /api/persona               → create/update teaching persona
  POST /api/conversations         → start a new CVI session
  DELETE /api/conversations/{id}  → end a session
  POST /api/llm                   → custom LLM endpoint (called by Tavus)
  POST /api/notes                 → upload notes text
  POST /api/notes/file            → upload notes file (PDF/DOCX/TXT)
  GET  /api/notes/topics          → list stored topics
  DELETE /api/notes/{topic}       → delete a topic
  POST /api/lecture               → inject a lecture-start prompt into context
  WS   /ws/emotion/{session_id}   → receive emotion data from browser MediaPipe
"""
import os
import json
import logging
import asyncio
from typing import Optional
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from openai import AsyncOpenAI

from .rag import RAGSystem
from .tavus_client import TavusClient
from .models import (
    LLMRequest, EmotionPayload, ConversationRequest,
    NotesIngestRequest, LectureRequest
)

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
rag: Optional[RAGSystem] = None
tavus: Optional[TavusClient] = None
openai_client: Optional[AsyncOpenAI] = None

# emotion_store[session_id] = {"emotion": "confused", "gaze_away": False, ...}
emotion_store: dict[str, dict] = {}
# persona_store: cached persona_id for the professor
persona_store: dict[str, str] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag, tavus, openai_client
    logger.info("Starting up Digital Twin backend…")
    rag = RAGSystem(persist_dir=os.getenv("CHROMA_DIR", "./data/chroma"))
    openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    try:
        tavus = TavusClient()
        logger.info("Tavus client initialized.")
    except ValueError as e:
        logger.warning(f"Tavus not configured: {e}. Avatar features will be unavailable.")
    yield
    logger.info("Shutdown.")


app = FastAPI(title="Digital Twin Teaching API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded notes files
Path("./data/notes").mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_professor_context() -> str:
    """Load professor_context.txt and extract the prompt-relevant sections."""
    config_path = Path("../config/professor_context.txt")
    if not config_path.exists():
        config_path = Path("./config/professor_context.txt")
    if not config_path.exists():
        return ""
    text = config_path.read_text(encoding="utf-8")
    # Strip comment lines (starting with #) and blank lines, keep content
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            continue
        lines.append(stripped)
    return "\n".join(lines)


def _build_system_prompt(topic: Optional[str], emotion: Optional[dict], lecture_script: Optional[str]) -> str:
    context = _load_professor_context()

    if context:
        base = context
    else:
        prof_name = os.getenv("PROFESSOR_NAME", "Professor")
        base = (
            f"You are {prof_name}, a university professor delivering a 1:1 tutoring session. "
            "You are knowledgeable, patient, and encouraging. Speak naturally and conversationally. "
            "Keep responses concise (2-4 sentences) unless giving a lecture. "
            "Use clear examples. Never make up facts — if you don't know, say so. "
        )

    if topic:
        base += f"\n\nThe current session topic is: {topic}."
    if lecture_script:
        base += (
            "\n\nLECTURE MODE: Deliver the following lecture script naturally, "
            "pausing for questions if the student interrupts:\n\n" + lecture_script
        )
    if emotion:
        em = emotion.get("emotion", "neutral")
        gaze = emotion.get("gaze_away", False)
        if em == "confused":
            base += "\n\n[SYSTEM: The student appears CONFUSED. Slow down, simplify, and ask if they need clarification.]"
        elif em == "bored" or gaze:
            base += "\n\n[SYSTEM: The student seems DISENGAGED or distracted. Re-engage them with a question or interesting example.]"
        elif em == "surprised":
            base += "\n\n[SYSTEM: The student looks SURPRISED — they may have just understood something. Reinforce it.]"
    return base


async def _rag_augment_messages(messages: list, topic: Optional[str] = None) -> list:
    """Inject RAG context into the last user message."""
    if not messages:
        return messages
    last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    if not last_user:
        return messages
    question = last_user.get("content", "")
    context = rag.query(question, topic=topic, n_results=4)
    if context:
        aug = list(messages)
        for i in range(len(aug) - 1, -1, -1):
            if aug[i].get("role") == "user":
                aug[i] = {
                    "role": "user",
                    "content": (
                        f"{aug[i]['content']}\n\n"
                        f"[Relevant notes for context:\n{context}\n]"
                    )
                }
                break
        return aug
    return messages


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "rag_chunks": rag.collection.count() if rag else 0,
        "topics": rag.list_topics() if rag else [],
        "tavus_configured": tavus is not None
    }


# ---------------------------------------------------------------------------
# Tavus replica / persona management
# ---------------------------------------------------------------------------

@app.get("/api/replicas")
async def list_replicas():
    """List your Tavus replicas to find your replica_id."""
    if not tavus:
        raise HTTPException(503, "Tavus not configured")
    return await tavus.list_replicas()


@app.get("/api/personas")
async def list_personas():
    if not tavus:
        raise HTTPException(503, "Tavus not configured")
    return await tavus.list_personas()


@app.post("/api/persona")
async def create_persona(
    name: str = Form(os.getenv("PROFESSOR_NAME", "Professor")),
    replica_id: str = Form(os.getenv("TAVUS_REPLICA_ID", "")),
    topic: Optional[str] = Form(None),
):
    """Create a Tavus persona. Call once to set up your digital twin."""
    if not tavus:
        raise HTTPException(503, "Tavus not configured")
    system_prompt = _build_system_prompt(topic, None, None)
    result = await tavus.create_persona(
        name=name,
        system_prompt=system_prompt,
        replica_id=replica_id or None,
    )
    persona_id = result.get("persona_id") or result.get("id")
    if persona_id:
        persona_store["default"] = persona_id
        logger.info(f"Persona created/updated: {persona_id}")
    return result


# ---------------------------------------------------------------------------
# Conversations (CVI sessions)
# ---------------------------------------------------------------------------

@app.post("/api/conversations")
async def start_conversation(req: ConversationRequest):
    """Start a Tavus CVI session. Returns conversation_url to embed in the frontend."""
    if not tavus:
        raise HTTPException(503, "Tavus not configured — set TAVUS_API_KEY in .env")

    persona_id = persona_store.get("default") or os.getenv("TAVUS_PERSONA_ID", "").strip()
    if not persona_id:
        # Auto-create persona on first use
        replica_id = os.getenv("TAVUS_REPLICA_ID", "").strip() or None
        prof_name = os.getenv("PROFESSOR_NAME", "Professor")
        system_prompt = _build_system_prompt(None, None, None)
        result = await tavus.create_persona(
            name=prof_name,
            system_prompt=system_prompt,
            replica_id=replica_id,
        )
        persona_id = result.get("persona_id") or result.get("id")
        if not persona_id:
            raise HTTPException(500, "Failed to auto-create Tavus persona.")
        persona_store["default"] = persona_id
        logger.info(f"Auto-created persona: {persona_id}")

    result = await tavus.create_conversation(
        persona_id=persona_id,
        conversation_name=req.topic or "Teaching Session",
    )
    conversation_id = result.get("conversation_id") or result.get("id")
    logger.info(f"Conversation started: {conversation_id}")
    return result


@app.delete("/api/conversations/{conversation_id}")
async def end_conversation(conversation_id: str):
    if not tavus:
        raise HTTPException(503, "Tavus not configured")
    ok = await tavus.end_conversation(conversation_id)
    return {"ended": ok}


# ---------------------------------------------------------------------------
# Custom LLM endpoint — Tavus calls this for every student utterance
# ---------------------------------------------------------------------------

@app.post("/api/llm")
async def custom_llm(req: LLMRequest):
    """
    Tavus-compatible custom LLM endpoint.
    Receives OpenAI-format messages, augments with RAG + emotion, calls GPT-4o.
    Supports both streaming and non-streaming.
    """
    messages = [m.model_dump() for m in req.messages]

    # Determine current topic from conversation context (best-effort)
    topic = None
    for m in messages:
        if m["role"] == "system" and "topic" in m["content"].lower():
            # Try to extract topic hint if present
            pass  # could parse if we injected structured hints earlier

    # Get emotion for this session
    session_id = req.conversation_id
    emotion = emotion_store.get(session_id) if session_id else None

    # Rebuild system prompt with current emotion
    if messages and messages[0]["role"] == "system":
        messages[0]["content"] = _build_system_prompt(topic, emotion, None)
    else:
        messages.insert(0, {
            "role": "system",
            "content": _build_system_prompt(topic, emotion, None)
        })

    # RAG augmentation
    messages = await _rag_augment_messages(messages, topic=topic)

    if req.stream:
        async def generate():
            async with openai_client.beta.realtime if hasattr(openai_client, 'beta') else openai_client as _:
                pass
            stream = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                temperature=req.temperature or 0.7,
                max_tokens=req.max_tokens or 512,
                stream=True
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices[0].delta.content else ""
                data = {
                    "choices": [{"delta": {"content": delta, "role": "assistant"}, "finish_reason": chunk.choices[0].finish_reason}]
                }
                yield f"data: {json.dumps(data)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")
    else:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=req.temperature or 0.7,
            max_tokens=req.max_tokens or 512,
        )
        return JSONResponse(response.model_dump())


# ---------------------------------------------------------------------------
# Notes management
# ---------------------------------------------------------------------------

@app.post("/api/notes")
async def ingest_notes(req: NotesIngestRequest):
    """Ingest plain text notes for a topic."""
    count = rag.ingest_text(req.content, topic=req.topic, source="text")
    return {"chunks_added": count, "topic": req.topic}


@app.post("/api/notes/file")
async def ingest_notes_file(
    topic: str = Form(...),
    file: UploadFile = File(...)
):
    """Upload a PDF, DOCX, or TXT file and ingest its text."""
    content = await file.read()
    text = ""
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()

    if ext == ".txt":
        text = content.decode("utf-8", errors="ignore")

    elif ext == ".pdf":
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)

    elif ext in (".docx", ".doc"):
        import io
        from docx import Document
        doc = Document(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs)

    else:
        raise HTTPException(400, f"Unsupported file type: {ext}. Use .txt, .pdf, or .docx")

    # Optionally clean up with GPT before ingesting
    clean = os.getenv("AUTO_CLEAN_NOTES", "false").lower() == "true"
    if clean and text:
        resp = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    f"Clean up these class notes on '{topic}' into a clear, well-structured knowledge base. "
                    "Fix grammar, clarify definitions, and ensure consistency. Return only the cleaned text.\n\n"
                    + text[:8000]
                )
            }],
            max_tokens=4096
        )
        text = resp.choices[0].message.content or text

    count = rag.ingest_text(text, topic=topic, source=filename)
    return {"filename": filename, "topic": topic, "chunks_added": count, "chars": len(text)}


@app.get("/api/notes/topics")
async def list_topics():
    return {"topics": rag.list_topics()}


@app.delete("/api/notes/{topic}")
async def delete_topic(topic: str):
    count = rag.delete_topic(topic)
    return {"deleted_chunks": count, "topic": topic}


# ---------------------------------------------------------------------------
# Lecture injection
# ---------------------------------------------------------------------------

@app.post("/api/lecture/script")
async def generate_lecture_script(req: LectureRequest):
    """
    Generate a lecture script from RAG context + GPT-4o.
    Returns the script text — paste it into the conversation or use it as context.
    """
    context = rag.query(req.topic, topic=req.topic, n_results=6)
    prompt_messages = [
        {
            "role": "system",
            "content": (
                f"You are {os.getenv('PROFESSOR_NAME', 'Professor')}, preparing a {req.duration_minutes}-minute "
                "lecture script. Write in first person, conversational teaching style. "
                "Use the provided notes as source material. Include 2-3 key concepts with examples. "
                "End with a question to check understanding."
            )
        },
        {
            "role": "user",
            "content": (
                f"Generate a {req.duration_minutes}-minute lecture on: {req.topic}\n\n"
                + (f"Notes:\n{context}" if context else "Use your general knowledge.")
            )
        }
    ]
    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=prompt_messages,
        max_tokens=1500,
        temperature=0.7
    )
    script = response.choices[0].message.content
    return {"topic": req.topic, "duration_minutes": req.duration_minutes, "script": script}


# ---------------------------------------------------------------------------
# WebSocket — receive emotion data from browser MediaPipe
# ---------------------------------------------------------------------------

@app.websocket("/ws/emotion/{session_id}")
async def emotion_websocket(websocket: WebSocket, session_id: str):
    """
    Browser MediaPipe sends emotion payloads here.
    We store the latest state and inject it into LLM calls.
    """
    await websocket.accept()
    logger.info(f"Emotion WS connected: {session_id}")
    emotion_store[session_id] = {"emotion": "neutral", "gaze_away": False}
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            emotion_store[session_id] = payload
            # Acknowledge
            await websocket.send_text(json.dumps({"ack": True, "emotion": payload.get("emotion")}))
    except WebSocketDisconnect:
        logger.info(f"Emotion WS disconnected: {session_id}")
        emotion_store.pop(session_id, None)
    except Exception as e:
        logger.error(f"Emotion WS error: {e}")


# ---------------------------------------------------------------------------
# Serve frontend static files (after `npm run build`)
# ---------------------------------------------------------------------------
frontend_dist = Path("../frontend/dist")
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
