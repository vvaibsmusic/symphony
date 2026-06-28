#!/bin/bash

echo "Starting Music Intelligence Dashboard Setup..."

# === Environment Setup ===
if [ ! -f ".env" ]; then
    echo "⚠️ .env file not found! Copying from .env.example..."
    cp .env.example .env
    echo "Please update your .env file with actual API keys later."
fi

# === Python API Backend & Collector Setup ===
echo "Setting up Python Environment..."

if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Created virtual environment 'venv'."
fi

# Activate virtualenv
source venv/bin/activate

echo "Installing API dependencies..."
pip install -r api/requirements.txt

echo "Installing Collector dependencies..."
pip install -r collector/requirements.txt

# Start the API Backend in the background
echo "Starting FastAPI Backend..."
cd api
uvicorn main:app --reload --port 8000 &
API_PID=$!
cd ..

# === Next.js Frontend Setup ===
echo "Setting up Next.js Frontend..."
cd frontend

echo "Installing NPM dependencies..."
npm install

echo "Starting Next.js Frontend..."
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================================="
echo "🚀 Music Dashboard is running locally!"
echo "Backend API:    http://localhost:8000"
echo "Frontend UI:    http://localhost:3000"
echo "========================================================="
echo "Press [CTRL+C] to gracefully stop both servers."

echo "Opening browser in 3 seconds to ensure servers are ready..."
(sleep 3 && open "http://localhost:3000" || python3 -m webbrowser "http://localhost:3000") &

# Handle cleanup on CTRL+C
trap 'echo "Stopping servers..."; kill $API_PID $FRONTEND_PID; exit 0' SIGINT

# Keep script running
wait
