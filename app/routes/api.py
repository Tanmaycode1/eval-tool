"""API endpoints for the evaluation tool"""
import json
import time
import uuid
import logging
import traceback
from datetime import datetime
from typing import Dict, Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.models.schemas import (
    InputData, RegenerateRequest, SaveVersionRequest, UpdateRatingRequest,
    SaveChainVersionRequest, RegenerateChainRequest, UpdateChainStepRatingRequest
)
from app.services.input_processor import process_input
from app.services.database import (
    save_version, update_rating, get_versions_by_event, get_version_by_id,
    get_all_events, save_chain_version, get_chain_versions_by_trace,
    update_chain_rating, update_chain_step_rating, get_all_chains,
    get_all_settings, set_setting
)
from app.services.llm_providers import generate_response, get_available_models
from app.services.posthog import extract_conversation_data
from app.utils.schema_converter import zod_to_json_schema
from app.utils.cost_calculator import calculate_cost

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/api/process-input")
async def process_input_endpoint(data: InputData):
    """Auto-detect and process input (JSON or Event ID)"""
    result = await process_input(data.input)
    return JSONResponse(content=result)


@router.get("/api/models")
async def get_models():
    """Get available models for all providers"""
    models = get_available_models()
    print(f"API /api/models called, returning {len(models)} providers")
    return JSONResponse(content=models)


@router.post("/api/regenerate")
async def regenerate_response(data: RegenerateRequest):
    """Regenerate response with a different model/prompt"""
    try:
        print(f"\n{'='*60}")
        print(f"Regenerating with {data.provider}/{data.model}")
        print(f"Prompt length: {len(data.prompt)} chars")
        print(f"Images: {len(data.image_urls) if data.image_urls else 0}")
        print(f"{'='*60}\n")
        
        # Track start time for latency calculation
        start_time = time.time()
        
        # Prepare response_format if schema is provided
        response_format = None
        if data.response_schema:
            json_schema = zod_to_json_schema(data.response_schema)
            if json_schema:
                response_format = {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "structured_output",
                        "schema": json_schema,
                        "strict": True
                    }
                }
                logger.info(f"Using structured output with schema")
        
        result = await generate_response(
            provider=data.provider,
            model=data.model,
            prompt=data.prompt,
            image_urls=data.image_urls,
            response_format=response_format
        )
        
        # Calculate latency
        end_time = time.time()
        latency = round(end_time - start_time, 2)
        
        print(f"Response received from {data.provider}")
        print(f"Content length: {len(result.get('content', ''))} chars")
        print(f"Latency: {latency}s")
        
        # Try to parse as JSON
        content = result.get("content", "")
        try:
            parsed_content = json.loads(content)
            assistant_response = parsed_content
            print("Successfully parsed response as JSON")
        except json.JSONDecodeError:
            # If not JSON, wrap in a response object
            assistant_response = {"response": content}
            print("Response is plain text, wrapped in response object")
        
        # Generate version ID
        version_id = str(uuid.uuid4())
        
        # Extract usage info
        usage = result.get("usage", {})
        input_tokens = usage.get("prompt_tokens") or usage.get("input_tokens", 0)
        output_tokens = usage.get("completion_tokens") or usage.get("output_tokens", 0)
        
        # Calculate cost based on provider and model
        total_cost = calculate_cost(data.provider, data.model, input_tokens, output_tokens)
        
        # Get original metadata if available (for event_id, chain_name, etc.)
        original_metadata = {}
        try:
            # Try to get the initial version to preserve event metadata (only if event_id is provided)
            if data.event_id:
                initial_version_id = f"{data.event_id}_initial"
                initial_version = get_version_by_id(initial_version_id)
                if initial_version and initial_version.get("metadata"):
                    original_metadata = initial_version["metadata"]
                    logger.debug(f"Loaded original metadata from initial version")
        except Exception as e:
            logger.warning(f"Could not load original metadata: {str(e)}")
        
        # Merge original metadata with new generation metadata
        # Always use freshly calculated values for tokens, cost, and latency
        new_metadata = {
            **original_metadata,
            "model": result.get("model") or data.model,
            "provider": data.provider,
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "total_cost_usd": float(total_cost),
            "latency": float(latency),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        # Only include event_id and chain_name if event_id is provided
        if data.event_id:
            new_metadata["event_id"] = data.event_id
            new_metadata["chain_name"] = original_metadata.get("chain_name", "N/A")
        
        logger.info(f"Calculated metadata - Latency: {latency}s, Input: {input_tokens}, Output: {output_tokens}, Cost: ${total_cost}")
        logger.debug(f"Full metadata: {new_metadata}")
        
        return JSONResponse(content={
            "version_id": version_id,
            "assistant_response": assistant_response,
            "metadata": new_metadata
        })
    except ValueError as e:
        error_msg = str(e)
        print(f"Configuration error: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    except httpx.HTTPStatusError as e:
        error_msg = f"API error: {e.response.status_code} - {e.response.text}"
        print(f"HTTP error: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Error regenerating response: {str(e)}"
        print(f"Unexpected error: {error_msg}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("/api/save-version")
async def save_version_endpoint(data: SaveVersionRequest):
    """Save a version to compare"""
    try:
        # Ensure metadata has all required fields
        metadata = data.metadata or {}
        
        # Ensure numeric fields are properly set
        if "input_tokens" not in metadata or metadata["input_tokens"] is None:
            metadata["input_tokens"] = 0
        if "output_tokens" not in metadata or metadata["output_tokens"] is None:
            metadata["output_tokens"] = 0
        if "total_cost_usd" not in metadata or metadata["total_cost_usd"] is None:
            metadata["total_cost_usd"] = 0.0
        if "latency" not in metadata or metadata["latency"] is None:
            metadata["latency"] = 0.0
        
        # Ensure event_id is set
        if "event_id" not in metadata:
            metadata["event_id"] = data.event_id
        
        # Ensure provider and model are set
        if "provider" not in metadata:
            metadata["provider"] = data.model_provider
        if "model" not in metadata:
            metadata["model"] = data.model_name
        
        # Ensure timestamp is set
        if "timestamp" not in metadata:
            metadata["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        logger.info(f"Saving version {data.version_id} with metadata: latency={metadata.get('latency')}, "
                   f"input_tokens={metadata.get('input_tokens')}, output_tokens={metadata.get('output_tokens')}, "
                   f"cost=${metadata.get('total_cost_usd')}")
        
        success = save_version(
            version_id=data.version_id,
            event_id=data.event_id,
            model_provider=data.model_provider,
            model_name=data.model_name,
            user_prompt=data.user_prompt,
            image_urls=data.image_urls or [],
            assistant_response=data.assistant_response,
            rating=data.rating,
            metadata=metadata
        )
        
        if success:
            return JSONResponse(content={"success": True, "message": "Version saved"})
        else:
            return JSONResponse(content={"success": False, "message": "Version already exists"}, status_code=400)
    except Exception as e:
        logger.error(f"Error saving version: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error saving version: {str(e)}")


@router.post("/api/update-rating")
async def update_rating_endpoint(data: UpdateRatingRequest):
    """Update rating for a version"""
    try:
        success = update_rating(data.version_id, data.rating)
        
        if success:
            return JSONResponse(content={"success": True, "message": "Rating updated"})
        else:
            return JSONResponse(content={"success": False, "message": "Failed to update rating"}, status_code=400)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating rating: {str(e)}")


@router.get("/api/versions/{event_id}")
async def get_versions(event_id: str):
    """Get all versions for an event"""
    try:
        versions = get_versions_by_event(event_id)
        return JSONResponse(content={"versions": versions})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting versions: {str(e)}")


@router.get("/api/events")
async def get_events():
    """Get all saved events"""
    try:
        events = get_all_events()
        return JSONResponse(content={"events": events})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting events: {str(e)}")


@router.get("/api/chains")
async def get_chains():
    """Get all saved chains"""
    try:
        chains = get_all_chains()
        return JSONResponse(content={"chains": chains})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting chains: {str(e)}")


@router.post("/api/regenerate-chain")
async def regenerate_chain_endpoint(data: RegenerateChainRequest):
    """Regenerate an entire prompt chain"""
    try:
        logger.info(f"Regenerating chain {data.trace_id} with {len(data.prompts)} prompts")
        
        events = []
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0.0
        total_latency = 0.0
        providers = set()
        models = set()
        
        # Execute each prompt sequentially
        for idx, prompt_data in enumerate(data.prompts):
            logger.info(f"Executing prompt {idx + 1}/{len(data.prompts)}")
            
            start_time = time.time()
            
            # Prepare response_format if schema is provided
            response_format = None
            if "response_schema" in prompt_data and prompt_data["response_schema"]:
                json_schema = zod_to_json_schema(prompt_data["response_schema"])
                if json_schema:
                    response_format = {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "structured_output",
                            "schema": json_schema,
                            "strict": True
                        }
                    }
                    logger.info(f"Using structured output for prompt {idx + 1}")
            
            result = await generate_response(
                provider=prompt_data["provider"],
                model=prompt_data["model"],
                prompt=prompt_data["prompt"],
                image_urls=prompt_data.get("images", []),
                response_format=response_format
            )
            
            latency = round(time.time() - start_time, 2)
            
            # Parse response
            content = result.get("content", "")
            try:
                parsed_content = json.loads(content)
                assistant_response = parsed_content
            except:
                assistant_response = {"response": content}
            
            # Extract usage
            usage = result.get("usage", {})
            input_tokens = usage.get("prompt_tokens") or usage.get("input_tokens", 0)
            output_tokens = usage.get("completion_tokens") or usage.get("output_tokens", 0)
            
            # Calculate cost
            cost = calculate_cost(prompt_data["provider"], prompt_data["model"], input_tokens, output_tokens)
            
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            total_cost += cost
            total_latency += latency
            
            # Collect providers and models
            providers.add(prompt_data["provider"])
            models.add(prompt_data["model"])
            
            # Create event data
            event_data = {
                "type": "generation",
                "name": f"prompt_{idx + 1}",
                "model": prompt_data["model"],
                "user_prompt": prompt_data["prompt"],
                "user_images": prompt_data.get("images", []),
                "assistant_response": assistant_response,
                "metrics": {
                    "latency": str(latency),
                    "tokens": {
                        "input": input_tokens,
                        "output": output_tokens
                    },
                    "cost": cost
                },
                "properties": {
                    "ai_model": prompt_data["model"],
                    "provider": prompt_data["provider"],
                    "chain_name": "regenerated_chain"
                }
            }
            
            events.append(event_data)
        
        # Create chain metadata
        chain_metadata = {
            "trace_id": data.trace_id,
            "chain_name": "regenerated_chain",
            "total_tokens": {
                "input": total_input_tokens,
                "output": total_output_tokens
            },
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "total_cost": total_cost,
            "total_cost_usd": total_cost,
            "latency": f"{total_latency:.2f}s",
            "total_latency": total_latency,
            "providers": list(providers),
            "models": list(models),
            "event_count": len(events),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "is_chain": True
        }
        
        logger.info(f"Chain regeneration complete: {len(events)} prompts, total cost: ${total_cost}")
        
        return JSONResponse(content={
            "events": events,
            "metadata": chain_metadata
        })
    except Exception as e:
        logger.error(f"Error regenerating chain: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error regenerating chain: {str(e)}")


@router.post("/api/save-chain-version")
async def save_chain_version_endpoint(data: SaveChainVersionRequest):
    """Save a chain version to compare"""
    try:
        # Ensure metadata has required fields
        metadata = data.metadata or {}
        
        if "trace_id" not in metadata:
            metadata["trace_id"] = data.trace_id
        if "chain_name" not in metadata:
            metadata["chain_name"] = data.chain_name
        if "timestamp" not in metadata:
            metadata["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        logger.info(f"Saving chain version {data.version_id} with {len(data.chain_events)} events")
        
        success = save_chain_version(
            version_id=data.version_id,
            trace_id=data.trace_id,
            chain_name=data.chain_name,
            chain_events=data.chain_events,
            total_tokens_input=data.total_tokens_input,
            total_tokens_output=data.total_tokens_output,
            total_cost=data.total_cost,
            rating=data.rating,
            metadata=metadata
        )
        
        if success:
            return JSONResponse(content={"success": True, "message": "Chain version saved"})
        else:
            return JSONResponse(content={"success": False, "message": "Chain version already exists"}, status_code=400)
    except Exception as e:
        logger.error(f"Error saving chain version: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error saving chain version: {str(e)}")


@router.get("/api/chain-versions/{trace_id}")
async def get_chain_versions_endpoint(trace_id: str):
    """Get all versions for a chain trace ID"""
    try:
        versions = get_chain_versions_by_trace(trace_id)
        return JSONResponse(content={"versions": versions})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching chain versions: {str(e)}")


@router.post("/api/update-chain-rating")
async def update_chain_rating_endpoint(data: UpdateRatingRequest):
    """Update rating for a chain version"""
    try:
        success = update_chain_rating(data.version_id, data.rating)
        
        if success:
            return JSONResponse(content={"success": True, "message": "Chain rating updated"})
        else:
            return JSONResponse(content={"success": False, "message": "Chain version not found"}, status_code=404)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating chain rating: {str(e)}")


@router.post("/api/update-chain-step-rating")
async def update_chain_step_rating_endpoint(data: UpdateChainStepRatingRequest):
    """Update rating for a specific step in a chain version"""
    try:
        success = update_chain_step_rating(data.version_id, data.step_index, data.rating)
        
        if success:
            return JSONResponse(content={"success": True, "message": "Step rating updated"})
        else:
            return JSONResponse(content={"success": False, "message": "Chain version or step not found"}, status_code=404)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating chain step rating: {str(e)}")


@router.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "LLM Evaluation Tool is running"}


@router.get("/api/settings")
async def get_settings():
    """Get all settings (API keys masked for security)"""
    try:
        settings = get_all_settings()
        
        # Don't mask for now - let the frontend show the saved values
        # User can see what they've saved
        return settings
    except Exception as e:
        logger.error(f"Error getting settings: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error getting settings: {str(e)}")


@router.post("/api/settings")
async def save_settings(data: Dict[str, str]):
    """Save settings (API keys)"""
    try:
        # Define which keys are API keys and their descriptions
        api_keys = {
            "OPENAI_API_KEY": "OpenAI API Key for GPT models",
            "ANTHROPIC_API_KEY": "Anthropic API Key for Claude models",
            "GEMINI_API_KEY": "Google Gemini API Key",
            "POSTHOG_API_TOKEN": "PostHog API Token for event fetching",
            "POSTHOG_PROJECT_ID": "PostHog Project ID"
        }
        
        saved_count = 0
        for key, description in api_keys.items():
            if key in data:
                value = data[key].strip()
                # Only save if value is provided
                if value:
                    if set_setting(key, value, description):
                        saved_count += 1
                    else:
                        logger.warning(f"Failed to save setting: {key}")
        
        logger.info(f"Saved {saved_count} settings")
        return {"success": True, "message": f"Saved {saved_count} settings", "count": saved_count}
    except Exception as e:
        logger.error(f"Error saving settings: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error saving settings: {str(e)}")

