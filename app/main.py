"""Main FastAPI application"""
import logging
import os
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("Loaded environment variables from .env file")
except ImportError:
    print("python-dotenv not installed. Using system environment variables only.")
    print("To use .env file, install: pip install python-dotenv")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Create FastAPI app
app = FastAPI(title="Shram Eval Tool - LLM Evaluation Dashboard")

# Middleware to add no-cache headers for static files (prevents browser caching issues)
class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static/"):
            if request.url.path.endswith((".js", ".css")):
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheStaticMiddleware)

# Mount static files - resolve path relative to project root
# This works both locally and in Docker
_base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
static_dir = os.path.join(_base_dir, "app", "templates", "static")
# Fallback to relative path if absolute doesn't exist
if not os.path.exists(static_dir):
    static_dir = "app/templates/static"
print(f"📁 Static files directory: {static_dir} (exists: {os.path.exists(static_dir)})")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Import and include routers
from app.routes import home, generation, chain, api, settings

app.include_router(home.router)
app.include_router(generation.router)
app.include_router(chain.router)
app.include_router(settings.router)
app.include_router(api.router)

# Initialize database on startup
from app.services.database import init_db
init_db()


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

