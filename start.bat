@echo off
REM Tamera Forge — Start Script (Windows)

echo Starting Tamera Forge...
echo.

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo Starting backend on http://localhost:8000
echo Starting frontend on http://localhost:5173
echo.
echo Open http://localhost:5173 in your browser.
echo.

start "Tamera Backend" cmd /c "cd backend && cargo run --release"

cd frontend
call npm run dev
