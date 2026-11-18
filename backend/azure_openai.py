import os
from typing import Any

import httpx


def azure_config() -> dict[str, str]:
    return {
        "endpoint": os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/"),
        "api_key": os.getenv("AZURE_OPENAI_KEY") or "",
        "deployment": os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME") or "",
        "api_version": os.getenv("AZURE_OPENAI_API_VERSION") or "",
    }


def azure_is_configured() -> bool:
    cfg = azure_config()
    return all(cfg[k] for k in ("endpoint", "api_key", "deployment", "api_version"))


async def azure_chat_completion(
    messages: list[dict[str, Any]],
    *,
    temperature: float = 0.2,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict | None = None,
    timeout: float = 60,
) -> dict[str, Any]:
    """Adapter：沿用既有 Azure Chat Completions 部署，不假設有 Responses API。"""
    cfg = azure_config()
    if not all(cfg[k] for k in ("endpoint", "api_key", "deployment", "api_version")):
        return {
            "configured": False,
            "content": "Azure OpenAI env not set.",
            "tool_calls": [],
            "deployment": cfg.get("deployment") or "",
            "raw": None,
        }

    url = f"{cfg['endpoint']}/openai/deployments/{cfg['deployment']}/chat/completions"
    payload: dict[str, Any] = {
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        payload["tools"] = tools
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            url,
            params={"api-version": cfg["api_version"]},
            headers={"api-key": cfg["api_key"], "Content-Type": "application/json"},
            json=payload,
        )
        r.raise_for_status()
        data = r.json()

    msg = ((data.get("choices") or [{}])[0].get("message")) or {}
    tool_calls = []
    for call in msg.get("tool_calls") or []:
        fn = call.get("function") or {}
        tool_calls.append({
            "id": call.get("id") or "",
            "name": fn.get("name") or "",
            "arguments": fn.get("arguments") or "{}",
        })
    return {
        "configured": True,
        "content": msg.get("content") or "",
        "tool_calls": tool_calls,
        "deployment": cfg["deployment"],
        "raw": data,
    }


async def azure_chat(prompt: str) -> str:
    result = await azure_chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You are an English speaking coach for a student analytics dashboard. "
                    "You must follow the requested output format exactly. "
                    "If the user asks for JSON, output valid JSON only and nothing else."
                ),
            },
            {"role": "user", "content": prompt},
        ]
    )
    return result.get("content") or ""