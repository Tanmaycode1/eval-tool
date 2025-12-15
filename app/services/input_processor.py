"""Service for processing various input types (JSON, Event ID, Trace ID)"""
import json
import logging
import traceback
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.utils.validators import is_valid_json, is_event_id, is_trace_id
from app.services.posthog import fetch_event, fetch_prompt_chain, extract_conversation_data, process_chain_data
from app.services.database import (
    event_exists_in_db, get_initial_version_by_event,
    trace_exists_in_db, get_initial_chain_by_trace, save_chain_version
)

logger = logging.getLogger(__name__)


def detect_chain_json(data: Any) -> bool:
    """
    Detect if JSON represents a chain (multiple events) vs single event
    
    Chain indicators (must have at least one):
    - Has 'events' or 'chain_events' array with multiple items
    - Has 'results' array (PostHog query format) with multiple items
    - Is an array of multiple event objects
    - Has 'trace_id' AND ('events' or 'chain_events' or 'results')
    
    Single event indicators (if present, likely NOT a chain):
    - Has 'id' or 'uuid' (single event ID)
    - Has 'properties.$ai_input' (single event structure)
    - No 'events', 'chain_events', or 'results' arrays
    """
    if not isinstance(data, dict):
        # If it's an array, check if it looks like multiple events
        if isinstance(data, list):
            if len(data) > 1:
                # Check if items look like events (have event-like structure)
                event_indicators = ['properties', 'id', 'event', 'timestamp', 'uuid']
                if all(isinstance(item, dict) and any(key in item for key in event_indicators) for item in data[:min(3, len(data))]):
                    return True
            return False
    
    # Check for explicit chain indicators (strongest signals)
    if 'events' in data or 'chain_events' in data:
        events_list = data.get('events') or data.get('chain_events', [])
        if isinstance(events_list, list) and len(events_list) > 1:
            return True
    
    # Check if it's a PostHog query result (chain format)
    if 'results' in data and isinstance(data['results'], list):
        if len(data['results']) > 1:
            return True
        # Even single result in 'results' format suggests chain structure
        if len(data['results']) == 1 and isinstance(data['results'][0], list):
            return True
    
    # Check for trace_id combined with chain structure
    has_trace_id = 'trace_id' in data or (isinstance(data.get('properties'), dict) and data['properties'].get('$ai_trace_id'))
    has_chain_structure = 'events' in data or 'chain_events' in data or 'results' in data
    
    # Only consider trace_id as chain indicator if it also has chain structure
    if has_trace_id and has_chain_structure:
        return True
    
    # If it has chain_name but also has events/chain_events/results, it's a chain
    has_chain_name = 'chain_name' in data or (isinstance(data.get('properties'), dict) and data['properties'].get('chain_name'))
    if has_chain_name and has_chain_structure:
        return True
    
    # If it looks like a single event (has id/uuid and properties.$ai_input), it's NOT a chain
    has_single_event_id = 'id' in data or 'uuid' in data
    has_single_event_structure = isinstance(data.get('properties'), dict) and ('$ai_input' in data['properties'] or '$ai_output_choices' in data['properties'])
    
    if has_single_event_id and has_single_event_structure and not has_chain_structure:
        return False
    
    return False


def extract_trace_id_from_json(data: Any) -> Optional[str]:
    """Extract trace_id from JSON data"""
    if isinstance(data, dict):
        # Direct trace_id
        if 'trace_id' in data:
            return data['trace_id']
        
        # From properties
        if isinstance(data.get('properties'), dict):
            trace_id = data['properties'].get('$ai_trace_id') or data['properties'].get('trace_id')
            if trace_id:
                return trace_id
        
        # From metadata
        if isinstance(data.get('metadata'), dict):
            trace_id = data['metadata'].get('trace_id')
            if trace_id:
                return trace_id
        
        # From first event in events array
        events_list = data.get('events') or data.get('chain_events', [])
        if isinstance(events_list, list) and len(events_list) > 0:
            first_event = events_list[0]
            if isinstance(first_event, dict):
                return extract_trace_id_from_json(first_event)
    
    # If it's a list, check first item
    if isinstance(data, list) and len(data) > 0:
        first_item = data[0]
        if isinstance(first_item, dict):
            return extract_trace_id_from_json(first_item)
    
    return None


def process_json_as_chain(data: Any, trace_id: str) -> Dict[str, Any]:
    """Process JSON data as a chain"""
    # If it's already in PostHog query result format
    if isinstance(data, dict) and 'results' in data:
        return process_chain_data(data, trace_id)
    
    # If it's a chain object with events array
    events_list = data.get('events') or data.get('chain_events', [])
    if isinstance(events_list, list):
        # Convert to PostHog query result format
        results = []
        for event in events_list:
            if isinstance(event, dict):
                # Convert event to PostHog row format
                properties = event.get('properties', {})
                results.append([
                    event.get('id') or event.get('uuid', ''),
                    event.get('event', 'ai_generation'),
                    event.get('timestamp', ''),
                    properties.get('$ai_model') or event.get('model', ''),
                    properties.get('$ai_input') or event.get('user_prompt', ''),
                    properties.get('$ai_output_choices') or [{'content': event.get('assistant_response', {})}],
                    properties.get('$ai_input_tokens') or event.get('input_tokens', 0),
                    properties.get('$ai_output_tokens') or event.get('output_tokens', 0),
                    properties.get('$ai_total_cost_usd') or event.get('total_cost', 0),
                    properties.get('$ai_latency') or event.get('latency', ''),
                    properties.get('$ai_span_name') or event.get('name', ''),
                    properties.get('chain_name') or data.get('chain_name', ''),
                    properties.get('promptSchema') or event.get('prompt_schema', {})
                ])
        
        query_result = {"results": results}
        return process_chain_data(query_result, trace_id)
    
    # If it's an array of events
    if isinstance(data, list) and len(data) > 1:
        results = []
        for event in data:
            if isinstance(event, dict):
                properties = event.get('properties', {})
                results.append([
                    event.get('id') or event.get('uuid', ''),
                    event.get('event', 'ai_generation'),
                    event.get('timestamp', ''),
                    properties.get('$ai_model') or event.get('model', ''),
                    properties.get('$ai_input') or event.get('user_prompt', ''),
                    properties.get('$ai_output_choices') or [{'content': event.get('assistant_response', {})}],
                    properties.get('$ai_input_tokens') or event.get('input_tokens', 0),
                    properties.get('$ai_output_tokens') or event.get('output_tokens', 0),
                    properties.get('$ai_total_cost_usd') or event.get('total_cost', 0),
                    properties.get('$ai_latency') or event.get('latency', ''),
                    properties.get('$ai_span_name') or event.get('name', ''),
                    properties.get('chain_name') or 'Unnamed Chain',
                    properties.get('promptSchema') or event.get('prompt_schema', {})
                ])
        
        query_result = {"results": results}
        # Extract trace_id from first event if available
        if results and isinstance(data[0], dict):
            extracted_trace_id = extract_trace_id_from_json(data[0])
            if extracted_trace_id:
                trace_id = extracted_trace_id
        
        return process_chain_data(query_result, trace_id)
    
    raise ValueError("Unable to process JSON as chain - invalid structure")


async def process_input(input_text: str) -> Dict[str, Any]:
    """Auto-detect and process input (JSON or Event ID or Trace ID)"""
    logger.info("="*60)
    logger.info("Processing input request")
    logger.info("="*60)
    
    try:
        input_text = input_text.strip()
        input_length = len(input_text)
        logger.info(f"Input length: {input_length} characters")
        
        if not input_text:
            logger.warning("Empty input received")
            raise HTTPException(status_code=400, detail="Input is empty")
        
        # Check if it's valid JSON
        if is_valid_json(input_text):
            logger.info("Input detected as JSON")
            try:
                logger.debug(f"Parsing JSON (first 200 chars): {input_text[:200]}")
                parsed_data = json.loads(input_text)
                logger.info("JSON parsed successfully")
                logger.debug(f"Parsed data keys: {list(parsed_data.keys()) if isinstance(parsed_data, dict) else 'Not a dict'}")
                
                # Detect if JSON represents a chain or single event
                is_chain_json = detect_chain_json(parsed_data)
                
                if is_chain_json:
                    logger.info("JSON detected as chain data")
                    # Process as chain
                    extracted_trace_id = extract_trace_id_from_json(parsed_data)
                    if not extracted_trace_id:
                        # Generate a trace_id if not present
                        trace_id = f"{uuid.uuid4()}_{datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]}Z_{uuid.uuid4()}"
                        logger.info(f"Generated trace_id for chain: {trace_id}")
                    else:
                        trace_id = extracted_trace_id
                        logger.info(f"Using extracted trace_id: {trace_id}")
                    
                    # Process chain data
                    chain_data = process_json_as_chain(parsed_data, trace_id)
                    
                    # Auto-save initial chain version
                    try:
                        version_id = f"{trace_id}_initial"
                        total_input = chain_data["metadata"]["total_tokens"]["input"]
                        total_output = chain_data["metadata"]["total_tokens"]["output"]
                        total_cost = chain_data["metadata"]["total_cost"]
                        
                        save_chain_version(
                            version_id=version_id,
                            trace_id=trace_id,
                            chain_name=chain_data["chain_name"],
                            chain_events=chain_data["events"],
                            total_tokens_input=total_input,
                            total_tokens_output=total_output,
                            total_cost=total_cost,
                            metadata=chain_data["metadata"]
                        )
                        logger.info("Initial chain version saved to database")
                    except Exception as e:
                        logger.warning(f"Failed to save initial chain version: {str(e)}")
                    
                    return chain_data
                else:
                    logger.info("JSON detected as single event data")
                    # Process as single event
                    formatted_data = extract_conversation_data(parsed_data)
                    logger.info("Data extraction completed successfully")
                    logger.info(f"Extracted - User images: {len(formatted_data.get('user_images', []))}, "
                              f"Has response: {bool(formatted_data.get('assistant_response'))}")
                    
                    return formatted_data
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {str(e)}")
                logger.error(f"Error at position: {e.pos if hasattr(e, 'pos') else 'unknown'}")
                raise HTTPException(status_code=400, detail=f"Invalid JSON format: {str(e)}")
            except Exception as e:
                logger.error(f"Error parsing JSON data: {str(e)}")
                logger.error(f"Exception type: {type(e).__name__}")
                logger.error(f"Traceback:\n{traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Error parsing data: {str(e)}")
        
        # Check if it's an Event ID
        elif is_event_id(input_text):
            logger.info(f"Input detected as Event ID: {input_text}")
            event_id = input_text
            
            # First, check if event exists in database
            logger.info(f"Checking if event {event_id} exists in database...")
            if event_exists_in_db(event_id):
                logger.info(f"Event {event_id} found in database, loading from DB")
                try:
                    initial_version = get_initial_version_by_event(event_id)
                    if initial_version:
                        # Reconstruct formatted_data from database version
                        formatted_data = {
                            "user_prompt": initial_version.get("user_prompt", ""),
                            "user_images": initial_version.get("image_urls", []),
                            "assistant_response": initial_version.get("assistant_response", {}),
                            "metadata": initial_version.get("metadata", {}),
                            "raw_properties": {}  # Not stored in DB, but not critical
                        }
                        
                        # Ensure metadata has required fields
                        if not formatted_data["metadata"].get("event_id"):
                            formatted_data["metadata"]["event_id"] = event_id
                        
                        logger.info("Data loaded from database successfully")
                        logger.info(f"Loaded - User images: {len(formatted_data.get('user_images', []))}, "
                                  f"Has response: {bool(formatted_data.get('assistant_response'))}")
                        
                        return formatted_data
                    else:
                        logger.warning(f"Event {event_id} exists in DB but initial version not found, fetching from PostHog")
                except Exception as e:
                    logger.error(f"Error loading from database: {str(e)}")
                    logger.error(f"Traceback:\n{traceback.format_exc()}")
                    logger.info("Falling back to PostHog fetch")
            else:
                logger.info(f"Event {event_id} not found in database, fetching from PostHog")
            
            # Event not in DB or DB load failed, fetch from PostHog
            try:
                event_data = await fetch_event(event_id)
                logger.info("Event data fetched successfully from PostHog")
                logger.debug(f"Event data keys: {list(event_data.keys()) if isinstance(event_data, dict) else 'Not a dict'}")
                
                formatted_data = extract_conversation_data(event_data)
                logger.info("Data extraction completed successfully")
                logger.info(f"Extracted - User images: {len(formatted_data.get('user_images', []))}, "
                          f"Has response: {bool(formatted_data.get('assistant_response'))}")
                
                return formatted_data
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error processing PostHog event: {str(e)}")
                logger.error(f"Exception type: {type(e).__name__}")
                logger.error(f"Traceback:\n{traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Error processing event: {str(e)}")
        
        # Check if it's a Trace ID (prompt chain)
        elif is_trace_id(input_text):
            logger.info(f"Input detected as Trace ID: {input_text}")
            trace_id = input_text
            
            # Check if chain exists in database
            if trace_exists_in_db(trace_id):
                logger.info(f"Chain {trace_id} found in database, loading from DB")
                try:
                    chain_data = get_initial_chain_by_trace(trace_id)
                    if chain_data:
                        # Reconstruct enhanced metadata from events
                        events = chain_data["chain_events"]
                        total_latency = 0.0
                        providers = set()
                        models = set()
                        
                        for event in events:
                            # Collect providers and models
                            if event.get("model"):
                                models.add(event["model"])
                                
                                # Determine provider from model
                                model = event["model"].lower()
                                if "gpt" in model:
                                    providers.add("openai")
                                elif "claude" in model:
                                    providers.add("anthropic")
                                elif "gemini" in model:
                                    providers.add("gemini")
                            
                            # Sum latency
                            metrics = event.get("metrics", {})
                            if metrics.get("latency"):
                                try:
                                    latency_val = metrics["latency"]
                                    if isinstance(latency_val, str):
                                        latency_float = float(latency_val.replace('s', ''))
                                    else:
                                        latency_float = float(latency_val)
                                    total_latency += latency_float
                                except (ValueError, TypeError):
                                    pass
                        
                        # Use stored metadata if available, otherwise create enhanced metadata
                        stored_metadata = chain_data.get("metadata", {})
                        if isinstance(stored_metadata, str):
                            try:
                                stored_metadata = json.loads(stored_metadata)
                            except:
                                stored_metadata = {}
                        
                        # Format chain data for frontend with enhanced metadata
                        formatted_chain = {
                            "is_chain": True,
                            "trace_id": chain_data["trace_id"],
                            "chain_name": chain_data["chain_name"],
                            "events": chain_data["chain_events"],
                            "metadata": {
                                **stored_metadata,
                                "trace_id": chain_data["trace_id"],
                                "chain_name": chain_data["chain_name"],
                                "total_tokens": {
                                    "input": chain_data["total_tokens_input"],
                                    "output": chain_data["total_tokens_output"]
                                },
                                "input_tokens": chain_data["total_tokens_input"],
                                "output_tokens": chain_data["total_tokens_output"],
                                "total_cost": chain_data["total_cost"],
                                "total_cost_usd": chain_data["total_cost"],
                                "latency": f"{total_latency:.2f}s" if total_latency > 0 else "N/A",
                                "total_latency": total_latency,
                                "providers": list(providers),
                                "models": list(models),
                                "event_count": len(events),
                                "timestamp": chain_data["created_at"],
                                "is_chain": True
                            }
                        }
                        logger.info("Chain data loaded from database successfully")
                        logger.info(f"Chain has {len(formatted_chain['events'])} events")
                        
                        return formatted_chain
                except Exception as e:
                    logger.error(f"Error loading chain from database: {str(e)}")
                    logger.info("Falling back to PostHog fetch")
            else:
                logger.info(f"Chain {trace_id} not found in database, fetching from PostHog")
            
            # Chain not in DB or DB load failed, fetch from PostHog
            try:
                chain_data = await fetch_prompt_chain(trace_id)
                logger.info("Chain data fetched successfully from PostHog")
                
                # Auto-save initial chain version
                try:
                    version_id = f"{trace_id}_initial"
                    total_input = chain_data["metadata"]["total_tokens"]["input"]
                    total_output = chain_data["metadata"]["total_tokens"]["output"]
                    total_cost = chain_data["metadata"]["total_cost"]
                    
                    save_chain_version(
                        version_id=version_id,
                        trace_id=trace_id,
                        chain_name=chain_data["chain_name"],
                        chain_events=chain_data["events"],
                        total_tokens_input=total_input,
                        total_tokens_output=total_output,
                        total_cost=total_cost,
                        metadata=chain_data["metadata"]
                    )
                    logger.info("Initial chain version saved to database")
                except Exception as e:
                    logger.warning(f"Failed to save initial chain version: {str(e)}")
                
                return chain_data
            except Exception as e:
                logger.error(f"Error fetching chain from PostHog: {str(e)}")
                logger.error(f"Traceback:\n{traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Error fetching chain: {str(e)}")
        
        else:
            logger.warning(f"Input is neither valid JSON, Event ID, nor Trace ID. First 50 chars: {input_text[:50]}")
            raise HTTPException(status_code=400, detail="Input must be valid JSON, a PostHog Event ID, or a Trace ID")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in process_input: {str(e)}")
        logger.error(f"Exception type: {type(e).__name__}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

