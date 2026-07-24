"""
Zoho QuickML LLM Client — Thin, reusable wrapper for Zoho QuickML integrations via PydanticAI.
"""

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
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
                    if content:
                        prompt_parts.append(f"Assistant: {content}")
                    elif msg.get("tool_calls"):
                        tc_info = [tc.get("function", {}).get("arguments", "") for tc in msg.get("tool_calls", [])]
                        prompt_parts.append(f"Assistant (Tool Executed): {', '.join(tc_info)}")
                elif role in ("tool", "function"):
                    prompt_parts.append(f"Database Query Output: {content}\n(Instructions: Present the final answer to the user based on the database output above. Do NOT write SQL queries again.)")
            
            # Use 1x1 transparent PNG fallback if images list is empty to bypass Zoho validation constraints
            if not images_list:
                images_list = ["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="]
            
            # Check if history already contains a tool result
            tool_outputs = [msg.get("content", "") for msg in messages if msg.get("role") in ("tool", "function")]
            user_messages = [msg.get("content", "") for msg in messages if msg.get("role") == "user"]
            last_user_msg = user_messages[-1] if user_messages else ""
            if isinstance(last_user_msg, list):
                last_user_msg = " ".join([p.get("text", "") for p in last_user_msg if isinstance(p, dict) and p.get("type") == "text"])

            tool_instruction = "\n\nCRITICAL TOOL INSTRUCTION: You are connected to a live PostgreSQL database tool 'execute_select_query'. For any question about cases, FIR numbers, police stations, suspects, officers, or data, you MUST write an SQL SELECT query inside <execute_select_query>YOUR SELECT QUERY HERE</execute_select_query> tags to retrieve the data. Do NOT reply with generic text."
            if not system_prompt or system_prompt == "Be concise and factual.":
                system_prompt = "You are the KSP Command Intelligence Assistant." + tool_instruction
            else:
                system_prompt += tool_instruction

            if tool_outputs:
                combined_db_data = "\n\n".join([str(out) for out in tool_outputs if out])
                prompt = (
                    f"USER QUESTION: {last_user_msg}\n\n"
                    f"RETRIEVED POSTGRESQL DATABASE RECORDS:\n{combined_db_data}\n\n"
                    f"EXECUTIVE REPORT INSTRUCTIONS:\n"
                    f"Provide a polished, professional police intelligence report answering the user's question using the retrieved database records above.\n"
                    f"Present all retrieved FIR details, police station names, crime categories, suspect profiles, and brief facts.\n"
                    f"DO NOT print raw debugging text or internal SQL log commentary like '0 Rows Returned. The casemaster table was queried'. If an exact FIR is not found, state that and present the active/historical FIR records for that station from the retrieved database data."
                )
            else:
                if len(prompt_parts) == 1 and prompt_parts[0].startswith("User: "):
                    prompt = prompt_parts[0][len("User: "):]
                else:
                    prompt = "\n".join(prompt_parts)

                prompt += "\n\n[INSTRUCTION: To answer this question, generate an SQL SELECT query inside <execute_select_query>SELECT ...</execute_select_query> tags. Query casemaster (joined with unit and crimehead) AND investigation_cases / cases. If searching for a station or FIR, use LIKE on unit.unitname, cases.police_station, and casemaster.caseno.]"
                
            quickml_data = {
                "prompt": prompt,
                "model": "VL-Qwen3.6-35B-A3B",
                "images": images_list,
                "system_prompt": system_prompt,
                "temperature": req_data.get("temperature", 0.7),
                "top_k": 50,
                "top_p": 0.9,
                "max_tokens": req_data.get("max_tokens", 2048)
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
        logger.info(f"Zoho QuickML raw response length: {len(content_str)}")
        
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
                
                # Check if history already contains a tool result
                has_tool_result = any(msg.get("role") in ("tool", "function") for msg in messages)
                
                # Check if the model tried to call the execute_select_query tool
                sql_query = None
                
                # Format 1: <execute_select_query>SELECT ...</execute_select_query>
                m1 = re.search(r"<execute_select_query>\s*(.*?)\s*</execute_select_query>", generated_text, re.DOTALL | re.IGNORECASE)
                if m1:
                    sql_query = m1.group(1).strip()
                
                # Format 2: <tool_code>...</tool_code>
                if not sql_query:
                    m2 = re.search(r"<tool_code>\s*(.*?)\s*</tool_code>", generated_text, re.DOTALL | re.IGNORECASE)
                    if m2:
                        content = m2.group(1).strip()
                        m2_inner = re.search(r"execute_select_query\(\s*(?:(?:query|sql)\s*=\s*)?[\"'](.*?)[\"']\s*\)", content, re.DOTALL | re.IGNORECASE)
                        if m2_inner:
                            sql_query = m2_inner.group(1).strip()
                        else:
                            sql_query = content

                # Format 3: execute_select_query("...")
                if not sql_query:
                    m3 = re.search(r"execute_select_query\(\s*(?:(?:query|sql)\s*=\s*)?[\"'](.*?)[\"']\s*\)", generated_text, re.DOTALL | re.IGNORECASE)
                    if m3:
                        sql_query = m3.group(1).strip()

                # Fallback formats (only if no tool result exists in history yet)
                if not sql_query and not has_tool_result:
                    # Format 4: ```sql SELECT ... ```
                    m4 = re.search(r"```(?:sql)?\s*(.*?)\s*```", generated_text, re.DOTALL | re.IGNORECASE)
                    if m4:
                        sql_query = m4.group(1).strip()

                    # Format 5: Raw SELECT / WITH statement
                    if not sql_query:
                        m5 = re.search(r"\b(SELECT|WITH)\b[\s\S]+?(?:;|$)", generated_text, re.IGNORECASE)
                        if m5 and ("FROM" in generated_text.upper()):
                            sql_query = m5.group(0).strip()

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


def get_quickml_model() -> OpenAIChatModel:
    """
    Create and return an OpenAIModel instance configured to route requests through Zoho QuickML.
    """
    client = httpx.AsyncClient(transport=ZohoQuickMLTransport())
    return OpenAIChatModel(
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
