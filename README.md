# ⚒ Tamera Forge

A worldbuilding tool for creating, organizing, and expanding dark fantasy lore. Built with **Rust** (Axum + SQLite) and **TypeScript** (React + Vite).

## Features

- **Entity Database** — Create and manage entities (peoples, places, creatures, events, concepts, items, etc.)
- **Tagging System** — Organize entities with custom colored tags
- **Relationship Graph** — Define typed connections between entities (inhabits, conflicts_with, allied_with, etc.)
- **Search & Filter** — Find entities by name, type, tag, or full-text search
- **AI Assistant** — Chat-based and inline AI help via OpenRouter (Claude, GPT-4, Gemini, Llama, etc.)
- **Markdown Import** — Import existing .md files, auto-splitting on H2 headers into separate entities
- **Context-Aware AI** — The AI sees the current entity and its relationships when generating content
- **Auto-Save** — Content saves automatically as you type with debounced persistence

## Prerequisites

- **Rust** (1.75+) — Install via [rustup](https://rustup.rs)
- **Node.js 18+** and **npm**

## Quick Start

### 1. Backend

```bash
cd backend
cargo run --release
```

First build takes a few minutes (compiling dependencies). Subsequent builds are fast.
The API server starts at `http://localhost:8000`.

### 2. Frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

The frontend starts at `http://localhost:5173` and proxies API requests to the backend.

### 3. Configure AI

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Click the ⚙ Settings button in the app
3. Paste your API key and select your preferred model

## Usage

### Creating Entities

Click **New Entity** in the sidebar. Set the name, type, and start writing content. The entity auto-saves as you type (800ms debounce).

### Importing Existing Lore

Click the **Upload** button. Select a .md file and choose:
- **Entity Type** — Default type for imported entities
- **Split on H2** — Creates one entity per `##` section (recommended for large documents)

### Adding Relationships

Open an entity → Relationships section → **Add Relationship**. Choose the relationship type, target entity, and an optional note.

### Using the AI

**Chat Panel** (right sidebar):
- Toggle with the **AI** button in the toolbar
- The AI sees the current entity and its related entities as context
- Use quick prompts or ask custom questions
- Click **Insert** to append AI responses to the entity's content

**Inline Generation** (✨ buttons):
- Click ✨ next to Summary to auto-generate a summary
- Click **AI Expand** next to Content to generate or expand lore

## Project Structure

```
tamera-forge/
├── backend/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs         # Server setup, router, static files
│   │   ├── db.rs           # SQLite init, queries, row mapping
│   │   ├── error.rs        # AppError type with axum IntoResponse
│   │   ├── handlers.rs     # All route handlers + AI client
│   │   └── models.rs       # Request/response types, constants
│   └── data/               # Created at runtime
│       ├── tamera.db       # SQLite database
│       └── config.json     # API keys and settings
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx          # Layout, state, modals
│       ├── api.ts           # Typed API client
│       ├── types.ts         # All TypeScript interfaces
│       ├── index.css        # Dark fantasy theme
│       └── components/
│           ├── EntityList.tsx
│           ├── EntityEditor.tsx
│           └── AIPanel.tsx
└── README.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TAMERA_DATA_DIR` | `backend/data/` | Directory for database and config |
| `TAMERA_BIND` | `0.0.0.0:8000` | Backend listen address |

## Data

All data lives in `backend/data/tamera.db` (SQLite). Back up this file to preserve your work. The API key is stored in `backend/data/config.json`.

## Building for Production

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Build backend (release mode)
cd backend && cargo build --release

# Run — serves both API and frontend static files
./backend/target/release/tamera-forge
```

The backend auto-detects `frontend/dist/` and serves it as the root. Visit `http://localhost:8000`.

## Architecture Notes

The Rust backend uses `tokio::task::spawn_blocking` for all SQLite operations since `rusqlite` is synchronous. Each request opens its own connection with `PRAGMA foreign_keys=ON`. WAL mode is set at initialization for concurrent read support.

The frontend uses React 18 with TypeScript strict mode. All API types are shared through `types.ts`. The API client in `api.ts` provides fully typed wrappers around every endpoint.

OpenRouter calls go through the backend (never exposed to the frontend), keeping your API key secure.
