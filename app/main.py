"""Main FastAPI application"""
import logging
import os
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

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

# Mount static files
app.mount("/static", StaticFiles(directory="app/templates/static"), name="static")

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

