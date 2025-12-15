"""Cost calculation utilities"""
from typing import Dict


def calculate_cost(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost based on provider, model, and token usage"""
    # Pricing from Vertex AI Generative AI Pricing (https://cloud.google.com/vertex-ai/generative-ai/pricing)
    # Updated Dec 2025 (per 1M tokens)
    pricing = {
        "openai": {
            "gpt-5.2": {"input": 2.50, "output": 10.00},
            "gpt-5.1": {"input": 2.50, "output": 10.00},
            "gpt-5": {"input": 2.50, "output": 10.00},
            "gpt-4o": {"input": 2.50, "output": 10.00},
            "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        },
        "anthropic": {
            # Claude 4.5 models - Vertex AI pricing (https://cloud.google.com/vertex-ai/generative-ai/pricing)
            "claude-opus-4.5": {"input": 5.00, "output": 25.00},  # Vertex AI: $5/$25 per 1M tokens
            "claude-opus-4.1": {"input": 15.00, "output": 75.00},  # Vertex AI: $15/$75 per 1M tokens
            "claude-opus-4": {"input": 15.00, "output": 75.00},  # Vertex AI: $15/$75 per 1M tokens
            "claude-sonnet-4.5": {"input": 3.00, "output": 15.00},  # Vertex AI: $3/$15 per 1M tokens
            "claude-sonnet-4": {"input": 3.00, "output": 15.00},  # Vertex AI: $3/$15 per 1M tokens
            "claude-haiku-4.5": {"input": 1.00, "output": 5.00},  # Vertex AI: $1/$5 per 1M tokens
            # Claude 3.5 models - Vertex AI pricing
            "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},  # Same as Sonnet 4
            "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},  # Vertex AI: $0.80/$4 per 1M tokens
            # Claude 3 models - Vertex AI pricing
            "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},  # Vertex AI: $15/$75 per 1M tokens
            "claude-3-haiku": {"input": 0.25, "output": 1.25},  # Vertex AI: $0.25/$1.25 per 1M tokens
        },
        "gemini": {
            # Gemini 3 models - Vertex AI pricing (https://cloud.google.com/vertex-ai/generative-ai/pricing)
            "gemini-3-pro-preview": {"input": 0.10, "output": 0.40},  # Vertex AI: $0.10/$0.40 per 1M tokens
            # Gemini 2.5 models - Vertex AI pricing
            "gemini-2.5-flash": {"input": 0.10, "output": 0.40},  # Vertex AI: $0.10/$0.40 per 1M tokens
            "gemini-2.5-flash-preview-09-2025": {"input": 0.10, "output": 0.40},  # Same as stable
            "gemini-2.5-flash-lite": {"input": 0.10, "output": 0.40},  # Vertex AI pricing
            # Gemini 2.0 models - Vertex AI pricing
            "gemini-2.0-flash": {"input": 0.10, "output": 0.40},  # Vertex AI: $0.10/$0.40 per 1M tokens
            "gemini-2.0-flash-lite": {"input": 0.10, "output": 0.40},  # Vertex AI pricing
            "gemini-2.0-flash-exp": {"input": 0.00, "output": 0.00},  # Free tier experimental
            # Legacy models - Vertex AI pricing
            "gemini-1.5-pro": {"input": 1.25, "output": 5.00},  # Vertex AI pricing
            "gemini-1.5-flash": {"input": 0.075, "output": 0.30},  # Vertex AI pricing
        }
    }
    
    try:
        if provider in pricing:
            # Find matching model (exact match or partial match)
            model_prices = None
            for price_model, prices in pricing[provider].items():
                if model == price_model or price_model in model:
                    model_prices = prices
                    break
            
            if model_prices:
                input_cost = (input_tokens / 1_000_000) * model_prices["input"]
                output_cost = (output_tokens / 1_000_000) * model_prices["output"]
                return round(input_cost + output_cost, 6)
    except Exception as e:
        print(f"Error calculating cost: {e}")
    
    return 0.0

