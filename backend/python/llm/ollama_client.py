"""
Ollama LLM Client — Thin, reusable wrapper for Ollama interactions via PydanticAI.

Uses PydanticAI's Agent with an OpenAI-compatible model pointed at the local
Ollama server. Ollama exposes an OpenAI-compatible API at /v1, so we use the
OpenAI provider with a custom base_url.

Every future feature (Crime DNA, recommendations, etc.) will also need LLM
access. This prevents Ollama config duplication.
"""

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.ollama import OllamaProvider

from config import settings


import httpx
import json

class OllamaFixTransport(httpx.AsyncHTTPTransport):
    """Custom transport to intercept and patch Ollama's response finish_reason from null to 'stop', using Connection: close to prevent hangs."""
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        request.headers["Connection"] = "close"
        response = await super().handle_async_request(request)
        if "/chat/completions" in str(request.url):
            await response.aread()
            try:
                data = json.loads(response.content.decode("utf-8"))
                if "choices" in data:
                    modified = False
                    for choice in data["choices"]:
                        msg = choice.get("message", {})
                        if choice.get("finish_reason") is None:
                            if msg.get("tool_calls"):
                                choice["finish_reason"] = "tool_calls"
                            else:
                                choice["finish_reason"] = "stop"
                            modified = True
                    if modified:
                        response._content = json.dumps(data).encode("utf-8")
            except Exception:
                pass
        return response


def get_ollama_model() -> OpenAIModel:
    """
    Create and return an OpenAI-compatible model instance pointing at Ollama.

    Returns:
        OpenAIModel: Configured model instance using Ollama's OpenAI-compatible API.
    """
    client = httpx.AsyncClient(transport=OllamaFixTransport())
    return OpenAIModel(
        model_name=settings.ollama_model,
        provider=OllamaProvider(base_url=settings.ollama_base_url, http_client=client),
    )



async def generate_briefing(system_prompt: str, data: str) -> str:
    """
    Generate an operational brief using the LLM.

    This is a straight prompt-in, text-out generation. No tool-use at the LLM
    level — the system prompt instructs the model, and the data is provided
    as the user message.

    Args:
        system_prompt: The system prompt instructing the LLM on format and behavior.
        data: Serialized operational data to include in the brief.

    Returns:
        str: The generated brief text.

    Raises:
        Exception: If Ollama is unreachable or the model returns an error.
    """
    model = get_ollama_model()

    agent = Agent(
        model=model,
        system_prompt=system_prompt,
    )

    result = await agent.run(data)
    return result.output
