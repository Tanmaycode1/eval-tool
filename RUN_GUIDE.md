# Running Shram Eval Tool

## Quick Start

### Option 1: Run with Python (Local Development)

```bash
# Activate virtual environment
source venv/bin/activate

# Run the server
python main.py
```

Server will be available at: **http://localhost:8000**

### Option 2: Run with Docker

```bash
# Start with docker-compose
./start.sh
```

Or manually:
```bash
docker-compose up
```

Server will be available at: **http://localhost:8000**

## Database Location

The application automatically determines the correct database path:

- **Docker**: `/app/data/evaluation_history.db` (mounted to `./data/` on host)
- **Local Python**: `data/evaluation_history.db` (relative to project root)

## Environment Detection

The application automatically detects whether it's running in Docker or locally:

```python
# Checks for /.dockerenv file (created by Docker)
if os.path.exists("/.dockerenv"):
    # Running in Docker
    db_path = "/app/data/evaluation_history.db"
else:
    # Running locally
    db_path = "data/evaluation_history.db"
```

## Configuration

### Using Settings Page (Recommended)

1. Navigate to: **http://localhost:8000/settings**
2. Enter your API keys
3. Click "Save Settings"
4. Keys are stored in the database

### Using Environment Variables (Alternative)

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
POSTHOG_API_TOKEN=phx_...
POSTHOG_PROJECT_ID=239949
```

**Note**: Database settings take priority over environment variables.

## Troubleshooting

### Database Not Found

If you see warnings about the database not being found:

1. **Check the data directory exists**:
   ```bash
   mkdir -p data
   ```

2. **Verify permissions**:
   ```bash
   chmod 755 data
   ```

3. **Check database file**:
   ```bash
   ls -la data/evaluation_history.db
   ```

### Port Already in Use

If port 8000 is already in use:

```bash
# Find the process using port 8000
lsof -ti:8000

# Kill it
kill -9 $(lsof -ti:8000)
```

Or change the port in `main.py`:
```python
uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)
```

### Docker Issues

**Container not starting?**
```bash
# Check Docker logs
docker logs shram-eval-tool

# Rebuild without cache
docker build --no-cache -t shram-eval-tool .
```

**Database not persisting?**
```bash
# Check volume mount
docker inspect shram-eval-tool | grep -A 5 "Mounts"

# Should show: ./data:/app/data
```

## Development

### Hot Reload

Both Docker and local Python support hot reload:

- **Local**: Uvicorn auto-reloads on file changes
- **Docker**: Restart container for code changes

### Logs

**Local Python**:
```bash
# Logs are printed to console
python main.py
```

**Docker**:
```bash
# View logs
docker logs -f shram-eval-tool

# Or with docker-compose
docker-compose logs -f
```

## Testing Both Modes

### 1. Test Local Python

```bash
source venv/bin/activate
python main.py &
sleep 3
curl http://localhost:8000/api/health
pkill -f "python main.py"
```

### 2. Test Docker

```bash
docker-compose up -d
sleep 5
curl http://localhost:8000/api/health
docker-compose down
```

Both should return:
```json
{"status":"healthy","message":"LLM Evaluation Tool is running"}
```

## Features Available

Once the server is running:

- **Home Page**: http://localhost:8000/
- **Settings**: http://localhost:8000/settings
- **Health Check**: http://localhost:8000/api/health
- **API Docs**: http://localhost:8000/docs (FastAPI auto-generated)

## Next Steps

1. Configure API keys in Settings
2. Paste PostHog event JSON or Event ID
3. View and evaluate LLM responses
4. Rate outputs and save versions
5. Compare multiple generations

Enjoy! 🚀

