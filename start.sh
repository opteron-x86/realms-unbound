#!/bin/bash
# Tamera Forge — Start Script (Rust + TypeScript)

echo "⚒ Starting Tamera Forge..."
echo ""

# Check Rust
if ! command -v cargo &> /dev/null; then
    echo "Error: Rust is required. Install via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "Error: Node.js 18+ is required. Install from https://nodejs.org"
    exit 1
fi

# Install frontend deps if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "→ Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

echo ""
echo "→ Starting backend on http://localhost:8000 (first build may take a few minutes)"
echo "→ Starting frontend on http://localhost:5173"
echo ""
echo "Open http://localhost:5173 in your browser."
echo "Press Ctrl+C to stop."
echo ""

# Start backend
cd backend
cargo run --release &
BACKEND_PID=$!
cd ..

# Start frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
