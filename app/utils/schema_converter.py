"""Zod to JSON Schema converter"""
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def zod_to_json_schema(zod_schema_str: str) -> Optional[Dict[str, Any]]:
    """
    Convert Zod schema string to JSON Schema format for LLM APIs.
    This is a simplified converter that extracts the basic structure.
    OpenAI strict mode requires additionalProperties: false on all objects.
    """
    if not zod_schema_str:
        return None
    
    try:
        # Parse the Zod schema string
        zod_data = json.loads(zod_schema_str)
        
        # Extract the shape from the cached data
        if not isinstance(zod_data, dict) or "_cached" not in zod_data:
            return None
        
        cached = zod_data["_cached"]
        if "shape" not in cached or "keys" not in cached:
            return None
        
        shape = cached["shape"]
        keys = cached["keys"]
        
        # Build JSON Schema
        properties = {}
        required = []
        
        for key in keys:
            if key not in shape:
                continue
            
            field_def = shape[key]
            if not isinstance(field_def, dict) or "_def" not in field_def:
                continue
            
            type_name = field_def["_def"].get("typeName", "")
            
            # Map Zod types to JSON Schema types
            if type_name == "ZodString":
                properties[key] = {"type": "string"}
            elif type_name == "ZodNumber":
                properties[key] = {"type": "number"}
            elif type_name == "ZodBoolean":
                properties[key] = {"type": "boolean"}
            elif type_name == "ZodArray":
                # Handle array types
                array_type = field_def["_def"].get("type", {})
                array_type_name = array_type.get("_def", {}).get("typeName", "")
                
                if array_type_name == "ZodObject":
                    # Array of objects - need to extract object schema
                    array_cached = array_type.get("_cached", {})
                    array_shape = array_cached.get("shape", {})
                    array_keys = array_cached.get("keys", [])
                    
                    item_properties = {}
                    item_required = []
                    
                    for item_key in array_keys:
                        if item_key in array_shape:
                            item_field = array_shape[item_key]
                            item_type = item_field.get("_def", {}).get("typeName", "")
                            
                            if item_type == "ZodString":
                                item_properties[item_key] = {"type": "string"}
                            elif item_type == "ZodNumber":
                                item_properties[item_key] = {"type": "number"}
                            elif item_type == "ZodBoolean":
                                item_properties[item_key] = {"type": "boolean"}
                            else:
                                item_properties[item_key] = {"type": "string"}
                            
                            item_required.append(item_key)
                    
                    properties[key] = {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": item_properties,
                            "required": item_required,
                            "additionalProperties": False  # Required by OpenAI strict mode
                        }
                    }
                else:
                    properties[key] = {
                        "type": "array",
                        "items": {"type": "string"}  # Default to string
                    }
            elif type_name == "ZodObject":
                properties[key] = {
                    "type": "object",
                    "additionalProperties": False  # Required by OpenAI strict mode
                }
            else:
                properties[key] = {"type": "string"}  # Default fallback
            
            # All keys are required by default in this schema
            required.append(key)
        
        json_schema = {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False  # Required by OpenAI strict mode
        }
        
        return json_schema
    except Exception as e:
        logger.warning(f"Failed to convert Zod schema to JSON Schema: {str(e)}")
        return None

