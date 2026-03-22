from pydantic import BaseModel
from typing import Optional, List


class Message(BaseModel):
    role: str
    content: str


class LLMRequest(BaseModel):
    """Tavus-compatible custom LLM request (OpenAI chat completions format)."""
    model: Optional[str] = "gpt-4o"
    messages: List[Message]
    stream: Optional[bool] = False
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 512
    # Tavus passes this so we can match emotion state
    conversation_id: Optional[str] = None


class EmotionPayload(BaseModel):
    session_id: str
    emotion: str          # confused | bored | engaged | surprised | neutral
    confidence: float     # 0.0 - 1.0
    gaze_away: bool = False
    mouth_open: bool = False


class ConversationRequest(BaseModel):
    persona_name: Optional[str] = "Digital Twin Professor"
    topic: Optional[str] = None
    lecture_script: Optional[str] = None   # if set, session opens in lecture mode


class NotesIngestRequest(BaseModel):
    topic: str
    content: str


class LectureRequest(BaseModel):
    topic: str
    duration_minutes: int = 6
    conversation_id: Optional[str] = None  # not required — script generated pre-session


class SavedScript(BaseModel):
    id: str
    topic: str
    script: str
    duration_minutes: int
    created_at: str
    updated_at: str


class SaveScriptRequest(BaseModel):
    topic: str
    script: str
    duration_minutes: int = 6


class UpdateScriptRequest(BaseModel):
    script: str
