"""PlayerTracker Relay — FastAPI server.

Receives player snapshots and game events from the Arma Reforger mod,
stores them in SQLite, and optionally forwards to a Mercury Enable ATAK
webhook for live ATAK map overlay.

Configuration (env vars override config.json):
  PT_API_KEY      — shared secret the mod sends with every request
  PT_DB_PATH      — path to SQLite database file (default: tracker.db)
  PT_MERCURY_URL  — Mercury webhook URL (leave blank to disable forwarding)
  PT_SESSION_GAP  — seconds of inactivity that starts a new session (default: 300)
  PT_PORT         — listen port (default: 5556)
"""

import json
import os
import time
import asyncio
import logging
from pathlib import Path
from typing import Optional

import aiosqlite
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_CONFIG_FILE = Path(__file__).parent / "config.json"

def _load_config() -> dict:
    try:
        return json.loads(_CONFIG_FILE.read_text())
    except Exception:
        return {}

_cfg = _load_config()

API_KEY: str       = os.environ.get("PT_API_KEY",     _cfg.get("api_key",              "changeme"))
DB_PATH: str       = os.environ.get("PT_DB_PATH",     _cfg.get("db_path",              "tracker.db"))
MERCURY_URL: str   = os.environ.get("PT_MERCURY_URL", _cfg.get("mercury_webhook_url",  ""))
SESSION_GAP: int   = int(os.environ.get("PT_SESSION_GAP", _cfg.get("session_gap_minutes", 5)) or 5) * 60
PORT: int          = int(os.environ.get("PT_PORT",    _cfg.get("port",                 5556)))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pt-relay")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="PlayerTracker Relay", version="1.0.0")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS snapshots (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id   TEXT    NOT NULL,
                timestamp   INTEGER NOT NULL,
                map         TEXT,
                session_time INTEGER,
                players_alive INTEGER,
                players_total INTEGER,
                payload     TEXT    NOT NULL,
                received_at INTEGER NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id   TEXT    NOT NULL,
                event_type  TEXT    NOT NULL,
                timestamp   INTEGER NOT NULL,
                data        TEXT,
                received_at INTEGER NOT NULL
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_snap_server  ON snapshots(server_id, timestamp)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_event_server ON events(server_id, timestamp)")
        await db.commit()

@app.on_event("startup")
async def on_startup():
    await init_db()
    logger.info("PlayerTracker Relay started on port %d", PORT)
    if MERCURY_URL:
        logger.info("Mercury forwarding enabled → %s", MERCURY_URL)
    else:
        logger.info("Mercury forwarding disabled (PT_MERCURY_URL not set)")

# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _check_key(payload: dict, request: Request) -> bool:
    key = (
        payload.get("api_key")
        or request.headers.get("X-Api-Key")
        or request.headers.get("Authorization", "").removeprefix("Bearer ")
    ).strip()
    return key == API_KEY

# ---------------------------------------------------------------------------
# Mercury forwarding
# ---------------------------------------------------------------------------

async def _forward_to_mercury(payload: dict):
    if not MERCURY_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(MERCURY_URL, json=payload)
            if r.status_code >= 400:
                logger.warning("Mercury forward returned %d", r.status_code)
    except Exception as e:
        logger.warning("Mercury forward failed: %s", e)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/track")
async def track(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    if not _check_key(payload, request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    server_id = (payload.get("server_id") or "").strip()
    if not server_id:
        return JSONResponse({"error": "Missing server_id"}, status_code=400)

    ts = int(payload.get("timestamp") or time.time())
    now = int(time.time())

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO snapshots
               (server_id, timestamp, map, session_time, players_alive, players_total, payload, received_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                server_id,
                ts,
                payload.get("map", ""),
                payload.get("session_time"),
                payload.get("players_alive"),
                payload.get("players_total"),
                json.dumps(payload),
                now,
            )
        )
        await db.commit()

    asyncio.create_task(_forward_to_mercury(payload))

    return {"ok": True, "server_id": server_id, "players": len(payload.get("players", []))}


@app.post("/event")
async def event(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    if not _check_key(payload, request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    server_id = (payload.get("server_id") or "").strip()
    if not server_id:
        return JSONResponse({"error": "Missing server_id"}, status_code=400)

    ts = int(payload.get("timestamp") or time.time())
    now = int(time.time())

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO events (server_id, event_type, timestamp, data, received_at)
               VALUES (?, ?, ?, ?, ?)""",
            (
                server_id,
                payload.get("event_type", "unknown"),
                ts,
                json.dumps(payload.get("data", {})),
                now,
            )
        )
        await db.commit()

    return {"ok": True, "server_id": server_id, "event_type": payload.get("event_type")}


@app.get("/health")
async def health():
    return {"ok": True, "mercury": bool(MERCURY_URL)}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
