"""PostHog integration service for fetching and processing events and chains"""
import os
import json
import httpx
import logging
import traceback
from typing import Dict, Any
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def get_posthog_config():
    """Get PostHog credentials from database or environment variables"""
    try:
        from app.services.database import get_setting
        project_id = get_setting("POSTHOG_PROJECT_ID", os.getenv("POSTHOG_PROJECT_ID", "239949"))
        api_token = get_setting("POSTHOG_API_TOKEN", os.getenv("POSTHOG_API_TOKEN", ""))
        return project_id, api_token
    except Exception as e:
        logger.warning(f"Error getting PostHog config from database, using environment: {e}")
        return os.getenv("POSTHOG_PROJECT_ID", "239949"), os.getenv("POSTHOG_API_TOKEN", "")


# Get PostHog credentials from database or environment variables
POSTHOG_PROJECT_ID, POSTHOG_API_TOKEN = get_posthog_config()


async def fetch_event(event_id: str) -> Dict[str, Any]:
    """Fetch a single event from PostHog"""
    project_id, api_token = get_posthog_config()
    
    if not api_token:
        raise HTTPException(status_code=400, detail="POSTHOG_API_TOKEN not set in settings or environment variables")
    
    url = f"https://us.posthog.com/api/projects/{project_id}/events/{event_id}/"
    headers = {"Authorization": f"Bearer {api_token}"}
    
    logger.info(f"Fetching event from PostHog: {url}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
    
    if response.status_code != 200:
        logger.error(f"PostHog API error: {response.status_code}")
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch event from PostHog")
    
    return response.json()


async def fetch_prompt_chain(trace_id: str) -> Dict[str, Any]:
    """Fetch prompt chain from PostHog using HogQL query"""
    project_id, api_token = get_posthog_config()
    
    if not api_token:
        raise HTTPException(status_code=400, detail="POSTHOG_API_TOKEN not set in settings or environment variables")
    
    url = f"https://us.posthog.com/api/projects/{project_id}/query/"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    # Escape trace_id for SQL query
    escaped_trace_id = trace_id.replace("'", "''")
    
    query = {
        "query": {
            "kind": "HogQLQuery",
            "query": f"""
                SELECT 
                    uuid, 
                    event, 
                    timestamp, 
                    properties.$ai_model, 
                    properties.$ai_input, 
                    properties.$ai_output_choices, 
                    properties.$ai_input_tokens, 
                    properties.$ai_output_tokens, 
                    properties.$ai_total_cost_usd, 
                    properties.$ai_latency, 
                    properties.$ai_span_name, 
                    properties.chain_name, 
                    properties.promptSchema 
                FROM events 
                WHERE properties.$ai_trace_id = '{escaped_trace_id}' 
                   OR properties.$ai_parent_trace_id = '{escaped_trace_id}' 
                ORDER BY timestamp ASC
            """
        }
    }
    
    logger.info(f"Fetching chain from PostHog with trace_id: {trace_id}")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=query)
    
    if response.status_code != 200:
        logger.error(f"PostHog query error: {response.status_code}")
        logger.error(f"Response: {response.text[:500]}")
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch chain from PostHog")
    
    result = response.json()
    logger.info(f"PostHog query successful, processing results...")
    
    # Process the chain data
    return process_chain_data(result, trace_id)


def extract_conversation_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract and format conversation data from PostHog event"""
    logger.info("="*60)
    logger.info("Extracting conversation data")
    logger.info("="*60)
    
    try:
        if not isinstance(data, dict):
            logger.error(f"Expected dict, got {type(data).__name__}")
            raise ValueError(f"Invalid data type: expected dict, got {type(data).__name__}")
        
        properties = data.get("properties", {})
        if not isinstance(properties, dict):
            logger.warning(f"Properties is not a dict: {type(properties).__name__}")
            properties = {}
        
        logger.debug(f"Data keys: {list(data.keys())}")
        logger.debug(f"Properties keys: {list(properties.keys())[:20]}...")
        
        # Extract AI input and output
        ai_input = properties.get("$ai_input", [])
        ai_output = properties.get("$ai_output_choices", [])
        
        if not isinstance(ai_input, list):
            logger.warning(f"$ai_input is not a list: {type(ai_input).__name__}, converting to list")
            ai_input = [ai_input] if ai_input else []
        
        if not isinstance(ai_output, list):
            logger.warning(f"$ai_output_choices is not a list: {type(ai_output).__name__}, converting to list")
            ai_output = [ai_output] if ai_output else []
        
        logger.info(f"AI Input items count: {len(ai_input)}")
        logger.info(f"AI Output items count: {len(ai_output)}")
        
        # Extract user prompt and images
        user_prompt = ""
        user_images = []
        
        # Iterate through all items in ai_input array
        for idx, input_item in enumerate(ai_input):
            try:
                logger.debug(f"Processing input item {idx + 1}/{len(ai_input)}")
                
                if not isinstance(input_item, dict):
                    logger.warning(f"Input item {idx + 1} is not a dict: {type(input_item).__name__}")
                    continue
                
                content = input_item.get("content", "")
                role = input_item.get("role", "unknown")
                logger.debug(f"  Role: {role}, Content type: {type(content).__name__}")
                
                if isinstance(content, str):
                    user_prompt += content + "\n"
                    logger.debug(f"  Found text content ({len(content)} chars)")
                elif isinstance(content, dict):
                    content_type = content.get("type", "")
                    logger.debug(f"  Content dict type: {content_type}")
                    
                    if content_type == "image_url":
                        image_url = content.get("url", "")
                        if image_url:
                            user_images.append(image_url)
                            preview = image_url[:100] if len(image_url) > 100 else image_url
                            logger.info(f"  Found image! URL preview: {preview}...")
                    else:
                        logger.warning(f"  Unknown content type: {content_type}")
                elif isinstance(content, list):
                    logger.debug(f"  Content is a list with {len(content)} items")
                    for item_idx, item in enumerate(content):
                        try:
                            if isinstance(item, dict):
                                if item.get("type") == "text":
                                    text = item.get("text", "")
                                    user_prompt += text
                                    logger.debug(f"  Found text in list item {item_idx + 1} ({len(text)} chars)")
                                elif item.get("type") == "image_url":
                                    image_data = item.get("url", "")
                                    if image_data:
                                        user_images.append(image_data)
                                        logger.info(f"  Found image in list item {item_idx + 1}! ({len(image_data)} chars)")
                        except Exception as e:
                            logger.error(f"  Error processing list item {item_idx + 1}: {str(e)}")
                            logger.debug(f"  Traceback:\n{traceback.format_exc()}")
                else:
                    logger.warning(f"  Unexpected content type: {type(content).__name__}")
            except Exception as e:
                logger.error(f"Error processing input item {idx + 1}: {str(e)}")
                logger.debug(f"Traceback:\n{traceback.format_exc()}")
                continue
        
        logger.info("="*60)
        logger.info("Extraction Summary:")
        logger.info(f"  Text prompt length: {len(user_prompt)} chars")
        logger.info(f"  Images found: {len(user_images)}")
        logger.info("="*60)
        
        # Extract assistant response
        assistant_response = {}
        try:
            if ai_output and len(ai_output) > 0:
                first_output = ai_output[0]
                if isinstance(first_output, dict):
                    assistant_response = first_output.get("content", {})
                    logger.debug(f"Assistant response type: {type(assistant_response).__name__}")
                else:
                    logger.warning(f"First output item is not a dict: {type(first_output).__name__}")
        except Exception as e:
            logger.error(f"Error extracting assistant response: {str(e)}")
            logger.debug(f"Traceback:\n{traceback.format_exc()}")
        
        # Extract metadata
        try:
            metadata = {
                "event_id": data.get("id", "N/A"),
                "timestamp": data.get("timestamp", "N/A"),
                "model": properties.get("$ai_model", "N/A"),
                "latency": properties.get("$ai_latency", "N/A"),
                "input_tokens": properties.get("$ai_input_tokens", 0),
                "output_tokens": properties.get("$ai_output_tokens", 0),
                "total_cost_usd": properties.get("$ai_total_cost_usd", 0),
                "chain_name": properties.get("chain_name", "N/A"),
            }
            logger.debug(f"Metadata extracted: {metadata}")
        except Exception as e:
            logger.error(f"Error extracting metadata: {str(e)}")
            logger.debug(f"Traceback:\n{traceback.format_exc()}")
            metadata = {
                "event_id": "N/A",
                "timestamp": "N/A",
                "model": "N/A",
                "latency": "N/A",
                "input_tokens": 0,
                "output_tokens": 0,
                "total_cost_usd": 0,
                "chain_name": "N/A",
            }
        
        response_data = {
            "user_prompt": user_prompt.strip(),
            "user_images": user_images,
            "assistant_response": assistant_response,
            "metadata": metadata,
            "raw_properties": properties
        }
        
        # Auto-save initial version
        event_id = data.get("id", "N/A")
        if event_id != "N/A":
            try:
                from app.services.database import save_version
                version_id = f"{event_id}_initial"
                model = properties.get("$ai_model", "unknown")
                
                # Determine provider from model name
                provider = "unknown"
                if "gpt" in model.lower():
                    provider = "openai"
                elif "claude" in model.lower():
                    provider = "anthropic"
                elif "gemini" in model.lower():
                    provider = "gemini"
                
                logger.info(f"Auto-saving initial version: {version_id} (provider: {provider}, model: {model})")
                
                # Include provider in metadata
                enhanced_metadata = {
                    **metadata,
                    "provider": provider
                }
                
                save_version(
                    version_id=version_id,
                    event_id=event_id,
                    model_provider=provider,
                    model_name=model,
                    user_prompt=user_prompt.strip(),
                    image_urls=user_images,
                    assistant_response=assistant_response,
                    metadata=enhanced_metadata
                )
                logger.info("Initial version saved successfully")
            except Exception as e:
                logger.error(f"Failed to auto-save initial version: {str(e)}")
                logger.debug(f"Traceback:\n{traceback.format_exc()}")
        
        return response_data
    except Exception as e:
        logger.error(f"Error extracting conversation data: {str(e)}")
        logger.error(f"Exception type: {type(e).__name__}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise Exception(f"Error extracting conversation data: {str(e)}")


def process_chain_data(query_result: Dict[str, Any], trace_id: str) -> Dict[str, Any]:
    """Process PostHog query result into chain format"""
    try:
        results = query_result.get("results", [])
        if not results:
            raise ValueError("No results found in chain query")
        
        events = []
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0.0
        total_latency = 0.0
        first_timestamp = None
        chain_name = "unknown"
        providers = set()
        models = set()
        
        for row in results:
            # Row structure: [uuid, event, timestamp, model, ai_input, ai_output, input_tokens, output_tokens, cost, latency, span_name, chain_name, prompt_schema]
            if len(row) < 13:
                continue
            
            uuid_val = row[0]
            timestamp = row[2]
            model = row[3] or "unknown"
            ai_input = row[4] or []
            ai_output = row[5] or []
            input_tokens = int(row[6] or 0)
            output_tokens = int(row[7] or 0)
            cost = float(row[8] or 0)
            latency = row[9] or "0"
            span_name = row[10] or "unknown"
            chain_name = row[11] or chain_name
            prompt_schema = row[12] or {}
            
            if first_timestamp is None:
                first_timestamp = timestamp
            
            # Determine provider from model and collect unique providers/models
            provider = "unknown"
            if model and model != "unknown":
                if "gpt" in model.lower():
                    provider = "openai"
                elif "claude" in model.lower():
                    provider = "anthropic"
                elif "gemini" in model.lower():
                    provider = "gemini"
                
                providers.add(provider)
                models.add(model)
            
            # Parse user prompt and images from ai_input
            user_prompt = ""
            user_images = []
            
            # ai_input can be a list of message objects or a JSON string
            parsed_ai_input = []
            if isinstance(ai_input, str):
                try:
                    parsed_ai_input = json.loads(ai_input)
                except:
                    user_prompt = ai_input
            elif isinstance(ai_input, list):
                parsed_ai_input = ai_input
            
            # Extract user prompt and images from parsed input
            if isinstance(parsed_ai_input, list):
                for item in parsed_ai_input:
                    if isinstance(item, dict):
                        role = item.get("role", "")
                        content = item.get("content", "")
                        
                        if role == "user" or not role:
                            if isinstance(content, str):
                                user_prompt = content
                            elif isinstance(content, dict):
                                if content.get("type") == "image_url":
                                    user_images.append(content.get("url", ""))
                    elif isinstance(item, str):
                        user_prompt = item
            
            # Parse assistant response from ai_output
            assistant_response = {}
            
            # ai_output can be a list of choice objects or a JSON string
            parsed_ai_output = []
            if isinstance(ai_output, str):
                try:
                    parsed_ai_output = json.loads(ai_output)
                except:
                    try:
                        assistant_response = json.loads(ai_output)
                    except:
                        assistant_response = {"response": ai_output}
            elif isinstance(ai_output, list):
                parsed_ai_output = ai_output
            
            # Extract assistant response from parsed output
            if isinstance(parsed_ai_output, list) and len(parsed_ai_output) > 0:
                for item in parsed_ai_output:
                    if isinstance(item, dict):
                        role = item.get("role", "")
                        content = item.get("content", "")
                        
                        if role == "assistant" or not role:
                            if isinstance(content, dict):
                                assistant_response = content
                                break
                            elif isinstance(content, str):
                                try:
                                    assistant_response = json.loads(content)
                                    break
                                except:
                                    assistant_response = {"response": content}
                                    break
            
            # If still no assistant response, create empty placeholder
            if not assistant_response:
                assistant_response = {"response": "No response available"}
                logger.warning(f"No assistant response found for event {uuid_val}")
            
            event_data = {
                "type": "generation",
                "name": span_name,
                "model": model,
                "user_prompt": user_prompt,
                "user_images": user_images,
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
                    "ai_model": model,
                    "ai_span_name": span_name,
                    "chain_name": chain_name,
                    "prompt_schema": prompt_schema
                },
                "uuid": uuid_val,
                "timestamp": timestamp
            }
            events.append(event_data)
            
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            total_cost += cost
            
            # Add latency (convert to float if it's a string)
            try:
                if isinstance(latency, str):
                    latency_float = float(latency.replace('s', ''))
                else:
                    latency_float = float(latency)
                total_latency += latency_float
            except (ValueError, TypeError):
                logger.warning(f"Could not parse latency: {latency}")
                pass
        
        chain_data = {
            "is_chain": True,
            "trace_id": trace_id,
            "chain_name": chain_name,
            "events": events,
            "metadata": {
                "trace_id": trace_id,
                "chain_name": chain_name,
                "timestamp": first_timestamp,
                "total_tokens": {
                    "input": total_input_tokens,
                    "output": total_output_tokens
                },
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "total_cost_usd": total_cost,
                "total_cost": total_cost,
                "latency": f"{total_latency:.2f}s",
                "total_latency": total_latency,
                "providers": list(providers),
                "models": list(models),
                "event_count": len(events),
                "is_chain": True
            }
        }
        
        logger.info(f"Processed chain with {len(events)} events, total cost: ${total_cost}")
        logger.debug(f"First event user_prompt length: {len(events[0]['user_prompt']) if events else 0}")
        logger.debug(f"First event assistant_response: {str(events[0]['assistant_response'])[:200] if events else 'None'}")
        return chain_data
        
    except Exception as e:
        logger.error(f"Error processing chain data: {str(e)}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise Exception(f"Error processing chain data: {str(e)}")

