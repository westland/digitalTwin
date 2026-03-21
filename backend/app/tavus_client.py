"""
Tavus CVI (Conversational Video Interface) API client.
Docs: https://docs.tavus.io/api-reference
"""
import os
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

TAVUS_API_BASE = "https://tavusapi.com"


class TavusClient:
    def __init__(self):
        self.api_key = os.getenv("TAVUS_API_KEY")
        if not self.api_key:
            raise ValueError("TAVUS_API_KEY environment variable not set")
        self.headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json"
        }

    async def create_persona(
        self,
        name: str,
        system_prompt: str,
        replica_id: Optional[str] = None,
    ) -> dict:
        """Create or get a Tavus persona."""
        payload = {
            "persona_name": name,
            "system_prompt": system_prompt,
        }
        if replica_id:
            payload["default_replica_id"] = replica_id

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{TAVUS_API_BASE}/v2/personas",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            resp.raise_for_status()
            return resp.json()

    async def create_conversation(
        self,
        persona_id: str,
        conversation_name: Optional[str] = None,
        conversational_context: Optional[str] = None,
    ) -> dict:
        """
        Start a CVI conversation session.
        Returns conversation object with `conversation_url` for embedding.
        """
        payload = {
            "persona_id": persona_id,
            "conversational_context": conversational_context or (
                "This is a 1:1 teaching session. The student may ask questions or listen to a lecture."
            ),
        }
        if conversation_name:
            payload["conversation_name"] = conversation_name

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{TAVUS_API_BASE}/v2/conversations",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            if not resp.is_success:
                logger.error(f"Tavus create_conversation failed {resp.status_code}: {resp.text}")
            resp.raise_for_status()
            return resp.json()

    async def end_conversation(self, conversation_id: str) -> bool:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{TAVUS_API_BASE}/v2/conversations/{conversation_id}",
                headers=self.headers,
                timeout=15.0
            )
            return resp.status_code in (200, 204)

    async def list_replicas(self) -> dict:
        """List your trained digital twin replicas."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{TAVUS_API_BASE}/v2/replicas",
                headers=self.headers,
                timeout=15.0
            )
            resp.raise_for_status()
            return resp.json()

    async def list_personas(self) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{TAVUS_API_BASE}/v2/personas",
                headers=self.headers,
                timeout=15.0
            )
            resp.raise_for_status()
            return resp.json()
