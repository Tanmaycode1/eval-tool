#!/bin/bash

# Script to start the Shram Eval Tool server using Docker

set -e

echo "🚀 Starting Shram Eval Tool Server..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Creating a template..."
    cat > .env << EOF
# API Keys (required)
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GEMINI_API_KEY=your_gemini_key_here
POSTHOG_API_KEY=your_posthog_key_here
POSTHOG_HOST=https://app.posthog.com

# Database path (optional - defaults to /app/data/evaluation_history.db in container)
DB_PATH=/app/data/evaluation_history.db
EOF
    echo "📝 Created .env template. Please update it with your API keys."
    echo ""
fi

# Create data directory if it doesn't exist
mkdir -p data
echo "📁 Data directory: $(pwd)/data"
echo "💾 Database will be created at: $(pwd)/data/evaluation_history.db"
echo ""

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t shram-eval-tool .

echo ""
echo "✅ Build complete!"
echo ""

# Run the container with logs using docker-compose
echo "🐳 Starting container with docker-compose..."
echo "📊 Server will be available at http://localhost:8000"
echo "💾 Database location: $(pwd)/data/evaluation_history.db"
echo "📋 Press Ctrl+C to stop the server"
echo ""
echo "--- Logs ---"
echo ""

# Use docker-compose for better volume management
docker-compose up

