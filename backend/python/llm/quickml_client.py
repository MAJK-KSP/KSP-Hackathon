"""
Zoho QuickML LLM Client — Thin, reusable wrapper for Zoho QuickML integrations via PydanticAI.
"""

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

from config import settings

import httpx
import json
import logging

logger = logging.getLogger("uvicorn.error")

import time

_cached_token = None
_token_expiry = 0

async def get_zoho_token() -> str:
    """Dynamically fetch a fresh Zoho access token if refresh credentials are provided, or fallback to static token."""
    global _cached_token, _token_expiry
    
    # If cached token is still valid (with 5 minutes buffer), reuse it
    if _cached_token and time.time() < _token_expiry - 300:
        return _cached_token

    if settings.zoho_refresh_token and settings.zoho_client_id and settings.zoho_client_secret:
        try:
            # Bypass SSL verification under development cert environments
            async with httpx.AsyncClient(verify=False) as client:
                resp = await client.post(
                    "https://accounts.zoho.in/oauth/v2/token",
                    data={
                        "refresh_token": settings.zoho_refresh_token,
                        "client_id": settings.zoho_client_id,
                        "client_secret": settings.zoho_client_secret,
                        "grant_type": "refresh_token"
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    token = data.get("access_token")
                    expires_in = data.get("expires_in", 3600)
                    if token:
                        logger.info("Successfully refreshed Zoho OAuth access token.")
                        _cached_token = token
                        _token_expiry = time.time() + expires_in
                        return token
                logger.error(f"Failed to refresh Zoho token: {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Error fetching Zoho access token: {e}")
            
    return settings.zoho_access_token



class ZohoQuickMLTransport(httpx.AsyncHTTPTransport):
    """
    Custom transport to intercept standard OpenAI requests from PydanticAI
    and redirect them to the Zoho QuickML REST endpoint with proper authorization, headers, and request body format.
    """
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        # Get dynamic access token
        access_token = await get_zoho_token()
        
        # Override request URL and Host header to point to the Zoho QuickML endpoint
        request.url = httpx.URL(settings.quickml_endpoint_url)
        request.headers["Host"] = request.url.host
        
        # Replace headers
        request.headers["Content-Type"] = "application/json"
        request.headers["CATALYST-ORG"] = settings.catalyst_org
        if access_token:
            request.headers["Authorization"] = f"Zoho-oauthtoken {access_token}"
        else:
            request.headers.pop("Authorization", None)
        request.headers["Connection"] = "close"
        
        # Read the raw request content (which is standard OpenAI format sent by PydanticAI)
        req_content = await request.aread()
        try:
            req_data = json.loads(req_content.decode("utf-8"))
            
            # Map OpenAI format to Zoho QuickML format
            messages = req_data.get("messages", [])
            system_prompt = "Be concise and factual."
            prompt_parts = []
            images_list = []
            
            for msg in messages:
                role = msg.get("role")
                content = msg.get("content", "")
                if role == "system":
                    system_prompt = content
                elif role == "user":
                    if isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict):
                                if part.get("type") == "text":
                                    prompt_parts.append(f"User: {part.get('text', '')}")
                                elif part.get("type") == "image_url":
                                    img_url = part.get("image_url", {}).get("url", "")
                                    if img_url.startswith("data:image"):
                                        base64_data = img_url.split("base64,")[-1]
                                        images_list.append(base64_data)
                    else:
                        prompt_parts.append(f"User: {content}")
                elif role == "assistant":
                    prompt_parts.append(f"Assistant: {content}")
            
            # Use 1x1 transparent PNG fallback if images list is empty to bypass Zoho validation constraints
            if not images_list:
                images_list = ["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="]
            
            if len(prompt_parts) == 1 and prompt_parts[0].startswith("User: "):
                prompt = prompt_parts[0][len("User: "):]
            else:
                prompt = "\n".join(prompt_parts)
                
            quickml_data = {
                "prompt": prompt,
                "model": "VL-Qwen3.6-35B-A3B",
                "images": images_list,
                "system_prompt": system_prompt,
                "temperature": req_data.get("temperature", 0.7),
                "top_k": 50,
                "top_p": 0.9,
                "max_tokens": req_data.get("max_tokens", 500)
            }
            
            # Rewrite request content and stream
            request._content = json.dumps(quickml_data).encode("utf-8")
            request.stream = httpx.ByteStream(request._content)
            # Update Content-Length header
            request.headers["Content-Length"] = str(len(request._content))
        except Exception as e:
            logger.error(f"Error mapping OpenAI request to Zoho QuickML: {e}")
            
        # Dispatch request
        response = await super().handle_async_request(request)
        
        # Read the raw response content
        await response.aread()
        content_str = response.content.decode("utf-8")
        print(f"Zoho QuickML raw response: {content_str}")
        
        try:
            data = json.loads(content_str)
            
            # If the response doesn't have OpenAI-style choices list, wrap it
            if isinstance(data, dict) and "choices" not in data:
                generated_text = ""
                if "response" in data:
                    generated_text = data["response"]
                elif "output" in data:
                    generated_text = data["output"]
                elif "result" in data:
                    generated_text = data["result"]
                elif "generated_text" in data:
                    generated_text = data["generated_text"]
                else:
                    # Check if there is any string value
                    for val in data.values():
                        if isinstance(val, str):
                            generated_text = val
                            break
                            
                import re
                
                # Check if the model tried to call the execute_select_query tool
                sql_query = None
                
                # Format 1: <execute_select_query>SELECT ...</execute_select_query>
                m1 = re.search(r"<execute_select_query>\s*(.*?)\s*</execute_select_query>", generated_text, re.DOTALL | re.IGNORECASE)
                if m1:
                    sql_query = m1.group(1).strip()
                else:
                    # Format 2: <tool_code>...execute_select_query("...")</tool_code>
                    m2 = re.search(r"execute_select_query\(\s*(?:(?:query|sql)\s*=\s*)?[\"'](.*?)[\"']\s*\)", generated_text, re.DOTALL | re.IGNORECASE)
                    if m2:
                        sql_query = m2.group(1).strip()
                    else:
                        # Format 3: markdown SQL block ```sql SELECT ... ```
                        m3 = re.search(r"```sql\s*(.*?)\s*```", generated_text, re.DOTALL | re.IGNORECASE)
                        if m3:
                            sql_query = m3.group(1).strip()

                if sql_query:
                    openai_data = {
                        "id": "zoho-quickml-msg",
                        "object": "chat.completion",
                        "created": 1721385412,
                        "model": "VL-Qwen3.6-35B-A3B",
                        "choices": [
                            {
                                "index": 0,
                                "message": {
                                    "role": "assistant",
                                    "content": None,
                                    "tool_calls": [
                                        {
                                            "id": "call_zoho_sql",
                                            "type": "function",
                                            "function": {
                                                "name": "execute_select_query",
                                                "arguments": json.dumps({"sql": sql_query})
                                            }
                                        }
                                    ]
                                },
                                "finish_reason": "tool_calls"
                            }
                        ]
                    }
                else:
                    openai_data = {
                        "id": "zoho-quickml-msg",
                        "object": "chat.completion",
                        "created": 1721385412,
                        "model": "VL-Qwen3.6-35B-A3B",
                        "choices": [
                            {
                                "index": 0,
                                "message": {
                                    "role": "assistant",
                                    "content": generated_text
                                },
                                "finish_reason": "stop"
                            }
                        ]
                    }
                
                # Rewrite response content
                response._content = json.dumps(openai_data).encode("utf-8")
                response.status_code = 200
        except Exception as e:
            logger.error(f"Error post-processing Zoho QuickML response: {e}")
            
        return response


def get_quickml_model() -> OpenAIModel:
    """
    Create and return an OpenAIModel instance configured to route requests through Zoho QuickML.
    """
    client = httpx.AsyncClient(transport=ZohoQuickMLTransport())
    return OpenAIModel(
        model_name="VL-Qwen3.6-35B-A3B",
        provider=OpenAIProvider(base_url="https://api.catalyst.zoho.in", api_key="placeholder", http_client=client),
    )


async def generate_briefing(system_prompt: str, data: str) -> str:
    """
    Generate an operational brief using Zoho QuickML.
    """
    model = get_quickml_model()

    agent = Agent(
        model=model,
        system_prompt=system_prompt,
    )

    result = await agent.run(data)
    return result.output
