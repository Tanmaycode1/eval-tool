# Shram Eval Tool - LLM Evaluation Dashboard

A professional LLM evaluation tool for analyzing PostHog AI generation traces with a beautiful dark mode interface.

## Features

- **Auto-Detection**: Automatically detects and processes JSON or Event ID input
- **Smart Processing**: Auto-processes on paste or Enter key press
- **Professional Dark Mode UI**: Clean, minimal interface optimized for trace analysis
- **Split View Display**: Side-by-side comparison of user prompts and assistant responses
- **Prompt Editing**: Edit user prompts in-place before regeneration
- **Multi-Provider Support**: OpenAI, Anthropic (Claude), and Google Gemini integration
- **Model Selection**: Choose from latest models across all providers
- **Regenerate Responses**: Re-run prompts with different models or edited prompts
- **Rating System**: Rate responses 1-10 for quality tracking
- **Version Comparison**: Save and compare different model outputs
- **SQLite Database**: Persistent storage of all evaluation versions
- **Rich Metadata**: View token counts, latency, costs, and model information
- **Image Support**: Automatically renders images from trace data
- **PostHog Integration**: Direct API integration using environment variables

## Use Cases

This tool is designed for evaluating LLM conversations captured in PostHog events, particularly:
- Analyzing AI agent responses
- Reviewing conversation quality
- Tracking token usage and costs
- Debugging prompt/response pairs
- Evaluating model performance metrics

## Setup

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- PostHog API access (for Event ID method)

### Installation

1. Install the required dependencies:

```bash
pip install -r requirements.txt
```

2. Set environment variables (copy `.env.example` to `.env` and fill in your keys):

```bash
# PostHog Configuration
export POSTHOG_PROJECT_ID=239949
export POSTHOG_API_TOKEN=phx_84dRShnNyMk9V2cTbQ2XMh0llWwjEFKzWVa8bpkZygiC6k

# LLM Provider API Keys (add your own keys)
export OPENAI_API_KEY=sk-your-openai-key-here
export ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
export GEMINI_API_KEY=your-gemini-key-here
```

### Running the Server

Start the FastAPI server with:

```bash
python main.py
```

Or alternatively, use uvicorn directly:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The server will start on `http://localhost:8000`

## Usage

### Single Input Box - Auto-Detection

1. Navigate to the dashboard at `http://localhost:8000`
2. Paste your PostHog event JSON or Event ID into the input box
3. The system will automatically:
   - Detect if it's valid JSON and process it immediately
   - Detect if it's an Event ID (UUID format) and fetch from PostHog
   - Process on paste or when you press Enter
4. View the formatted results in the split-view display

**Input Methods:**
- **JSON**: Paste any valid JSON (starts with `{` or `[`) - processes automatically
- **Event ID**: Paste a UUID format Event ID (e.g., `019b13ef-0f84-752a-b1a2-b5462a704c49`) - fetches from PostHog API
- **Enter Key**: Press Enter to manually trigger processing

### Regenerate & Compare Workflow

1. **Load a Trace**: Paste JSON or Event ID
2. **Edit (Optional)**: Click "Edit Prompt" to modify the user prompt
3. **Select Model**: Choose provider (OpenAI/Anthropic/Gemini) and model
4. **Regenerate**: Click "Regenerate" to get a new response
5. **Rate**: Provide a rating (1-10) for the response quality
6. **Save**: Click "Add to Compare" to save this version to the database

**Version Storage:**
- Initial version is auto-saved when you first load a trace
- Click "Add to Compare" to save any regenerated version
- Versions not added to compare are temporary and won't be saved
- All saved versions are stored in SQLite with ratings and metadata

## Available Endpoints

- **GET /** - Main evaluation dashboard
- **POST /api/process-input** - Auto-detect and process input (JSON or Event ID)
- **GET /api/models** - Get available models for all providers
- **POST /api/regenerate** - Regenerate response with different model/prompt
- **POST /api/save-version** - Save a version for comparison
- **POST /api/update-rating** - Update rating for a version
- **GET /api/versions/{event_id}** - Get all saved versions for an event
- **GET /api/health** - Health check endpoint
- **GET /docs** - Interactive API documentation (Swagger UI)
- **GET /redoc** - Alternative API documentation (ReDoc)

## Supported Models

### OpenAI (Latest as of December 2025)
- **gpt-5.2** - Latest model (Dec 2025) with enhanced intelligence and coding
- **gpt-5.1** - Customizable personalities and faster responses (Nov 2025)
- **gpt-5** - Initial GPT-5 release (Aug 2025)
- **gpt-4o** - Multimodal model with text, image, and audio support
- **gpt-4o-mini** - Cost-efficient variant of GPT-4o

### Anthropic (Claude)
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- claude-3-opus-20240229
- claude-3-sonnet-20240229, claude-3-haiku-20240307

### Google Gemini
- gemini-2.0-flash-exp
- gemini-1.5-pro, gemini-1.5-flash
- gemini-1.0-pro

## Project Structure

```
shram_eval_tool/
├── main.py                  # FastAPI application with API endpoints
├── database.py              # SQLite database operations
├── llm_providers.py         # LLM provider integrations (OpenAI, Anthropic, Gemini)
├── templates/               # HTML templates directory
│   └── index.html          # Main evaluation dashboard UI
├── requirements.txt         # Python dependencies
├── evaluation_history.db    # SQLite database (created automatically)
├── .env.example             # Environment variables template
└── README.md               # This file
```

## API Data Structure

The tool expects PostHog events with the following structure:

```json
{
  "id": "event-id",
  "properties": {
    "$ai_input": [{"content": "user prompt", "role": "user"}],
    "$ai_output_choices": [{"content": {...}, "role": "assistant"}],
    "$ai_model": "model-name",
    "$ai_latency": "18.98",
    "$ai_input_tokens": 1496,
    "$ai_output_tokens": 689,
    "$ai_total_cost_usd": 0.0004252,
    "chain_name": "chain-name"
  }
}
```

## Development

The server runs in reload mode by default, so any changes to the code will automatically restart the server.

## Security Notes

- Never commit your PostHog API tokens to version control
- Use environment variables for sensitive credentials in production
- The Event ID input uses password masking for API tokens

## API Documentation

Once the server is running, you can access:
- Swagger UI documentation at: http://localhost:8000/docs
- ReDoc documentation at: http://localhost:8000/redoc

