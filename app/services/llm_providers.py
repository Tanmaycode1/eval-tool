"""LLM provider integrations for OpenAI, Anthropic, and Gemini"""
import os
from typing import Dict, Any, List, Optional
import httpx
import json


def get_api_key(key_name: str, default: Optional[str] = None) -> Optional[str]:
    """Get API key from database, fallback to environment variable"""
    try:
        from app.services.database import get_setting
        return get_setting(key_name, default)
    except Exception as e:
        print(f"Error getting API key from database, using environment: {e}")
        return os.getenv(key_name, default)


# API Keys from environment (kept for backward compatibility)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Model configurations
MODELS = {
    "openai": [
        "gpt-5.2",
        "gpt-5.1",
        "gpt-5",
        "gpt-4o",
        "gpt-4o-mini"
    ],
    "anthropic": [
        "claude-opus-4.5",
        "claude-opus-4.1",
        "claude-opus-4",
        "claude-sonnet-4.5",
        "claude-sonnet-4",
        "claude-haiku-4.5",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307"
    ],
    "gemini": [
        "gemini-3-pro-preview",
        "gemini-2.5-flash",
        "gemini-2.5-flash-preview-09-2025",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash-exp",
        "gemini-1.5-pro",
        "gemini-1.5-flash"
    ]
}

async def call_openai(
    model: str,
    prompt: str,
    image_urls: Optional[List[str]] = None,
    response_format: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Call OpenAI API - supports GPT-5.2, GPT-5.1, GPT-5, GPT-4o, and GPT-4o-mini"""
    # Get API key from database or environment
    api_key = get_api_key("OPENAI_API_KEY", "")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set in settings or environment variables")
    
    messages = []
    
    if image_urls:
        content = [{"type": "text", "text": prompt}]
        for img_url in image_urls:
            content.append({"type": "image_url", "image_url": {"url": img_url}})
        messages.append({"role": "user", "content": content})
    else:
        messages.append({"role": "user", "content": prompt})
    
    payload = {
        "model": model,
        "messages": messages
    }
    
    if response_format:
        payload["response_format"] = response_format
    
    try:
        # Use longer timeout for GPT-5 models which may take longer
        timeout = 180.0 if "gpt-5" in model else 120.0
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=timeout
            )
            response.raise_for_status()
            result = response.json()
            
            if "choices" not in result or len(result["choices"]) == 0:
                raise ValueError("No choices in OpenAI response")
            
            return {
                "content": result["choices"][0]["message"]["content"],
                "usage": result.get("usage", {}),
                "model": result.get("model", model)
            }
    except httpx.TimeoutException as e:
        raise ValueError(f"OpenAI API timeout: Request took longer than {timeout}s. The model may be processing a complex request. Please try again.")
    except httpx.HTTPStatusError as e:
        error_detail = "Unknown error"
        try:
            error_data = e.response.json()
            error_detail = error_data.get("error", {}).get("message", str(e))
        except:
            error_detail = e.response.text or str(e)
        raise ValueError(f"OpenAI API error ({e.response.status_code}): {error_detail}")
    except httpx.RequestError as e:
        raise ValueError(f"Network error calling OpenAI API: {str(e)}. Please check your internet connection and try again.")

async def call_anthropic(
    model: str,
    prompt: str,
    image_urls: Optional[List[str]] = None,
    response_format: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Call Anthropic API - supports schema via tool use"""
    # Get API key from database or environment
    api_key = get_api_key("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set in settings or environment variables")
    
    content = []
    
    if image_urls:
        for img_url in image_urls:
            # Extract base64 data if it's a data URL
            if img_url.startswith("data:image"):
                media_type = img_url.split(";")[0].split(":")[1]
                base64_data = img_url.split(",")[1]
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64_data
                    }
                })
    
    # If schema is provided, append instruction to follow it
    if response_format and "json_schema" in response_format:
        schema_instruction = f"\n\nPlease respond with valid JSON that matches this schema:\n{json.dumps(response_format['json_schema']['schema'], indent=2)}"
        prompt = prompt + schema_instruction
    
    content.append({"type": "text", "text": prompt})
    
    payload = {
        "model": model,
        "max_tokens": 4096,
        "messages": [
            {"role": "user", "content": content}
        ]
    }
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=120.0
            )
            response.raise_for_status()
            result = response.json()
            
            return {
                "content": result["content"][0]["text"],
                "usage": result.get("usage", {}),
                "model": result.get("model", model)
            }
    except httpx.TimeoutException as e:
        raise ValueError(f"Anthropic API timeout: Request took longer than 120s. Please try again.")
    except httpx.HTTPStatusError as e:
        error_detail = "Unknown error"
        try:
            error_data = e.response.json()
            error_detail = error_data.get("error", {}).get("message", str(e))
        except:
            error_detail = e.response.text or str(e)
        raise ValueError(f"Anthropic API error ({e.response.status_code}): {error_detail}")
    except httpx.RequestError as e:
        raise ValueError(f"Network error calling Anthropic API: {str(e)}. Please check your internet connection and try again.")

async def call_gemini(
    model: str,
    prompt: str,
    image_urls: Optional[List[str]] = None,
    response_format: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Call Google Gemini API - supports Gemini 3, 2.5, 2.0, and 1.5 models
    
    API Format (per official docs: https://ai.google.dev/gemini-api/docs/models):
    - Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    - Request: {"contents": [{"parts": [{"text": "..."}, {"inline_data": {...}}]}]}
    - Response: {"candidates": [{"content": {"parts": [{"text": "..."}]}}], "usageMetadata": {...}}
    
    Schema enforcement: Gemini doesn't support native structured outputs, so we inject schema as prompt instructions.
    """
    # Get API key from database or environment
    api_key = get_api_key("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set in settings or environment variables")
    
    parts = []
    
    # Add images first (if any) - format per Gemini API spec
    if image_urls:
        for img_url in image_urls:
            if img_url.startswith("data:image"):
                mime_type = img_url.split(";")[0].split(":")[1]
                base64_data = img_url.split(",")[1]
                parts.append({
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": base64_data
                    }
                })
            elif img_url.startswith("http"):
                # For HTTP URLs, we'd need to fetch and convert, but for now skip
                # Gemini API also supports file references, but that requires Files API
                pass
    
    # If schema is provided, append instruction to follow it (Gemini doesn't have native structured outputs)
    if response_format and "json_schema" in response_format:
        schema_instruction = f"\n\nPlease respond with valid JSON that matches this schema:\n{json.dumps(response_format['json_schema']['schema'], indent=2)}"
        prompt = prompt + schema_instruction
    
    # Add text prompt last
    parts.append({"text": prompt})
    
    # Construct payload per Gemini API format
    payload = {
        "contents": [
            {"parts": parts}
        ]
    }
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=120.0
            )
            response.raise_for_status()
            result = response.json()
            
            # Validate response structure according to Gemini API format
            if "candidates" not in result or len(result["candidates"]) == 0:
                raise ValueError("No candidates in Gemini response")
            
            candidate = result["candidates"][0]
            if "content" not in candidate or "parts" not in candidate["content"]:
                raise ValueError("Invalid response structure from Gemini API")
            
            # Extract text from parts (handle both text and other content types)
            parts = candidate["content"]["parts"]
            text_content = None
            for part in parts:
                if "text" in part:
                    text_content = part["text"]
                    break
            
            if text_content is None:
                raise ValueError("No text content in Gemini response")
            
            # Extract usage metadata (standardized format)
            usage_metadata = result.get("usageMetadata", {})
            usage = {
                "prompt_tokens": usage_metadata.get("promptTokenCount", 0),
                "completion_tokens": usage_metadata.get("candidatesTokenCount", 0),
                "total_tokens": usage_metadata.get("totalTokenCount", 0)
            }
            
            return {
                "content": text_content,
                "usage": usage,
                "model": model
            }
    except httpx.TimeoutException as e:
        raise ValueError(f"Gemini API timeout: Request took longer than 120s. Please try again.")
    except httpx.HTTPStatusError as e:
        error_detail = "Unknown error"
        try:
            error_data = e.response.json()
            error_detail = error_data.get("error", {}).get("message", str(e))
        except:
            error_detail = e.response.text or str(e)
        raise ValueError(f"Gemini API error ({e.response.status_code}): {error_detail}")
    except httpx.RequestError as e:
        raise ValueError(f"Network error calling Gemini API: {str(e)}. Please check your internet connection and try again.")

async def generate_response(
    provider: str,
    model: str,
    prompt: str,
    image_urls: Optional[List[str]] = None,
    response_format: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate response from any provider"""
    try:
        if provider == "openai":
            return await call_openai(model, prompt, image_urls, response_format)
        elif provider == "anthropic":
            return await call_anthropic(model, prompt, image_urls, response_format)
        elif provider == "gemini":
            return await call_gemini(model, prompt, image_urls, response_format)
        else:
            raise ValueError(f"Unknown provider: {provider}")
    except Exception as e:
        raise Exception(f"Error calling {provider}: {str(e)}")

def get_available_models() -> Dict[str, List[str]]:
    """Get all available models grouped by provider (only if API key is set)"""
    available = {}
    
    # Get API keys from database or environment
    openai_key = get_api_key("OPENAI_API_KEY", "")
    anthropic_key = get_api_key("ANTHROPIC_API_KEY", "")
    gemini_key = get_api_key("GEMINI_API_KEY", "")
    
    print(f"\n{'='*60}")
    print("Checking API keys for available providers:")
    print(f"OpenAI key present: {bool(openai_key)}")
    print(f"Anthropic key present: {bool(anthropic_key)}")
    print(f"Gemini key present: {bool(gemini_key)}")
    print(f"{'='*60}\n")
    
    if openai_key:
        available["openai"] = MODELS["openai"]
        print(f"Added OpenAI models: {len(MODELS['openai'])} models")
    
    if anthropic_key:
        available["anthropic"] = MODELS["anthropic"]
        print(f"Added Anthropic models: {len(MODELS['anthropic'])} models")
    
    if gemini_key:
        available["gemini"] = MODELS["gemini"]
        print(f"Added Gemini models: {len(MODELS['gemini'])} models")
    
    print(f"Total providers available: {len(available)}")
    print(f"Providers: {list(available.keys())}\n")
    
    return available

