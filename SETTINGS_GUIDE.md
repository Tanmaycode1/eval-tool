# Settings System Guide

## Overview

API keys are now stored securely in the database instead of environment variables. This makes it easier to manage and update keys without restarting the container.

## Features

✅ **Database Storage** - API keys stored in SQLite database
✅ **Settings Page** - User-friendly UI to add/update keys
✅ **Fallback Support** - Still works with environment variables
✅ **Security** - Keys never exposed to external servers
✅ **Hot Reload** - Changes take effect immediately

## Accessing Settings

Navigate to: **http://localhost:8000/settings**

Or click the "⚙️ Settings" link in the top navigation bar.

## Supported API Keys

1. **OpenAI API Key** - For GPT models (gpt-4o, gpt-4o-mini, etc.)
2. **Anthropic API Key** - For Claude models
3. **Gemini API Key** - For Google Gemini models
4. **PostHog API Token** - For fetching events from PostHog
5. **PostHog Project ID** - Your PostHog project number

## How It Works

### 1. Database Schema

A new `settings` table stores all configuration:

```sql
CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### 2. Settings Page

- Simple form to enter/update keys
- Show/Hide toggle for password fields
- Save button to persist changes
- Reload button to refresh from database

### 3. API Integration

All services now use `get_api_key()` or `get_posthog_config()` which:
1. First checks the database for stored keys
2. Falls back to environment variables if not found
3. Returns the key for API calls

### 4. Updated Services

- **LLM Providers** (`app/services/llm_providers.py`)
  - OpenAI, Anthropic, Gemini all use database keys
  
- **PostHog** (`app/services/posthog.py`)
  - Project ID and API token from database

## API Endpoints

### GET `/api/settings`
Returns all saved settings (values are returned as-is for the form)

### POST `/api/settings`
Saves settings to database

**Request body:**
```json
{
  "OPENAI_API_KEY": "sk-...",
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "GEMINI_API_KEY": "AI...",
  "POSTHOG_API_TOKEN": "phx_...",
  "POSTHOG_PROJECT_ID": "239949"
}
```

## Migration from .env

Your existing `.env` file still works! The system:
1. Checks database first
2. Falls back to environment variables
3. No breaking changes

To migrate:
1. Go to Settings page
2. Enter your API keys
3. Click Save
4. Keys are now in database
5. Can optionally remove from `.env` (but not required)

## Security Notes

- Keys stored in local SQLite database
- Database file: `./data/evaluation_history.db`
- Keys only sent to their respective API providers
- No external logging or transmission
- Show/Hide toggle in UI for safety

## Development

To add new settings:

1. Add to settings page form (`app/templates/settings.html`)
2. Add to API keys dict in `/api/settings` endpoint
3. Use `get_setting()` in your service:

```python
from app.services.database import get_setting

my_key = get_setting("MY_KEY_NAME", "default_value")
```

## Troubleshooting

**Keys not working after save?**
- Check browser console for errors
- Verify keys are correct format
- Try reloading the page

**Database errors?**
- Ensure database is initialized: `./check_db_docker.sh`
- Check database permissions

**Still using .env?**
- That's fine! Database is just an additional option
- Keys in database take priority over .env

