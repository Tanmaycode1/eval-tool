"""Pydantic models for request/response validation"""
from pydantic import BaseModel
from typing import Optional, Dict, Any, List


class InputData(BaseModel):
    input: str


class RegenerateRequest(BaseModel):
    event_id: Optional[str] = None  # Optional for chain prompts
    provider: str
    model: str
    prompt: str
    image_urls: Optional[List[str]] = None
    response_schema: Optional[str] = None  # JSON schema string for structured outputs


class SaveVersionRequest(BaseModel):
    version_id: str
    event_id: str
    model_provider: str
    model_name: str
    user_prompt: str
    image_urls: Optional[List[str]] = None
    assistant_response: Dict[str, Any]
    rating: Optional[Dict[str, Any]] = None  # JSON format: {"overall": 8, "parameters": {...}, "review": "..."}
    metadata: Optional[Dict[str, Any]] = None
    
    model_config = {"protected_namespaces": ()}


class UpdateRatingRequest(BaseModel):
    version_id: str
    rating: Optional[Dict[str, Any]] = None  # JSON format: {"overall": 8, "parameters": {...}, "review": "..."}


class SaveChainVersionRequest(BaseModel):
    version_id: str
    trace_id: str
    chain_name: str
    chain_events: List[Dict[str, Any]]
    total_tokens_input: int
    total_tokens_output: int
    total_cost: float
    rating: Optional[Dict[str, Any]] = None  # JSON format: {"overall": 8, "parameters": {...}, "review": "..."}
    metadata: Optional[Dict[str, Any]] = None
    
    model_config = {"protected_namespaces": ()}


class RegenerateChainRequest(BaseModel):
    trace_id: str
    prompts: List[Dict[str, Any]]  # Each prompt has: prompt, provider, model, images (optional)


class UpdateChainStepRatingRequest(BaseModel):
    version_id: str
    step_index: int
    rating: Optional[Dict[str, Any]] = None  # JSON format: {"overall": 8, "parameters": {...}, "review": "..."}

