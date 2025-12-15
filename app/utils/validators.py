"""Input validation utilities"""
import json
import re


def is_valid_json(text: str) -> bool:
    """Check if text is valid JSON"""
    text = text.strip()
    if not text:
        return False
    try:
        json.loads(text)
        return True
    except:
        return False


def is_event_id(text: str) -> bool:
    """Check if text looks like a PostHog event ID (UUID format)"""
    text = text.strip()
    # UUID format: 8-4-4-4-12 hex digits
    pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    return bool(re.match(pattern, text, re.IGNORECASE))


def is_trace_id(text: str) -> bool:
    """Check if text looks like a PostHog trace ID (contains underscores and timestamps)"""
    text = text.strip()
    # Trace ID format: UUID_timestamp_UUID
    # Supports two timestamp formats:
    # 1. ISO 8601: YYYY-MM-DDTHH:MM:SS.mmmZ
    # 2. Unix timestamp (milliseconds): 13 digits
    uuid_pattern = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    iso_timestamp_pattern = r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z'
    unix_timestamp_pattern = r'\d{13}'  # 13 digits for milliseconds
    
    # Pattern 1: UUID_ISO_timestamp_UUID
    pattern1 = rf'^{uuid_pattern}_{iso_timestamp_pattern}_{uuid_pattern}$'
    # Pattern 2: UUID_unix_timestamp_ms_UUID
    pattern2 = rf'^{uuid_pattern}_{unix_timestamp_pattern}_{uuid_pattern}$'
    
    return bool(re.match(pattern1, text, re.IGNORECASE) or re.match(pattern2, text, re.IGNORECASE))

