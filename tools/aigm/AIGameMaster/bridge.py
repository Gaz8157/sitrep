"""
AI Game Master Bridge v10.0  - TACTICAL ZEUS (vLLM Agent)
========================================================
Full autonomous agent with multi-turn tool calling, operation planning,
outcome evaluation, dynamic difficulty, and per-player skill tracking.

Agent Features:
- Multi-turn agent loop  - AI calls tools, gets results, chains more actions (up to 3 turns)
- Operation planning  - multi-phase missions (recon -> staging -> assault -> exploit)
- Outcome evaluation  - tracks whether deployments engaged, survived, or got wiped
- Dynamic difficulty  - auto-adjusts based on player skill, AI success rate, engagement outcomes
- Per-player skill tracking  - KD ratio, threat level, engagement survival rate
- Chat -> autonomous handoff  - player chat requests feed into autonomous decisions
- Battlefield awareness  - event memory, movement tracking, tactical narrative
- 9 tools: spawn, move, delete, reinforce, set_behavior, broadcast, plan_operation, assess_situation, update_intent

Core Architecture:
- vLLM with OpenAI-compatible API  - proper tool calling via qwen3_coder parser
- Nemotron-3-Super-120B-A12B-FP8 on DGX Spark (128GB Grace Blackwell)
- Adaptive reasoning  - variable compute budget per request complexity
- 3-tier fallback  - tool calls -> JSON content -> minimal JSON retry
- Request lock  - ONE query at a time, no pileup
- Thread-safe console log buffer with lock

Environment Variables:
  BACKEND_MODE  - "ollama" (default) or "vllm" (remote DGX Spark)
  SPARK_IP      - vLLM host IP (default: 192.168.1.118) / Ollama host (default: 127.0.0.1)
  VLLM_PORT     - vLLM port (default: 8000) / Ollama port (default: 11434)
  VLLM_MODEL    - Model name (Ollama default: qwen3:8b, vLLM default: nemotron-fp8)
  BRIDGE_PORT   - Bridge listen port (default: 5555)
  AI_TIMEOUT    - AI query timeout seconds (default: 120)
  HEARTBEAT_SEC - Autonomous heartbeat interval (default: 90)
  MAX_TOKENS    - Max output tokens per request (default: 1024)
  FORCE_TOOLS   - Force OpenAI tool calling even on Ollama (default: false)
  OBJECTIVE_INTERVAL - Seconds between periodic objective broadcasts (default: 600)
"""

import asyncio, json, logging, os, time, re, random, math, threading, uuid
import struct, zlib
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pathlib import Path
from typing import Optional

import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn

# AI GM — new modular components
from data.operation import get_state_machine, Operation, OperationPhase
from data.intent import classify_intent, build_friendly_support_commands
from data.prompts import (
    build_planner_messages, build_opord_parser_messages,
    build_executor_messages, build_chat_messages,
)

# ─── Configuration ────────────────────────────────────────────────────────
# BACKEND_MODE: "ollama" (default, local GPU) or "vllm" (remote vLLM server)
# Ollama defaults: localhost:11434, model qwen2.5:14b
# vLLM defaults:   remote host:8000, model as served
BACKEND_MODE  = os.environ.get("BACKEND_MODE", "ollama")
_default_host = "127.0.0.1"   if BACKEND_MODE == "ollama" else "192.168.1.118"
_default_port = "11434"        if BACKEND_MODE == "ollama" else "8000"
_default_model= "qwen3:14b"   if BACKEND_MODE == "ollama" else "nemotron-fp8"
SPARK_IP      = os.environ.get("SPARK_IP", _default_host)
VLLM_PORT     = os.environ.get("VLLM_PORT", _default_port)
MODEL_NAME    = os.environ.get("VLLM_MODEL", _default_model)
BRIDGE_PORT   = int(os.environ.get("BRIDGE_PORT", "5555"))
TIMEOUT       = int(os.environ.get("AI_TIMEOUT", "120"))
HEARTBEAT_SEC = int(os.environ.get("HEARTBEAT_SEC", "90"))
OBJECTIVE_INTERVAL = int(os.environ.get("OBJECTIVE_INTERVAL", "600"))
MAX_TOKENS    = int(os.environ.get("MAX_TOKENS", "1024"))
OLLAMA_NUM_CTX    = int(os.environ.get("OLLAMA_NUM_CTX", "32768"))
OLLAMA_THINK      = os.environ.get("OLLAMA_THINK", "auto")  # auto / on / off
# Models that support OpenAI-compatible tool/function calling in the request body.
# Ollama's qwen2.5:14b generates good text but doesn't reliably return tool_calls —
# we use a direct JSON-array output approach instead (faster + more commands).
SUPPORTS_TOOL_CALLS = BACKEND_MODE == "vllm" or os.environ.get("FORCE_TOOLS", "").lower() in ("1", "true", "yes")
VLLM_URL      = f"http://{SPARK_IP}:{VLLM_PORT}/v1/chat/completions"
VLLM_BASE     = f"http://{SPARK_IP}:{VLLM_PORT}"

# ─── Session Config (resets on bridge restart) ────────────────────────
# Editable via dashboard API  - tells the AI how to behave
session_config = {
    "enemy_factions": ["USSR", "FIA"],    # Factions to spawn as enemies (override per session)
    "use_civilians": True,                # Whether to mix in civilian ambiance
    "ai_instructions": [],                # Free-form GM instructions injected each query
}

# ─── Server Process Management ───────────────────────────────────────
SERVER_EXE    = Path(os.environ.get("SERVER_EXE", "/opt/arma/arma-reforger-server"))
STEAMCMD_EXE  = Path(os.environ.get("STEAMCMD_EXE", "/usr/games/steamcmd"))
STEAM_APP_ID  = os.environ.get("STEAM_APP_ID", "1874900")  # Arma Reforger Dedicated Server
SERVER_INSTALL_DIR = Path(os.environ.get("SERVER_INSTALL_DIR", "/opt/arma"))

import subprocess
import signal

_server_process: subprocess.Popen | None = None
_server_status: str = "unknown"  # unknown, stopped, starting, running, stopping, updating
_server_pid: int | None = None
_stdout_fh = None  # File handle for server stdout log  - tracked for cleanup
_active_stdout_server_id: str = "default"  # updated when game server registers with its real server_id
_update_log: list[str] = []
_console_lock = threading.Lock()  # Thread-safe access to console_log_buffer

STATE_DIR = Path("./data/game_state")
LOG_DIR   = Path("./data/logs")
OPS_DIR   = Path("./data/operations")
DATA_DIR  = Path("./data")
SCHEDULE_PATH = Path(os.environ.get("SCHEDULE_PATH", "./data/schedule.json"))
_schedule_lock = asyncio.Lock()
_warnings_sent: dict[str, set[int]] = {}  # event_id -> set of warning minutes already sent
DECISION_LOG = LOG_DIR / "decisions.jsonl"
for d in [STATE_DIR, LOG_DIR, OPS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ─── Load Reference Data (map knowledge, game data) ──────────────────────
MAP_DATA: dict = {}
GAME_REF: dict = {}
MILITARY_DOCTRINE: dict = {}

def load_reference_data():
    global MAP_DATA, GAME_REF
    # Load map data files
    for f in DATA_DIR.glob("map_*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            map_name = data.get("_meta", {}).get("map", f.stem)
            MAP_DATA[map_name.lower()] = data
            log.info(f"Map knowledge loaded: {map_name} ({len(data.get('named_locations', []))} locations available)")
        except Exception as e:
            log.warning(f"Failed to load {f}: {e}")

    # Load game reference
    ref_file = DATA_DIR / "arma_reference_data.json"
    if ref_file.exists():
        try:
            GAME_REF = json.loads(ref_file.read_text(encoding="utf-8"))
            log.info(f"Loaded game reference data ({len(GAME_REF)} sections)")
        except Exception as e:
            log.warning(f"Failed to load game reference: {e}")

    # Load military doctrine reference
    global MILITARY_DOCTRINE
    doctrine_file = DATA_DIR / "military_doctrine_reference.json"
    if doctrine_file.exists():
        try:
            MILITARY_DOCTRINE = json.loads(doctrine_file.read_text(encoding="utf-8"))
            mission_count = len(MILITARY_DOCTRINE.get("mission_types", {}).get("special_operations", {})) + \
                           len(MILITARY_DOCTRINE.get("mission_types", {}).get("conventional_operations", {}))
            log.info(f"Military doctrine loaded ({mission_count} mission types)")
        except Exception as e:
            log.warning(f"Failed to load military doctrine: {e}")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(LOG_DIR / "bridge.log")])
log = logging.getLogger("ai-gm")

# ─── WebSocket Log Handler (streams logs to dashboard) ───────────────────
log_buffer: list[dict] = []   # ring buffer of recent log entries
LOG_BUFFER_MAX = 200

class DashboardLogHandler(logging.Handler):
    """Custom handler that buffers log entries and broadcasts them via websocket."""
    def emit(self, record):
        try:
            entry = {
                "time": datetime.fromtimestamp(record.created).strftime("%H:%M:%S"),
                "level": record.levelname,
                "msg": self.format(record),
            }
            log_buffer.append(entry)
            if len(log_buffer) > LOG_BUFFER_MAX:
                log_buffer[:] = log_buffer[-LOG_BUFFER_MAX:]
            # Schedule broadcast (can't await in sync handler)
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(_broadcast_log(entry))
            except RuntimeError:
                pass  # No event loop yet (startup)
        except Exception:
            pass

async def _broadcast_log(entry: dict):
    """Broadcast a single log entry to all connected dashboards."""
    await broadcast("server_log", entry)

_dashboard_log_handler = DashboardLogHandler()
_dashboard_log_handler.setFormatter(logging.Formatter("%(message)s"))
log.addHandler(_dashboard_log_handler)

load_reference_data()

@asynccontextmanager
async def lifespan(app):
    # Startup
    if SERVER_LOG_DIR.exists():
        _log_tailers[DEFAULT_SERVER] = _LogTailer(DEFAULT_SERVER, SERVER_LOG_DIR)
        log.info(f"Log tailer started for default server: {SERVER_LOG_DIR}")
    else:
        log.info(f"Server log dir not found ({SERVER_LOG_DIR}), console log tailing disabled")
    asyncio.create_task(_log_tail_loop())
    log.info("Log tail background task started")
    asyncio.create_task(_auto_warmup())
    asyncio.create_task(_rcon_auto_connect())
    asyncio.create_task(_rcon_poll_loop())
    asyncio.create_task(_scheduler.run())
    log.info("Scheduler engine started")
    yield
    # Shutdown — unload model from Ollama so VRAM is freed immediately
    # (Only runs on graceful shutdown — SIGKILL is handled by the panel's stop endpoint)
    log.info("Bridge shutting down — unloading model from Ollama")
    if BACKEND_MODE == "ollama":
        try:
            async with httpx.AsyncClient(timeout=5) as _c:
                _ps = await _c.get(f"{VLLM_BASE}/api/ps")
                for _m in _ps.json().get("models", []):
                    _mn = _m.get("name") or _m.get("model", "")
                    if _mn:
                        await _c.post(f"{VLLM_BASE}/api/generate",
                                      json={"model": _mn, "keep_alive": 0})
                        log.info(f"  Unloaded {_mn} from VRAM")
        except Exception as _e:
            log.warning(f"  Model unload on shutdown failed: {_e}")

app = FastAPI(title="AI Game Master Bridge", version="10.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Global State ─────────────────────────────────────────────────────────
current_state: dict = {}
pending_commands: list[dict] = []
command_history: list[dict] = []
decision_log: list[dict] = []
chat_history: list[dict] = []
mission_briefing: str = ""
last_state_time: float = 0
last_ai_response_time: float = 0
last_ai_latency_ms: float = 0
last_autonomous_query: float = 0
ai_enabled: bool = True
ai_thinking: bool = False
difficulty: int = 65
gm_mode: str = "on_demand"
total_spawns: int = 0
total_heartbeats: int = 0
total_commands_dispatched: int = 0
session_start: float = time.time()
connected_ws: list[WebSocket] = []
recent_grids: list[str] = []
escalation_level: int = 0
escalation_override: int = -1  # -1 = auto, 0-100 = manual slider (mapped to 0-4 levels)

# ─── Multi-Server Tracking ───────────────────────────────────────────────
# Each game server posts state with a unique server_id.
# Per-server data: state, pending commands, command history, timing.
# AI config (difficulty, gm_mode, ai_enabled) stays global (shared).
DEFAULT_SERVER = "default"

CHAT_HISTORY_DIR = Path(os.environ.get("CHAT_HISTORY_DIR", Path(__file__).parent / "chat_logs"))
CHAT_HISTORY_DIR.mkdir(exist_ok=True)
CHAT_HISTORY_MAX = 200  # entries kept on disk per server

OPORD_DIR = Path(__file__).parent / "data" / "opords"
OPORD_DIR.mkdir(parents=True, exist_ok=True)

PHASE_FIELDS = {"name", "objective", "duration_minutes", "forces", "broadcasts", "advance_trigger", "escalation"}


def _chat_history_path(server_id: str) -> Path:
    safe = server_id.replace("/", "_").replace("\\", "_") or "default"
    return CHAT_HISTORY_DIR / f"chat_{safe}.json"


def _load_chat_history(server_id: str) -> list[dict]:
    p = _chat_history_path(server_id)
    try:
        if p.exists():
            return json.loads(p.read_text())[-CHAT_HISTORY_MAX:]
    except Exception:
        pass
    return []


def _save_chat_history(server_id: str, history: list[dict]) -> None:
    try:
        _chat_history_path(server_id).write_text(
            json.dumps(history[-CHAT_HISTORY_MAX:])
        )
    except Exception:
        pass


class _ServerData:
    """Per-server state container."""
    __slots__ = ("server_id", "state", "pending_commands", "command_history",
                 "decision_log", "chat_history", "ingame_chat_log", "mission_briefing",
                 "last_state_time", "last_autonomous_query", "last_objective_broadcast",
                 "last_chat_time", "last_tactic_types", "state_machine", "admin_guids",
                 "broadcast_log")
    def __init__(self, server_id: str):
        self.server_id = server_id
        self.state: dict = {}
        self.pending_commands: list[dict] = []
        self.command_history: list[dict] = []
        self.decision_log: list[dict] = []
        self.chat_history: list[dict] = _load_chat_history(server_id)  # persisted across restarts
        self.ingame_chat_log: list[dict] = []  # in-game player chat from /chat_event
        self.mission_briefing: str = ""
        self.last_state_time: float = 0
        self.last_autonomous_query: float = 0
        self.last_objective_broadcast: float = 0
        self.last_chat_time: float = 0
        self.last_tactic_types: dict = {}
        self.state_machine = get_state_machine(server_id)
        self.admin_guids: list[str] = []  # GUIDs of players with admin/owner panel roles
        self.broadcast_log: list[dict] = []  # Rolling log of broadcasts sent (max 200)

_servers: dict[str, _ServerData] = {}

def get_server(server_id: str | None = None) -> _ServerData:
    """Get or create per-server data. Falls back to DEFAULT_SERVER."""
    sid = server_id or DEFAULT_SERVER
    if sid not in _servers:
        _servers[sid] = _ServerData(sid)
        log.info(f"New server registered: {sid}")
    return _servers[sid]

def get_server_list() -> list[dict]:
    """Build server info list for dashboard."""
    now = time.time()
    return [{
        "server_id": srv.server_id,
        "map": clean_map_name(srv.state.get("map", "Unknown")) if srv.state else "Unknown",
        "player_count": srv.state.get("player_count", 0) if srv.state else 0,
        "last_seen": srv.last_state_time,
        "online": (now - srv.last_state_time) < 60 if srv.last_state_time else False,
    } for srv in _servers.values()]

# ─── Scheduler Helpers ────────────────────────────────────────────────────

def _load_schedule() -> list[dict]:
    """Read schedule.json. Returns empty list if file missing or corrupt."""
    try:
        if SCHEDULE_PATH.exists():
            return json.loads(SCHEDULE_PATH.read_text(encoding="utf-8")).get("events", [])
    except Exception as e:
        log.warning(f"Schedule load error: {e}")
    return []

def _save_schedule(events: list[dict]) -> None:
    """Write schedule.json atomically (write temp then rename)."""
    try:
        SCHEDULE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = SCHEDULE_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps({"events": events}, indent=2), encoding="utf-8")
        tmp.replace(SCHEDULE_PATH)
    except Exception as e:
        log.error(f"Schedule save error: {e}")


def compute_next_run(event: dict) -> datetime | None:
    """Compute the next UTC datetime this event should fire. Returns None if misconfigured."""
    schedule = event.get("schedule", {})
    stype = schedule.get("type", "daily")

    try:
        if stype == "daily":
            tz_name = schedule.get("timezone", "UTC")
            tz = ZoneInfo(tz_name)
            h, m = map(int, schedule["time"].split(":"))
            now_local = datetime.now(tz)
            candidate = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
            if candidate <= now_local:
                candidate += timedelta(days=1)
            return candidate.astimezone(timezone.utc)

        elif stype == "weekly":
            tz_name = schedule.get("timezone", "UTC")
            tz = ZoneInfo(tz_name)
            h, m = map(int, schedule["time"].split(":"))
            DAY_MAP = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
            target_days = {DAY_MAP[d] for d in schedule.get("days", []) if d in DAY_MAP}
            if not target_days:
                return None
            now_local = datetime.now(tz)
            for offset in range(8):
                check_dt = now_local + timedelta(days=offset)
                if check_dt.weekday() in target_days:
                    candidate = check_dt.replace(hour=h, minute=m, second=0, microsecond=0)
                    if candidate > now_local:
                        return candidate.astimezone(timezone.utc)
            return None  # should not reach here if target_days is non-empty

        elif stype == "interval":
            hours = float(schedule.get("interval_hours", 6))
            return datetime.now(timezone.utc) + timedelta(hours=hours)

        elif stype == "one_time":
            dt_str = schedule.get("datetime_utc", "")
            if not dt_str:
                return None
            return datetime.fromisoformat(dt_str).replace(tzinfo=timezone.utc) if "Z" not in dt_str else datetime.fromisoformat(dt_str.replace("Z", "+00:00"))

    except (KeyError, ValueError, ZoneInfoNotFoundError) as e:
        log.warning(f"compute_next_run error for event {event.get('id', '?')}: {e}")
    return None


async def _scheduler_set_config(new_ai_enabled: bool | None = None, new_difficulty: int | None = None,
                                 new_escalation: int | None = None) -> None:
    """Update global AI config from scheduler and broadcast."""
    global ai_enabled, difficulty, escalation_override, escalation_level
    if new_ai_enabled is not None:
        ai_enabled = new_ai_enabled
    if new_difficulty is not None:
        difficulty = max(0, min(100, new_difficulty))
    if new_escalation is not None:
        escalation_override = max(0, min(100, new_escalation))
        escalation_level = min(4, escalation_override * 5 // 101)
    await broadcast("config_update", {
        "ai_enabled": ai_enabled,
        "difficulty": difficulty,
        "gm_mode": gm_mode,
        "escalation": escalation_override,
    })


async def _scheduler_execute_action(event: dict) -> str:
    """Execute a scheduled event's action. Returns a short status message."""
    action = event.get("action", "")
    params = event.get("params", {})
    log.info(f"[Scheduler] Executing action: {action} for event '{event.get('name', event.get('id', '?'))}'")

    try:
        if action == "RESTART":
            asyncio.create_task(_do_server_restart(check_updates=False))
            return "Server restart initiated"

        elif action == "RESTART_UPDATE":
            asyncio.create_task(_do_server_restart(check_updates=True))
            return "Server update+restart initiated"

        elif action == "BROADCAST":
            msg = str(params.get("message", "")).strip()
            if not msg:
                return "Skipped: no message"
            # Queue broadcast via game mod command queue (Reforger RCON has no `say` command).
            # Future: when RCON Plus mode is available, add rcon.send_command("@say ...") here.
            for srv in _servers.values():
                srv.pending_commands.append({
                    "type": "BROADCAST",
                    "message": msg,
                    "reasoning": "Scheduler broadcast"
                })
            await broadcast("scheduler_broadcast", {"message": msg})
            return f"Broadcast queued: {msg[:60]}"

        elif action == "WARMUP":
            asyncio.create_task(_auto_warmup())
            return "Model warmup triggered"

        elif action == "CLEAR_AI":
            for srv in _servers.values():
                srv.pending_commands.clear()
                srv.pending_commands.append({
                    "type": "DELETE_ALL", "units": "all", "count": 0,
                    "grid": "000-000", "behavior": "none", "faction": "OPFOR",
                    "reasoning": "Scheduler: clear all AI"
                })
            await broadcast("admin_command", {"command": "delete_all"})
            return "All AI units cleared"

        elif action == "RESET_ESCALATION":
            await _scheduler_set_config(new_escalation=0)
            return "Escalation reset to 0"

        elif action == "SET_DIFFICULTY":
            val = int(params.get("value", 50))
            await _scheduler_set_config(new_difficulty=val)
            return f"Difficulty set to {val}"

        elif action == "MISSION_RESET":
            global mission_briefing
            mission_briefing = ""
            for srv in _servers.values():
                srv.mission_briefing = ""
            await broadcast("mission_update", {"briefing": ""})
            return "Mission briefing cleared"

        elif action == "AI_TOGGLE":
            enabled = bool(params.get("enabled", True))
            await _scheduler_set_config(new_ai_enabled=enabled)
            return f"AI GM {'enabled' if enabled else 'disabled'}"

        else:
            return f"Unknown action: {action}"

    except Exception as e:
        log.error(f"[Scheduler] Action {action} failed: {e}")
        raise


class SchedulerEngine:
    """
    Asyncio background task that fires scheduled events.
    Wakes every 60 seconds, re-reads schedule.json on each tick.
    """

    async def run(self) -> None:
        log.info("[Scheduler] Engine started")
        while True:
            try:
                await self._tick()
            except Exception as e:
                log.error(f"[Scheduler] Tick error: {e}")
            await asyncio.sleep(60)

    async def _tick(self) -> None:
        now_utc = datetime.now(timezone.utc)

        async with _schedule_lock:
            events = _load_schedule()
            changed = False

            for event in events:
                if not event.get("enabled", False):
                    continue

                next_run_str = event.get("next_run_utc")
                if not next_run_str:
                    # First run — compute and save
                    nxt = compute_next_run(event)
                    if nxt:
                        event["next_run_utc"] = nxt.isoformat()
                        changed = True
                    continue

                # Parse next_run_utc
                try:
                    next_run = datetime.fromisoformat(next_run_str.replace("Z", "+00:00"))
                    if next_run.tzinfo is None:
                        next_run = next_run.replace(tzinfo=timezone.utc)
                except ValueError:
                    log.warning(f"[Scheduler] Invalid next_run_utc for {event.get('id')}: {next_run_str}")
                    continue

                eid = event["id"]

                # ── Pre-warning check (RESTART / RESTART_UPDATE only) ──
                warnings = event.get("warnings", {})
                if warnings.get("enabled") and event.get("action") in ("RESTART", "RESTART_UPDATE"):
                    warn_minutes = sorted(warnings.get("minutes", [15, 5, 1]), reverse=True)
                    warn_msg_template = warnings.get("message", "[Server] Restarting in {N} minutes.")
                    sent = _warnings_sent.get(eid, set())
                    for wm in warn_minutes:
                        warn_at = next_run - timedelta(minutes=wm)
                        if now_utc >= warn_at and wm not in sent:
                            msg = warn_msg_template.replace("{N}", str(wm))
                            # Queue via game mod command queue — Reforger RCON has no `say` command.
                            # Future: add rcon.send_command("@say ...") here for RCON Plus mode.
                            for srv in _servers.values():
                                srv.pending_commands.append({
                                    "type": "BROADCAST",
                                    "message": msg,
                                    "reasoning": f"Scheduler pre-warning {wm}m"
                                })
                            await broadcast("scheduler_broadcast", {"message": msg, "minutes_before": wm})
                            log.info(f"[Scheduler] Warning queued ({wm}m): {msg}")
                            sent.add(wm)
                    _warnings_sent[eid] = sent

                # ── Fire check ──
                if now_utc < next_run:
                    continue  # Not due yet

                # ── Player-aware gate ──
                gate = event.get("player_gate", {})
                if gate.get("enabled") and event.get("action") in ("RESTART", "RESTART_UPDATE"):
                    player_count = sum(
                        s.state.get("player_count", 0) for s in _servers.values()
                    )
                    defer_mins = float(gate.get("defer_minutes", 30))
                    # Defer if players online AND we haven't exceeded the defer window
                    overdue_by = (now_utc - next_run).total_seconds() / 60
                    if player_count > 0 and overdue_by < defer_mins:
                        log.info(f"[Scheduler] Event '{event.get('name')}' deferred — {player_count} players online ({overdue_by:.0f}/{defer_mins}m window)")
                        continue

                # ── Execute ──
                log_entry = {
                    "ts": now_utc.isoformat(),
                    "action": event["action"],
                    "status": "ok",
                    "message": "",
                }
                try:
                    log_entry["message"] = await _scheduler_execute_action(event)
                except Exception as ex:
                    log_entry["status"] = "error"
                    log_entry["message"] = str(ex)
                    log.error(f"[Scheduler] Event '{event.get('name')}' failed: {ex}")

                # Append to log (keep last 100)
                event.setdefault("log", []).append(log_entry)
                if len(event["log"]) > 100:
                    event["log"] = event["log"][-100:]
                event["last_run"] = log_entry

                # Clear sent warnings
                _warnings_sent.pop(eid, None)

                # Update next_run or disable
                stype = event.get("schedule", {}).get("type")
                if stype == "one_time":
                    event["enabled"] = False
                    event["next_run_utc"] = None
                else:
                    nxt = compute_next_run(event)
                    event["next_run_utc"] = nxt.isoformat() if nxt else None

                changed = True

                # Broadcast to dashboard
                await broadcast("scheduler_event", {
                    "id": eid,
                    "name": event.get("name"),
                    "action": event["action"],
                    "status": log_entry["status"],
                    "message": log_entry["message"],
                    "next_run_utc": event.get("next_run_utc"),
                })

            if changed:
                _save_schedule(events)


_scheduler = SchedulerEngine()


# ─── Game Server Log Tailing ─────────────────────────────────────────────
SERVER_LOG_DIR = Path(os.environ.get("SERVER_LOG_DIR", r"D:\armareforgerserver\profile\logs"))
console_log_buffer: list[dict] = []
CONSOLE_LOG_MAX = 500

class _LogTailer:
    """Tails the latest console log file from a game server."""
    def __init__(self, server_id: str, log_dir: Path):
        self.server_id = server_id
        self.log_dir = log_dir
        self.last_file: str = ""
        self.last_pos: int = 0
        self.initialized = False

    def _find_latest_log(self) -> Path | None:
        if not self.log_dir.exists():
            return None
        # Reforger puts logs in timestamped subdirs: logs/logs_2026-03-22_14-16-11/console.log
        logs = sorted(self.log_dir.glob("**/console*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
        return logs[0] if logs else None

    async def tail(self):
        latest = self._find_latest_log()
        if not latest:
            return []

        path_str = str(latest)
        # If file changed, seek to end (don't dump old content)
        if path_str != self.last_file:
            self.last_file = path_str
            # On first read, grab the last 32KB so the dashboard has recent history
            self.last_pos = max(0, latest.stat().st_size - 32768) if not self.initialized else latest.stat().st_size
            self.initialized = True

        current_size = latest.stat().st_size
        if current_size <= self.last_pos:
            return []

        entries = []
        try:
            with open(latest, "r", encoding="utf-8", errors="replace") as f:
                f.seek(self.last_pos)
                new_lines = f.readlines()
            self.last_pos = current_size

            for line in new_lines:
                line = line.strip()
                if not line:
                    continue
                # Classify log level from content
                level = "INFO"
                ll = line.upper()
                if "ERROR" in ll or "EXCEPTION" in ll or "FATAL" in ll:
                    level = "ERROR"
                elif "WARNING" in ll or "WARN" in ll:
                    level = "WARNING"
                elif "DEBUG" in ll:
                    level = "DEBUG"

                entry = {
                    "time": datetime.now().strftime("%H:%M:%S"),
                    "level": level,
                    "msg": line[:500],  # cap line length
                    "source": "game",
                    "server_id": self.server_id,
                }
                entries.append(entry)
                console_log_buffer.append(entry)

            # Trim buffer
            if len(console_log_buffer) > CONSOLE_LOG_MAX:
                console_log_buffer[:] = console_log_buffer[-CONSOLE_LOG_MAX:]

        except Exception as e:
            log.warning(f"Log tail error for {self.server_id}: {e}")

        return entries

_log_tailers: dict[str, _LogTailer] = {}

async def _log_tail_loop():
    """Background task: poll game server log files every 2s."""
    while True:
        for tailer in list(_log_tailers.values()):
            entries = await tailer.tail()
            for entry in entries:
                await broadcast("console_log", entry, server_id=entry["server_id"])
        await asyncio.sleep(2)

# ─── Restore catalog cache from last session (NOT full state) ────────────
# Only restores catalog + factions so the AI knows what units exist.
# Full game state (players, positions, etc.) comes fresh from the server.
_saved_state = STATE_DIR / "current.json"
if _saved_state.exists():
    try:
        _prev = json.loads(_saved_state.read_text(encoding="utf-8"))
        _prev_catalog = _prev.get("catalog", [])
        _prev_factions = _prev.get("factions", [])
        if _prev_catalog:
            log.info(f"Catalog cache restored: {len(_prev_catalog)} entries (will refresh when server connects)")
            # Only cache catalog/factions  - don't restore stale game state
            current_state = {"catalog": _prev_catalog, "factions": _prev_factions}
    except Exception as e:
        log.warning(f"Failed to load cached catalog: {e}")

# ─── REQUEST LOCK  - prevents query pileup on Ollama ─────────────────────
_query_lock = asyncio.Lock()

class ConfigUpdate(BaseModel):
    ai_enabled: Optional[bool] = None
    difficulty: Optional[int] = None
    gm_mode: Optional[str] = None
    escalation: Optional[int] = None

class MissionBriefing(BaseModel):
    briefing: str

class ChatMessage(BaseModel):
    message: str

class ChatEventRequest(BaseModel):
    player: str
    message: str
    server_id: str = DEFAULT_SERVER


# ─── RCON Client ──────────────────────────────────────────────────────────────
class RconClient:
    """Persistent BattlEye RCON client for Arma Reforger (TCP).

    Packet format: b'BE' + CRC32-LE(type+payload) + type(1) + payload(N)
    type 0x00 = login, 0x01 = command/response, 0x02 = server message/ack
    """
    MAX_LOG = 200
    RECONNECT_DELAY = 10

    def __init__(self):
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self.connected: bool = False
        self.authenticated: bool = False
        self.host: str = ""
        self.port: int = 16666
        self._password: str = ""
        self._seq: int = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._log: list[dict] = []
        self._should_run: bool = False
        self._read_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self.last_error: str = ""

    def _log_entry(self, direction: str, text: str) -> None:
        self._log.append({"ts": time.time(), "direction": direction, "text": text})
        if len(self._log) > self.MAX_LOG:
            self._log.pop(0)

    def _make_packet(self, ptype: int, payload: bytes) -> bytes:
        content = bytes([ptype]) + payload
        crc = zlib.crc32(content) & 0xFFFFFFFF
        return b'BE' + struct.pack('<I', crc) + content

    async def _read_packet(self) -> tuple[int, bytes]:
        """Read one complete RCON packet. Accumulates bytes until CRC validates."""
        header = await asyncio.wait_for(self._reader.readexactly(6), timeout=65.0)
        if header[:2] != b'BE':
            raise ValueError(f"Bad RCON header: {header[:2]!r}")
        expected_crc = struct.unpack('<I', header[2:6])[0]
        buf = bytearray()
        for _ in range(4097):  # max 4096-byte payload
            if len(buf) >= 1 and (zlib.crc32(bytes(buf)) & 0xFFFFFFFF) == expected_crc:
                return (buf[0], bytes(buf[1:]))
            b = await asyncio.wait_for(self._reader.readexactly(1), timeout=5.0)
            buf.extend(b)
        raise ValueError("RCON packet too large or CRC never matched")

    async def connect(self, host: str, port: int, password: str) -> None:
        """Connect to RCON, authenticate, start background reader. Raises on failure."""
        await self.disconnect()
        self.host = host
        self.port = port
        self._password = password
        self._should_run = True
        self.last_error = ""

        self._reader, self._writer = await asyncio.open_connection(host, port)
        self.connected = True
        self._log_entry("system", f"Connected to {host}:{port}")

        # Send login packet
        self._writer.write(self._make_packet(0x00, password.encode("utf-8")))
        await self._writer.drain()

        # Read login response (type 0x00, payload [0x01] = success)
        ptype, payload = await asyncio.wait_for(self._read_packet(), timeout=5.0)
        if ptype != 0x00 or not payload or payload[0] != 0x01:
            raise ValueError("Authentication failed — check rcon.password in config.json")

        self.authenticated = True
        self._log_entry("system", "Authenticated")
        self._read_task = asyncio.create_task(self._read_loop())

    async def disconnect(self) -> None:
        self._should_run = False
        if self._read_task:
            self._read_task.cancel()
            self._read_task = None
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None
        self.connected = False
        self.authenticated = False

    async def send_command(self, command: str) -> str:
        """Send an RCON command and return the server's response text."""
        if not self.authenticated:
            return "Not connected"
        async with self._lock:
            seq = self._seq & 0xFF
            self._seq = (self._seq + 1) & 0xFF
            fut: asyncio.Future = asyncio.get_event_loop().create_future()
            self._pending[seq] = fut
        try:
            pkt = self._make_packet(0x01, bytes([seq]) + command.encode("utf-8"))
            self._log_entry("sent", command)
            self._writer.write(pkt)
            await self._writer.drain()
            result = await asyncio.wait_for(asyncio.shield(fut), timeout=5.0)
            self._log_entry("recv", result)
            return result
        except asyncio.TimeoutError:
            self._pending.pop(seq, None)
            return "Command timed out"
        except Exception as e:
            self._pending.pop(seq, None)
            return f"Error: {e}"

    async def _read_loop(self) -> None:
        try:
            while self._should_run:
                try:
                    ptype, payload = await asyncio.wait_for(self._read_packet(), timeout=60.0)
                except asyncio.TimeoutError:
                    # Keepalive: send empty command
                    if self._writer:
                        seq = self._seq & 0xFF
                        self._seq = (self._seq + 1) & 0xFF
                        self._writer.write(self._make_packet(0x01, bytes([seq])))
                        await self._writer.drain()
                    continue

                if ptype == 0x01 and len(payload) >= 1:
                    seq = payload[0]
                    # Multi-packet: [seq][0xFF][idx][total][text]
                    if len(payload) >= 4 and payload[1] == 0xFF:
                        text = payload[4:].decode("utf-8", errors="replace")
                    else:
                        text = payload[1:].decode("utf-8", errors="replace")
                    fut = self._pending.pop(seq, None)
                    if fut and not fut.done():
                        fut.set_result(text)

                elif ptype == 0x02 and len(payload) >= 1:
                    seq = payload[0]
                    text = payload[1:].decode("utf-8", errors="replace")
                    self._log_entry("server", text)
                    # ACK the server message
                    self._writer.write(self._make_packet(0x02, bytes([seq])))
                    await self._writer.drain()
                    await broadcast("rcon_message", {"text": text, "ts": time.time()})

        except (ConnectionResetError, ConnectionAbortedError, asyncio.CancelledError):
            pass
        except Exception as e:
            log.warning(f"RCON read loop error: {e}")
            self.last_error = str(e)
        finally:
            self.connected = False
            self.authenticated = False
            if self._should_run:
                self._log_entry("system", f"Disconnected. Retrying in {self.RECONNECT_DELAY}s...")
                await asyncio.sleep(self.RECONNECT_DELAY)
                asyncio.create_task(self._auto_reconnect())

    async def _auto_reconnect(self) -> None:
        if not self._should_run:
            return
        try:
            cfg = {}
            if SERVER_CONFIG_PATH.exists():
                cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8")).get("rcon", {})
            host = cfg.get("address") or "127.0.0.1"
            port = int(cfg.get("port", 16666))
            password = cfg.get("password") or self._password
            await self.connect(host, port, password)
        except Exception as e:
            log.info(f"RCON reconnect failed: {e}")
            self.last_error = str(e)
            self._log_entry("system", f"Reconnect failed: {e}")
            if self._should_run:
                await asyncio.sleep(self.RECONNECT_DELAY)
                asyncio.create_task(self._auto_reconnect())


_rcon = RconClient()
_rcon_player_list: list[dict] = []   # [{id, name, uuid}] from last #players poll
_rcon_server_perf: dict = {}         # {fps, mem_mb, entities, timestamp} from last #monitor poll


def _parse_rcon_players(text: str) -> list[dict]:
    """Parse RCON #players response. Returns [{id, name, uuid}].
    Reforger format (best-effort): 'N  PlayerName (UUID: xxxx)' or 'N  PlayerName'"""
    results = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r'^(\d+)\s+(.+?)(?:\s+\(UUID:\s*([^)]+)\))?\s*$', line)
        if m:
            pid, name, uuid_val = int(m.group(1)), m.group(2).strip(), (m.group(3) or "").strip()
            results.append({"id": pid, "name": name, "uuid": uuid_val})
    return results


def _parse_rcon_monitor(text: str) -> dict:
    """Parse RCON #monitor response for FPS, memory, entity count."""
    result: dict = {}
    for line in text.splitlines():
        ll = line.lower()
        if "fps" in ll:
            m = re.search(r'(\d+(?:\.\d+)?)', line)
            if m:
                result["fps"] = float(m.group(1))
        if "mem" in ll:
            m = re.search(r'(\d+)', line)
            if m:
                result["mem_mb"] = int(m.group(1))
        if "entit" in ll:
            m = re.search(r'(\d+)', line)
            if m:
                result["entities"] = int(m.group(1))
    return result


async def _rcon_poll_loop():
    """Background loop: poll RCON every 30s for player list and server performance."""
    global _rcon_player_list, _rcon_server_perf
    await asyncio.sleep(15)  # Let RCON auth complete first
    while True:
        if _rcon.connected and _rcon.authenticated:
            try:
                players_resp = await _rcon.send_command("#players")
                parsed = _parse_rcon_players(players_resp)
                if parsed:
                    _rcon_player_list = parsed
                    log.debug(f"[RCON poll] {len(parsed)} players")

                monitor_resp = await _rcon.send_command("#monitor 0")
                perf = _parse_rcon_monitor(monitor_resp)
                if perf:
                    perf["timestamp"] = time.time()
                    _rcon_server_perf = perf
                    log.debug(f"[RCON poll] perf: {perf}")
            except Exception as e:
                log.debug(f"[RCON poll] error: {e}")
        await asyncio.sleep(30)


async def _rcon_auto_connect():
    """Try to connect RCON on startup if config.json has a password."""
    await asyncio.sleep(3)
    try:
        cfg = {}
        if SERVER_CONFIG_PATH.exists():
            cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8")).get("rcon", {})
        password = cfg.get("password", "")
        if not password:
            log.info("RCON: no password in config.json rcon.password — skipping auto-connect")
            return
        host = cfg.get("address") or "127.0.0.1"
        port = int(cfg.get("port", 16666))
        await _rcon.connect(host, port, password)
        log.info(f"RCON connected to {host}:{port}")
    except Exception as e:
        log.info(f"RCON auto-connect failed (will retry on manual connect): {e}")


# ─── WebSocket Broadcast ──────────────────────────────────────────────────
async def broadcast(event: str, data, server_id: str = None):
    msg = json.dumps({"event": event, "data": data, "server_id": server_id, "ts": time.time()})
    dead = []
    for ws in connected_ws:
        try:
            await ws.send_text(msg)
        except:
            dead.append(ws)
    for ws in dead:
        if ws in connected_ws:
            connected_ws.remove(ws)


# ─── Think-Tag Stripping ─────────────────────────────────────────────────
def strip_think_tags(text: str) -> str:
    """Remove <think>...</think> blocks that reasoning models emit.
    If the ENTIRE response is inside think tags, extract any JSON array from within."""
    # First try normal stripping
    cleaned = re.sub(r'<think>[\s\S]*?</think>', '', text, flags=re.IGNORECASE).strip()
    if cleaned:
        return cleaned

    # If nothing left after stripping closed tags, the answer might be INSIDE the think block
    # Extract content between think tags and look for JSON arrays
    think_match = re.search(r'<think>([\s\S]*?)</think>', text, flags=re.IGNORECASE)
    if think_match:
        inner = think_match.group(1)
        # Look for JSON array inside think tags
        json_match = re.search(r'\[[\s\S]*\]', inner)
        if json_match:
            return json_match.group(0).strip()
        # Look for any text after the last newline that could be the answer
        lines = inner.strip().split('\n')
        # Return last non-empty line if it looks like an answer
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith('*') and len(line) > 5:
                return line

    # Handle unclosed think tag  - extract content after <think> and look for JSON
    unclosed_match = re.search(r'<think>([\s\S]*?)$', text, flags=re.IGNORECASE)
    if unclosed_match:
        inner = unclosed_match.group(1)
        json_match = re.search(r'\[[\s\S]*\]', inner)
        if json_match:
            return json_match.group(0).strip()

    # Final fallback: strip tags and return whatever's left
    text = re.sub(r'<think>[\s\S]*?</think>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<think>[\s\S]*$', '', text, flags=re.IGNORECASE)
    return text.strip()


def extract_think_content(text: str) -> str:
    """Extract the reasoning content from <think>...</think> tags WITHOUT stripping it.
    Returns the raw reasoning text for storage as operational memory."""
    if not text:
        return ""
    # Closed think tags
    matches = re.findall(r'<think>([\s\S]*?)</think>', text, flags=re.IGNORECASE)
    if matches:
        return "\n".join(m.strip() for m in matches if m.strip())
    # Unclosed think tag
    unclosed = re.search(r'<think>([\s\S]*?)$', text, flags=re.IGNORECASE)
    if unclosed:
        return unclosed.group(1).strip()
    return ""


# ─── JSON Extraction (model-agnostic) ────────────────────────────────────
def extract_json_array(text: str) -> list:
    """Extract a JSON command array from ANY model output  - handles think tags,
    chain-of-thought reasoning, markdown code blocks, partial JSON, and
    individual command objects buried in prose."""
    text = strip_think_tags(text).strip()
    if not text:
        return []

    # 1. Direct parse  - entire text is valid JSON
    try:
        r = json.loads(text)
        if isinstance(r, list): return r
        if isinstance(r, dict): return [r]
    except: pass

    # 2. Code blocks  - ```json ... ```
    if "```" in text:
        for part in text.split("```"):
            c = part.strip()
            if c.startswith("json"): c = c[4:].strip()
            try:
                r = json.loads(c)
                if isinstance(r, list): return r
                if isinstance(r, dict): return [r]
            except: continue

    # 3. Bracket matching  - find outermost [...] with proper nesting
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '[':
            if depth == 0:
                start = i
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0 and start >= 0:
                candidate = text[start:i+1]
                try:
                    r = json.loads(candidate)
                    if isinstance(r, list) and r:
                        return r
                except:
                    pass
                start = -1

    # 4. Truncated array  - model hit token limit mid-JSON. Find [{ and try to close it.
    bracket_start = text.find('[{')
    if bracket_start >= 0:
        fragment = text[bracket_start:]
        # Try progressively closing the JSON
        for suffix in [']', '}]', '"}]', '"}]}']:
            try:
                r = json.loads(fragment + suffix)
                if isinstance(r, list):
                    log.info(f"Recovered truncated JSON with suffix '{suffix}'")
                    return r
            except: continue

    # 5. Individual objects  - find all {"type":"...",...} scattered in prose
    obj_pattern = re.finditer(r'\{[^{}]*"type"\s*:\s*"[A-Z_]+"[^{}]*\}', text)
    objects = []
    for m in obj_pattern:
        try:
            obj = json.loads(m.group())
            if obj.get("type") in ("SPAWN", "MOVE", "DELETE_ALL", "EVENT"):
                objects.append(obj)
        except: continue
    if objects:
        log.info(f"Extracted {len(objects)} individual command objects from prose")
        return objects

    return []


def extract_json_object(text: str) -> Optional[dict]:
    """Extract a JSON object {...} from AI response text."""
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        result = json.loads(text[start:end+1])
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError:
        for i in range(start, len(text)):
            if text[i] == "{":
                for j in range(len(text)-1, i, -1):
                    if text[j] == "}":
                        try:
                            result = json.loads(text[i:j+1])
                            return result if isinstance(result, dict) else None
                        except json.JSONDecodeError:
                            continue
        return None


# ─── Map Name Cleaning ────────────────────────────────────────────────────
def clean_map_name(raw: str) -> str:
    """Strip Arma localization keys to a human-readable map name.
    Example: '#AR-Editor_Mission_GM_Eden_Name' -> 'GM Eden'
    """
    name = raw.strip()
    # Remove leading # and AR- / AR_ prefix
    name = re.sub(r'^#(?:AR[-_])?', '', name)
    # Remove Editor_Mission_ prefix
    name = re.sub(r'^Editor_Mission_', '', name)
    # Remove _Name suffix
    name = re.sub(r'_Name$', '', name)
    # Replace underscores with spaces
    name = name.replace('_', ' ')
    return name.strip() or raw


# ─── Grid System (100m squares  - matches in-game map) ────────────────────
def _get_map_offsets(state: dict = None) -> tuple:
    """Get map offsets from game state. Enforce Script uses these in grid conversion."""
    if state:
        return (float(state.get("map_offset_x", 0)), float(state.get("map_offset_z", 0)))
    # Fallback to current_state global
    return (float(current_state.get("map_offset_x", 0)), float(current_state.get("map_offset_z", 0)))

def pos_to_grid6(x: float, y: float, state: dict = None) -> str:
    """Convert world coords to grid. Uses 100m squares to match in-game Arma Reforger map.
    Formula: gx = floor((x - offsetX) / 100), gz = floor((z - offsetZ) / 100)"""
    ox, oz = _get_map_offsets(state)
    gx = int((x - ox) / 100)
    gy = int((y - oz) / 100)
    if gx < 0: gx = 0
    if gy < 0: gy = 0
    return f"{gx:03d}-{gy:03d}"

def grid6_to_pos(grid: str, state: dict = None) -> tuple:
    """Convert grid to world coords. Uses 100m squares to match in-game Arma Reforger map.
    Formula: x = grid * 100 + offsetX + 50, z = grid * 100 + offsetZ + 50 (center of square)"""
    ox, oz = _get_map_offsets(state)
    parts = grid.split("-")
    if len(parts) != 2:
        return (5000.0, 5000.0)
    try:
        gx, gy = int(parts[0]), int(parts[1])
        return (gx * 100.0 + ox + 50.0, gy * 100.0 + oz + 50.0)
    except:
        return (5000.0, 5000.0)


# ─── Unit Catalog (auto-populated from game state v7.0) ──────────────────
# The Enforce Script scans SCR_EntityCatalogManagerComponent on startup
# and sends the full catalog in every state update. No more hardcoding.
cached_catalog: list = current_state.get("catalog", [])
cached_factions: list = current_state.get("factions", [])

def get_catalog(state: dict) -> list:
    """Get the live catalog from game state, with caching."""
    global cached_catalog
    catalog = state.get("catalog", [])
    if catalog:
        cached_catalog = catalog
    return cached_catalog

def get_factions(state: dict) -> list:
    """Get discovered factions from game state."""
    global cached_factions
    factions = state.get("factions", [])
    if factions:
        cached_factions = factions
    return cached_factions

def get_faction_role_map(state: dict) -> dict:
    """Build faction key -> role mapping from faction data (e.g. USSR -> OPFOR)."""
    factions = get_factions(state)
    return {f["key"]: f.get("role", "UNKNOWN") for f in factions}

def get_faction_keys_for_role(state: dict, role: str) -> set:
    """Get all faction keys that map to a given role (e.g. OPFOR -> {USSR})."""
    role_map = get_faction_role_map(state)
    return {k for k, v in role_map.items() if v.upper() == role.upper()}

def get_catalog_names_by_faction(state: dict, role: str = "OPFOR") -> list:
    """Get all catalog entry names for a specific faction role."""
    keys = get_faction_keys_for_role(state, role)
    return [e["name"] for e in get_catalog(state)
            if e.get("faction", "").upper() in keys or e.get("faction", "").upper() == role.upper()]

def get_catalog_names_by_category(state: dict, category: str) -> list:
    """Get all catalog entry names for a category (group/vehicle/character)."""
    return [e["name"] for e in get_catalog(state)
            if e.get("category", "").lower() == category.lower()]

def format_catalog_for_prompt(state: dict, max_entries: int = 200, enemy_only: bool = False) -> str:
    """Format catalog entries organized by side (enemy/friendly/neutral) and category.
    If entries have a 'side' field (manual catalog), uses that. Otherwise falls back to faction role detection."""
    catalog = get_catalog(state)
    if not catalog:
        return "Units: infantry_patrol, rifle_squad (fallback  - no catalog from game)"

    BASE_GAME_PREFIXES = {
        "Group_USSR_", "Group_US_", "Group_FIA_", "Group_CIV_",
        "Character_USSR_", "Character_US_", "Character_FIA_",
        "BTR", "UAZ", "BRDM", "T72", "M151", "HMMWV", "Truck",
        "E_Checkpoint", "E_Bunker", "E_Barricade", "E_CamoNet",
        "E_FieldHospital", "E_CommandPost", "E_SupplyCache",
        "HMG_", "Mortar_", "SPG9_",
    }

    def _mod_tag(name: str) -> str:
        return "" if any(name.startswith(pfx) for pfx in BASE_GAME_PREFIXES) else " [MOD]"

    has_sides = any(e.get("side") for e in catalog)

    CAT_HEADERS = {
        "group": "Infantry Groups (spawn 2-6)",
        "vehicle": "Vehicles (spawn 1-3)",
        "static_weapon": "Static Weapons (spawn 1-2, place on overwatch)",
        "composition": "Compositions (spawn 1, camps/checkpoints/bunkers/sandbags)",
        "character": "Characters (spawn 1-2, snipers/officers)",
    }
    cat_priority = ["group", "vehicle", "static_weapon", "composition", "character"]

    if has_sides:
        # ── Manual catalog with explicit side tags ──
        by_side: dict[str, dict[str, list[str]]] = {}
        for entry in catalog:
            side = entry.get("side", "enemy")
            cat = entry.get("category", "other")
            name = entry.get("name", "?")
            if side not in by_side:
                by_side[side] = {}
            if cat not in by_side[side]:
                by_side[side][cat] = []
            by_side[side][cat].append(name + _mod_tag(name))

        lines = ["AVAILABLE UNITS  - use EXACT prefab names. Do NOT invent names."]

        # Enemy section
        if "enemy" in by_side:
            lines.append("\n=== ENEMY FORCES (spawn these to challenge players) ===")
            for cat in cat_priority:
                entries = by_side["enemy"].get(cat, [])
                if entries:
                    lines.append(f"  {CAT_HEADERS.get(cat, cat)}: {', '.join(entries[:30])}")

        # Friendly section
        if "friendly" in by_side:
            lines.append("\n=== FRIENDLY FORCES (spawn these as backup/reinforcements for players) ===")
            lines.append("  Use faction=BLUFOR when spawning these. Send as QRF, set up friendly FOBs, provide overwatch.")
            for cat in cat_priority:
                entries = by_side["friendly"].get(cat, [])
                if entries:
                    lines.append(f"  {CAT_HEADERS.get(cat, cat)}: {', '.join(entries[:30])}")

        # Neutral section
        if "neutral" in by_side:
            lines.append("\n=== CIVILIAN/NEUTRAL (ambient population, do NOT use as combatants) ===")
            for cat in cat_priority:
                entries = by_side["neutral"].get(cat, [])
                if entries:
                    lines.append(f"  {CAT_HEADERS.get(cat, cat)}: {', '.join(entries[:30])}")

        return "\n".join(lines)

    else:
        # ── Legacy dynamic catalog  - filter by faction role ──
        role_map = get_faction_role_map(state)
        excluded_roles = set()
        if enemy_only:
            players = state.get("players", [])
            player_factions = set(p.get("faction", "").upper() for p in players if p.get("faction"))
            for pf in player_factions:
                role = role_map.get(pf, "")
                if role:
                    excluded_roles.add(role)
            excluded_roles.add("CIV")

        by_category: dict[str, dict[str, list[str]]] = {}
        for entry in catalog:
            cat = entry.get("category", "other")
            faction = entry.get("faction", "UNKNOWN")
            role = role_map.get(faction, "UNKNOWN")
            if enemy_only and role in excluded_roles:
                continue
            name = entry.get("name", "?")
            if cat not in by_category:
                by_category[cat] = {}
            if role not in by_category[cat]:
                by_category[cat][role] = []
            by_category[cat][role].append(name + _mod_tag(name))

        role_order = ["OPFOR", "INDFOR", "BLUFOR", "UNKNOWN"]
        lines = ["AVAILABLE UNITS  - use EXACT prefab names. Do NOT invent names."]
        count = 0
        for cat in cat_priority:
            if cat not in by_category:
                continue
            lines.append(CAT_HEADERS.get(cat, cat.upper()))
            for role in role_order:
                entries = by_category[cat].get(role, [])
                if not entries:
                    continue
                remaining = max_entries - count
                if remaining <= 0:
                    break
                shown = entries[:min(remaining, 30)]
                lines.append(f"  {role}: {', '.join(shown)}")
                count += len(shown)

        return "\n".join(lines)

def validate_unit_type(unit_name: str, state: dict, enforce_enemy: bool = False, requested_faction: str = "") -> str:
    """Validate a unit name against the live catalog. Returns closest match (always a prefab name).
    If enforce_enemy=True AND the AI didn't explicitly request BLUFOR/friendly, rejects player-side units.
    With manual catalog (side field), respects the side tag  - friendly units are allowed when requested."""
    catalog = get_catalog(state)
    if not catalog:
        return unit_name

    names = [e["name"] for e in catalog]
    has_sides = any(e.get("side") for e in catalog)

    # Check if the AI explicitly requested a friendly spawn
    req_upper = requested_faction.upper().strip()
    wants_friendly = req_upper in ("BLUFOR", "FRIENDLY", "US", "NATO")

    if enforce_enemy and not wants_friendly:
        # Find the entry by exact match, or fuzzy match
        entry = next((e for e in catalog if e["name"] == unit_name), None)
        if not entry:
            lower = unit_name.lower()
            entry = next((e for e in catalog if lower in e["name"].lower() or e["name"].lower() in lower), None)
        if entry:
            # With manual catalog, use the side field
            if has_sides:
                side = entry.get("side", "")
                if side == "friendly" or side == "neutral":
                    # AI picked a friendly/neutral unit but didn't ask for BLUFOR  - swap to enemy
                    enemy_entries = [e for e in catalog if e.get("side") == "enemy" and e.get("category") == entry.get("category", "group")]
                    if not enemy_entries:
                        enemy_entries = [e for e in catalog if e.get("side") == "enemy"]
                    if enemy_entries:
                        picked = random.choice(enemy_entries)
                        log.warning(f"Faction fix: '{unit_name}' is {side}  - swapped to enemy '{picked['name']}'")
                        return picked["name"]
            else:
                # Legacy: faction-based detection
                unit_faction = entry.get("faction", "").upper()
                players = state.get("players", [])
                player_factions = set(p.get("faction", "").upper() for p in players if p.get("faction"))
                role_map = get_faction_role_map(state)
                player_roles = set()
                for pf in player_factions:
                    role = role_map.get(pf, "")
                    if role:
                        player_roles.add(role)
                friendly_factions = set()
                for pf in player_factions:
                    friendly_factions.add(pf)
                for role in player_roles:
                    for fkey, frole in role_map.items():
                        if frole == role:
                            friendly_factions.add(fkey.upper())

                if unit_faction in friendly_factions or unit_faction == "CIV":
                    # Swap to enemy from catalog
                    enemy_entries = [e for e in catalog if e.get("faction", "").upper() not in friendly_factions
                                    and e.get("faction", "").upper() != "CIV"
                                    and e.get("category") == entry.get("category", "group")]
                    if enemy_entries:
                        picked = random.choice(enemy_entries)
                        log.warning(f"Faction fix: '{unit_name}' is player-side ({unit_faction})  - swapped to '{picked['name']}'")
                        return picked["name"]

    # Exact prefab name match
    if unit_name in names:
        return unit_name

    # Strip localization prefix if AI sent one (e.g. "#AR-Group_Squad" -> "Group_Squad")
    clean = unit_name.lstrip("#").replace("AR-", "") if unit_name.startswith("#") else unit_name

    # Exact match after cleaning
    if clean in names:
        return clean

    # Fuzzy match against prefab names
    lower = clean.lower()
    for name in names:
        if lower in name.lower() or name.lower() in lower:
            return name

    # Keyword match (split on _ and match any meaningful keyword)
    keywords = [kw for kw in lower.replace("-", "_").split("_") if len(kw) > 2]
    if keywords:
        best_match = None
        best_score = 0
        req_fac_up = requested_faction.upper() if requested_faction else ""
        for entry in catalog:
            name_lower = entry["name"].lower()
            score = sum(1 for kw in keywords if kw in name_lower)
            # Faction bonus — same-faction entries score higher, prevents cross-faction substitution
            if req_fac_up:
                entry_faction = entry.get("faction", "").upper()
                if entry_faction and (req_fac_up in entry_faction or entry_faction in req_fac_up):
                    score += 2
            # Boost score if category matches too
            if entry.get("category") == "group":
                score += 0.5
            if score > best_score:
                best_score = score
                best_match = entry["name"]
        if best_match and best_score >= 1:
            return best_match

    # Search display_name -> return corresponding prefab name
    for entry in catalog:
        dn = entry.get("display_name", "").lower()
        if lower in dn or dn.replace("#ar-", "").replace("_", " ") in lower.replace("_", " "):
            return entry["name"]

    # Default to first OPFOR group (using faction key->role mapping)
    opfor_keys = get_faction_keys_for_role(state, "OPFOR")
    opfor_groups = [e["name"] for e in catalog
                    if e.get("faction") in opfor_keys and e.get("category") == "group"]
    if opfor_groups:
        log.warning(f"Unit '{unit_name}' not found in catalog  - falling back to {opfor_groups[0]}")
        return opfor_groups[0]

    all_groups = [e["name"] for e in catalog if e.get("category") == "group"]
    if all_groups:
        log.warning(f"Unit '{unit_name}' not found  - falling back to {all_groups[0]}")
        return all_groups[0]

    return names[0] if names else unit_name


def validate_grid(grid: str, state: dict) -> str:
    """Validate grid format XXX-YYY and clamp to map bounds. Returns corrected grid."""
    import re
    if not grid or not isinstance(grid, str):
        # Fallback to first player's grid
        players = state.get("players", [])
        if players:
            px = float(players[0].get("pos", {}).get("x", 5000))
            py = float(players[0].get("pos", {}).get("y", players[0].get("pos", {}).get("z", 5000)))
            return pos_to_grid6(px, py)
        return "050-050"

    # Accept XXX-YYY format
    match = re.match(r'^(\d{1,3})-(\d{1,3})$', grid.strip())
    if not match:
        # Try to extract numbers from malformed grid
        nums = re.findall(r'\d+', grid)
        if len(nums) >= 2:
            gx, gy = int(nums[0]), int(nums[1])
        else:
            # Fallback to player position
            players = state.get("players", [])
            if players:
                px = float(players[0].get("pos", {}).get("x", 5000))
                py = float(players[0].get("pos", {}).get("y", players[0].get("pos", {}).get("z", 5000)))
                return pos_to_grid6(px, py)
            return "050-050"
    else:
        gx, gy = int(match.group(1)), int(match.group(2))

    # Clamp to map bounds  - grid uses /10 scale (12800m map = max grid ~1280)
    map_size = state.get("map_size", 12800)
    max_grid = map_size // 10
    gx = max(1, min(gx, max_grid - 1))
    gy = max(1, min(gy, max_grid - 1))
    result = f"{gx:03d}-{gy:03d}"

    # Snap to nearest valid spawn grid if available (avoids island/water grids)
    valid_grids = state.get("valid_spawn_grids", [])
    if valid_grids and result not in valid_grids:
        # Find closest valid grid by Manhattan distance
        best_grid = None
        best_dist = 999999
        for vg in valid_grids:
            try:
                parts = vg.split("-")
                vx, vy = int(parts[0]), int(parts[1])
                dist = abs(gx - vx) + abs(gy - vy)
                if dist < best_dist:
                    best_dist = dist
                    best_grid = vg
            except (ValueError, IndexError):
                continue
        if best_grid and best_dist < 200:  # Only snap if reasonably close
            log.info(f"Grid snap: {result} -> {best_grid} (nearest valid, dist={best_dist})")
            return best_grid

    return result


def clamp_spawn_count(count, unit_name: str = "") -> int:
    """Clamp spawn count to safe ranges by unit category."""
    try:
        count = int(count)
    except (TypeError, ValueError):
        count = 3
    unit_lower = unit_name.lower() if unit_name else ""
    if any(v in unit_lower for v in ("vehicle", "tank", "apc", "btr", "bmp", "brdm", "humvee", "truck", "ural")):
        return max(1, min(count, 3))   # Vehicles: 1-3
    elif any(s in unit_lower for s in ("static", "hmg", "mortar", "at", "aa", "tow", "spg")):
        return max(1, min(count, 4))   # Statics: 1-4
    else:
        return max(1, min(count, 8))   # Infantry: 1-8


# ─── Grid Management ──────────────────────────────────────────────────────
def pick_random_valid_grids(valid_grids: list, count: int = 10) -> list:
    global recent_grids
    available = [g for g in valid_grids if g not in recent_grids]
    if len(available) < count:
        available = valid_grids
    if not available:
        return []
    picked = random.sample(available, min(count, len(available)))
    recent_grids.extend(picked)
    if len(recent_grids) > 40:
        recent_grids = recent_grids[-20:]
    return picked


# ─── Escalation Engine ────────────────────────────────────────────────────
def compute_escalation(state: dict) -> int:
    global escalation_override
    # Manual slider override: 0-100 mapped to 0-4 levels
    if escalation_override >= 0:
        return min(4, escalation_override * 5 // 101)  # 0-19=QUIET, 20-39=PROBING, 40-59=ENGAGED, 60-79=ASSAULT, 80-100=OVERWHELM

    engagement = float(state.get("engagement_intensity", 0))
    casualties = int(state.get("casualties_last_10min", 0))
    active_ai = state.get("ai_units", {}).get("active", 0)
    player_count = state.get("player_count", 0)
    if player_count == 0: return 0
    ratio = active_ai / max(player_count, 1)
    if engagement < 0.1 and casualties == 0: return 0
    if engagement < 0.3: return 1
    if engagement < 0.6 or casualties < 3: return 2
    if engagement < 0.8 or ratio < 2: return 3
    return 4

ESCALATION_NAMES = ["QUIET", "PROBING", "ENGAGED", "ASSAULT", "OVERWHELM"]


# ─── Battlefield Awareness Engine ────────────────────────────────────
# Gives the AI "eyes"  - tracks events, movement vectors, engagement
# patterns, and builds a tactical narrative from raw game state changes.

class BattlefieldAwareness:
    """Tracks battlefield events and builds situational awareness for the AI.
    This is how we give the AI 'eyes'  - by converting raw state deltas into
    tactical intelligence: who moved where, who's fighting, what changed."""

    def __init__(self):
        self.event_log: list[dict] = []       # Rolling log of battlefield events
        self.player_history: dict[str, list] = {}  # Per-player position history
        self.prev_state: dict = {}             # Previous game state for diffing
        self.decision_memory: list[dict] = []  # Recent AI decisions + outcomes
        self.engagement_zones: list[dict] = [] # Active combat areas
        self.ai_group_history: dict[str, dict] = {}  # Track AI group states over time
        self.reasoning_memory: list[dict] = [] # AI's own reasoning from <think> tags
        self.max_events = 50
        self.max_decisions = 10
        self.max_reasoning = 5

    def update(self, new_state: dict) -> list[dict]:
        """Diff new state against previous, generate battlefield events."""
        events = []
        now = time.time()

        if not self.prev_state:
            self.prev_state = new_state
            return events

        # ── Track player movement ──
        old_players = {p.get("name", ""): p for p in self.prev_state.get("players", [])}
        new_players = {p.get("name", ""): p for p in new_state.get("players", [])}

        for name, p in new_players.items():
            px = float(p.get("pos", {}).get("x", 0))
            pz = float(p.get("pos", {}).get("z", p.get("pos", {}).get("y", 0)))

            # Track position history (last 10 positions)
            if name not in self.player_history:
                self.player_history[name] = []
            self.player_history[name].append({"x": px, "z": pz, "t": now})
            if len(self.player_history[name]) > 10:
                self.player_history[name] = self.player_history[name][-10:]

            old_p = old_players.get(name)
            if old_p:
                ox = float(old_p.get("pos", {}).get("x", 0))
                oz = float(old_p.get("pos", {}).get("z", old_p.get("pos", {}).get("y", 0)))
                dist = math.sqrt((px - ox)**2 + (pz - oz)**2)

                # Significant movement (>50m between state updates)
                if dist > 50:
                    direction = self._compass_direction(ox, oz, px, pz)
                    events.append({
                        "type": "PLAYER_MOVING",
                        "player": name,
                        "direction": direction,
                        "distance": int(dist),
                        "grid": pos_to_grid6(px, pz),
                        "time": now,
                    })

                # Player died
                if old_p.get("status") == "alive" and p.get("status") != "alive":
                    events.append({
                        "type": "PLAYER_DOWN",
                        "player": name,
                        "grid": pos_to_grid6(px, pz),
                        "time": now,
                    })

                # Player respawned
                if old_p.get("status") != "alive" and p.get("status") == "alive":
                    events.append({
                        "type": "PLAYER_RESPAWN",
                        "player": name,
                        "grid": pos_to_grid6(px, pz),
                        "time": now,
                    })

            # New player joined
            if name not in old_players:
                events.append({
                    "type": "PLAYER_JOIN",
                    "player": name,
                    "grid": pos_to_grid6(px, pz),
                    "time": now,
                })

        # Players who left
        for name in old_players:
            if name not in new_players:
                events.append({
                    "type": "PLAYER_LEAVE",
                    "player": name,
                    "time": now,
                })

        # ── Track AI group changes ──
        old_groups = {f"{g.get('type','')}@{g.get('grid','')}": g
                      for g in self.prev_state.get("ai_units", {}).get("groups", [])}
        new_groups = {f"{g.get('type','')}@{g.get('grid','')}": g
                      for g in new_state.get("ai_units", {}).get("groups", [])}

        old_ai_count = self.prev_state.get("ai_units", {}).get("active", 0)
        new_ai_count = new_state.get("ai_units", {}).get("active", 0)

        # AI casualties (group count decreased)
        if new_ai_count < old_ai_count:
            lost = old_ai_count - new_ai_count
            events.append({
                "type": "AI_CASUALTIES",
                "count": lost,
                "remaining": new_ai_count,
                "time": now,
            })

        # ── Detect engagement zones (players near AI groups) ──
        self.engagement_zones = []
        for pname, p in new_players.items():
            if p.get("status") != "alive":
                continue
            px = float(p.get("pos", {}).get("x", 0))
            pz = float(p.get("pos", {}).get("z", p.get("pos", {}).get("y", 0)))
            for g in new_state.get("ai_units", {}).get("groups", []):
                gparts = g.get("grid", "0-0").split("-")
                if len(gparts) == 2:
                    gx = int(gparts[0]) * 100 + 50
                    gz = int(gparts[1]) * 100 + 50
                    dist = math.sqrt((px - gx)**2 + (pz - gz)**2)
                    if dist < 500:  # Within 500m = contact zone
                        self.engagement_zones.append({
                            "player": pname,
                            "ai_group": g.get("type", "?"),
                            "distance": int(dist),
                            "grid": g.get("grid", "?"),
                        })

        # Save events
        self.event_log.extend(events)
        if len(self.event_log) > self.max_events:
            self.event_log = self.event_log[-self.max_events:]

        self.prev_state = new_state
        return events

    def record_reasoning(self, reasoning: str):
        """Store the AI's own reasoning from <think> tags as operational memory."""
        if not reasoning or len(reasoning) < 10:
            return
        # Keep only the last ~300 chars of reasoning to avoid bloating the prompt
        self.reasoning_memory.append({
            "time": time.time(),
            "reasoning": reasoning[:300],
        })
        if len(self.reasoning_memory) > self.max_reasoning:
            self.reasoning_memory = self.reasoning_memory[-self.max_reasoning:]

    def get_reasoning_context(self) -> str:
        """Build a reasoning memory string for the AI prompt."""
        if not self.reasoning_memory:
            return ""
        now = time.time()
        parts = []
        for r in self.reasoning_memory[-3:]:
            age = int(now - r["time"])
            parts.append(f"[{age}s ago] {r['reasoning']}")
        return "YOUR PREVIOUS REASONING:\n" + "\n".join(parts)

    def record_decision(self, commands: list, context: str = ""):
        """Record an AI decision for memory feedback."""
        entry = {
            "time": time.time(),
            "commands": [{"type": c.get("type"), "units": c.get("units"),
                          "grid": c.get("grid"), "behavior": c.get("behavior")}
                         for c in commands],
            "context": context[:100] if context else "autonomous",
        }
        self.decision_memory.append(entry)
        if len(self.decision_memory) > self.max_decisions:
            self.decision_memory = self.decision_memory[-self.max_decisions:]

    def get_movement_vectors(self) -> list[dict]:
        """Calculate player movement direction and speed from position history."""
        vectors = []
        now = time.time()
        for name, history in self.player_history.items():
            if len(history) < 2:
                continue
            # Use last 2 positions for current movement vector
            p1, p2 = history[-2], history[-1]
            dt = p2["t"] - p1["t"]
            if dt < 1:
                continue
            dx = p2["x"] - p1["x"]
            dz = p2["z"] - p1["z"]
            speed = math.sqrt(dx**2 + dz**2) / dt  # m/s
            if speed < 0.5:  # Below 0.5 m/s = stationary
                vectors.append({"player": name, "moving": False, "grid": pos_to_grid6(p2["x"], p2["z"])})
            else:
                direction = self._compass_direction(p1["x"], p1["z"], p2["x"], p2["z"])
                vectors.append({
                    "player": name,
                    "moving": True,
                    "direction": direction,
                    "speed_ms": round(speed, 1),
                    "speed_label": "sprinting" if speed > 5 else "running" if speed > 3 else "walking" if speed > 1 else "creeping",
                    "grid": pos_to_grid6(p2["x"], p2["z"]),
                })
        return vectors

    def build_narrative(self, state: dict) -> str:
        """Build a tactical narrative from events, movement, and engagement data.
        This is the AI's 'eyes'  - a human-readable summary of what's happening."""
        parts = []

        # Recent events (last 60 seconds)
        now = time.time()
        recent = [e for e in self.event_log if now - e.get("time", 0) < 60]
        if recent:
            event_strs = []
            for e in recent[-8:]:  # Cap at 8 most recent
                etype = e["type"]
                if etype == "PLAYER_MOVING":
                    event_strs.append(f"{e['player']} moving {e['direction']} ({e['distance']}m) toward {e['grid']}")
                elif etype == "PLAYER_DOWN":
                    event_strs.append(f"WARNING: {e['player']} KIA at {e['grid']}")
                elif etype == "PLAYER_RESPAWN":
                    event_strs.append(f"{e['player']} respawned at {e['grid']}")
                elif etype == "AI_CASUALTIES":
                    event_strs.append(f"Lost {e['count']} AI units ({e['remaining']} remaining)")
                elif etype == "PLAYER_JOIN":
                    event_strs.append(f"{e['player']} joined at {e['grid']}")
                elif etype == "PLAYER_LEAVE":
                    event_strs.append(f"{e['player']} disconnected")
            if event_strs:
                parts.append("RECENT EVENTS: " + "; ".join(event_strs))

        # Movement vectors
        vectors = self.get_movement_vectors()
        moving = [v for v in vectors if v.get("moving")]
        stationary = [v for v in vectors if not v.get("moving")]
        if moving:
            mv_strs = [f"{v['player']} {v['speed_label']} {v['direction']} from {v['grid']}" for v in moving]
            parts.append("MOVEMENT: " + "; ".join(mv_strs))
        if stationary and len(stationary) <= 5:
            st_strs = [f"{v['player']} stationary at {v['grid']}" for v in stationary]
            parts.append("HOLDING: " + "; ".join(st_strs))

        # Active engagements
        if self.engagement_zones:
            ez_strs = [f"{e['player']} in contact with {e['ai_group']} ({e['distance']}m) at {e['grid']}" for e in self.engagement_zones[:5]]
            parts.append("CONTACT: " + "; ".join(ez_strs))

        # Decision memory  - what we did recently and whether it worked
        if self.decision_memory:
            mem_strs = []
            for d in self.decision_memory[-3:]:
                age = int(now - d["time"])
                cmds = d["commands"]
                summary = ", ".join(f"{c['type']} {c.get('units','?')} at {c.get('grid','?')}" for c in cmds[:3])
                mem_strs.append(f"[{age}s ago] {summary}")
            parts.append("YOUR RECENT ACTIONS: " + "; ".join(mem_strs))

        return "\n".join(parts) if parts else ""

    @staticmethod
    def _compass_direction(x1, z1, x2, z2) -> str:
        """Calculate compass direction from (x1,z1) to (x2,z2)."""
        dx = x2 - x1
        dz = z2 - z1
        angle = math.degrees(math.atan2(dx, dz)) % 360
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        idx = int((angle + 22.5) / 45) % 8
        return dirs[idx]


# Global battlefield awareness instance (per-server in future)
_awareness: dict[str, BattlefieldAwareness] = {}

def get_awareness(server_id: str = None) -> BattlefieldAwareness:
    sid = server_id or DEFAULT_SERVER
    if sid not in _awareness:
        _awareness[sid] = BattlefieldAwareness()
    return _awareness[sid]


# ─── Per-Player Skill Tracking ──────────────────────────────────────
class PlayerSkillTracker:
    """Tracks individual player skill based on kills, deaths, and engagement outcomes.
    Allows the AI to target better players with harder encounters."""

    def __init__(self):
        self.players: dict[str, dict] = {}  # name -> stats

    def _ensure(self, name: str):
        if name not in self.players:
            self.players[name] = {
                "kills": 0, "deaths": 0, "engagements_survived": 0,
                "engagements_lost": 0, "time_alive_total": 0.0,
                "last_alive_start": None, "skill_rating": 50,
                "threat_level": "medium",  # low/medium/high/elite
            }

    def record_kill(self, name: str, count: int = 1):
        self._ensure(name)
        self.players[name]["kills"] += count
        self._recalc(name)

    def record_death(self, name: str):
        self._ensure(name)
        self.players[name]["deaths"] += 1
        self.players[name]["engagements_lost"] += 1
        if self.players[name]["last_alive_start"]:
            alive_time = time.time() - self.players[name]["last_alive_start"]
            self.players[name]["time_alive_total"] += alive_time
            self.players[name]["last_alive_start"] = None
        self._recalc(name)

    def record_alive(self, name: str):
        """Called each state update when player is alive."""
        self._ensure(name)
        if self.players[name]["last_alive_start"] is None:
            self.players[name]["last_alive_start"] = time.time()

    def record_engagement_survived(self, name: str):
        """Player was near AI and survived the encounter."""
        self._ensure(name)
        self.players[name]["engagements_survived"] += 1
        self._recalc(name)

    def _recalc(self, name: str):
        p = self.players[name]
        kills = p["kills"]
        deaths = max(p["deaths"], 1)
        kd = kills / deaths
        survival = p["engagements_survived"] / max(p["engagements_survived"] + p["engagements_lost"], 1)

        # Skill rating: 0-100 based on KD ratio and survival rate
        skill = min(100, int(25 * kd + 50 * survival + 5))
        p["skill_rating"] = skill

        if skill >= 80:
            p["threat_level"] = "elite"
        elif skill >= 60:
            p["threat_level"] = "high"
        elif skill >= 35:
            p["threat_level"] = "medium"
        else:
            p["threat_level"] = "low"

    def get_player_summary(self) -> str:
        """Build compact skill summary for the AI prompt."""
        if not self.players:
            return ""
        lines = []
        for name, p in sorted(self.players.items(), key=lambda x: x[1]["skill_rating"], reverse=True):
            lines.append(f"{name}: skill={p['skill_rating']} threat={p['threat_level']} K/D={p['kills']}/{p['deaths']}")
        return "PLAYER SKILL: " + "; ".join(lines)

    def get_threat_level(self, name: str) -> str:
        self._ensure(name)
        return self.players[name]["threat_level"]

    def get_avg_skill(self) -> float:
        if not self.players:
            return 50.0
        return sum(p["skill_rating"] for p in self.players.values()) / len(self.players)


# Per-server skill trackers
_skill_trackers: dict[str, PlayerSkillTracker] = {}

def get_skill_tracker(server_id: str = None) -> PlayerSkillTracker:
    sid = server_id or DEFAULT_SERVER
    if sid not in _skill_trackers:
        _skill_trackers[sid] = PlayerSkillTracker()
    return _skill_trackers[sid]


# ─── Outcome Evaluation Engine ──────────────────────────────────────
class OutcomeEvaluator:
    """Tracks outcomes of AI decisions  - did spawned units engage? survive?
    Feeds results back to the AI so it can learn within a session."""

    def __init__(self):
        self.pending_evaluations: list[dict] = []  # Commands awaiting outcome check
        self.outcomes: list[dict] = []              # Completed evaluations
        self.tactic_scores: dict[str, dict] = {}   # Per-behavior effectiveness tracking
        self.max_outcomes = 30

    def track_commands(self, commands: list, state: dict):
        """Register new commands for outcome tracking."""
        now = time.time()
        for cmd in commands:
            if cmd.get("type") in ("SPAWN", "REINFORCE"):
                self.pending_evaluations.append({
                    "command": cmd,
                    "spawn_time": now,
                    "grid": cmd.get("grid", "?"),
                    "units": cmd.get("units", "?"),
                    "count": cmd.get("count", 0),
                    "initial_ai_count": state.get("ai_units", {}).get("active", 0),
                    "checked": False,
                    "outcome": None,
                })

    def evaluate(self, state: dict) -> list[dict]:
        """Check pending evaluations against current state. Call each state update."""
        now = time.time()
        new_outcomes = []

        still_pending = []
        for ev in self.pending_evaluations:
            age = now - ev["spawn_time"]

            # Too early to evaluate (give units 30s to get into position)
            if age < 30:
                still_pending.append(ev)
                continue

            # Check if AI units still exist near the spawn grid
            current_ai = state.get("ai_units", {}).get("active", 0)
            ai_groups = state.get("ai_units", {}).get("groups", [])
            grid = ev["grid"]

            # Find groups near the spawn point
            units_near = 0
            for g in ai_groups:
                if g.get("grid") == grid or self._grids_nearby(g.get("grid", ""), grid, 3):
                    units_near += g.get("count", 0)

            # Evaluate after 2 minutes
            if age >= 240 or ev["checked"]:
                engagement = state.get("engagement_intensity", 0)
                outcome = {
                    **ev,
                    "eval_time": now,
                    "age_seconds": int(age),
                    "units_surviving": units_near,
                    "engaged": engagement > 0.2,
                }

                if units_near == 0:
                    outcome["result"] = "WIPED"  # All units destroyed
                    outcome["success"] = False
                elif engagement > 0.3:
                    outcome["result"] = "ENGAGED"  # Units in combat
                    outcome["success"] = True
                elif units_near >= ev["count"]:
                    outcome["result"] = "IDLE"  # Units alive but not fighting
                    outcome["success"] = None  # Neutral  - might need repositioning
                else:
                    outcome["result"] = "ATTRITION"  # Some losses
                    outcome["success"] = True

                new_outcomes.append(outcome)
                self.outcomes.append(outcome)
                # Track per-tactic effectiveness
                behavior = ev.get("command", {}).get("behavior", "unknown")
                if behavior not in self.tactic_scores:
                    self.tactic_scores[behavior] = {"wins": 0, "losses": 0, "neutral": 0}
                if outcome["success"] is True:
                    self.tactic_scores[behavior]["wins"] += 1
                elif outcome["success"] is False:
                    self.tactic_scores[behavior]["losses"] += 1
                else:
                    self.tactic_scores[behavior]["neutral"] += 1
                continue

            # Mark for evaluation next cycle
            ev["checked"] = True
            still_pending.append(ev)

        self.pending_evaluations = still_pending

        # Trim history
        if len(self.outcomes) > self.max_outcomes:
            self.outcomes = self.outcomes[-self.max_outcomes:]

        return new_outcomes

    def build_feedback(self) -> str:
        """Build an outcome feedback string for the AI prompt."""
        if not self.outcomes:
            return ""
        recent = self.outcomes[-5:]
        lines = []
        for o in recent:
            age = int(time.time() - o["spawn_time"])
            lines.append(f"[{age}s ago] {o['units']}x{o['count']} @ {o['grid']}: {o['result']} ({o.get('units_surviving',0)} surviving)")
        return "OUTCOME FEEDBACK: " + "; ".join(lines)

    @staticmethod
    def _grids_nearby(g1: str, g2: str, tolerance: int = 3) -> bool:
        """Check if two grids are within tolerance cells of each other."""
        try:
            p1 = g1.split("-")
            p2 = g2.split("-")
            return abs(int(p1[0]) - int(p2[0])) <= tolerance and abs(int(p1[1]) - int(p2[1])) <= tolerance
        except (ValueError, IndexError):
            return False

    def get_success_rate(self) -> float:
        """Overall success rate of AI deployments."""
        successes = [o for o in self.outcomes if o.get("success") is True]
        total = [o for o in self.outcomes if o.get("success") is not None]
        if not total:
            return 0.5
        return len(successes) / len(total)

    def build_tactic_summary(self) -> str:
        """Build a summary of which tactics are working and which aren't."""
        if not self.tactic_scores:
            return ""
        lines = []
        for tactic, scores in sorted(self.tactic_scores.items(), key=lambda x: x[1]["wins"] + x[1]["losses"], reverse=True):
            total = scores["wins"] + scores["losses"]
            if total == 0:
                continue
            rate = scores["wins"] / total * 100
            emoji = "effective" if rate >= 60 else "ineffective" if rate < 40 else "mixed"
            lines.append(f"{tactic}: {emoji} ({scores['wins']}W/{scores['losses']}L)")
        if not lines:
            return ""
        return "TACTIC EFFECTIVENESS: " + "; ".join(lines[:6])


# Per-server outcome evaluators
_evaluators: dict[str, OutcomeEvaluator] = {}

def get_evaluator(server_id: str = None) -> OutcomeEvaluator:
    sid = server_id or DEFAULT_SERVER
    if sid not in _evaluators:
        _evaluators[sid] = OutcomeEvaluator()
    return _evaluators[sid]


# ─── Commander's Intent Engine ──────────────────────────────────────
class CommanderIntent:
    """Persistent high-level strategic intent that guides all AI decisions.
    The AI can update its own intent via the update_intent tool, creating
    continuity across heartbeats and allowing strategic multi-turn thinking."""

    def __init__(self):
        self.intent: str = ""           # Current strategic intent
        self.priority_targets: list[str] = []  # Priority grid areas or player names
        self.posture: str = "balanced"  # aggressive, defensive, balanced, recon
        self.updated_at: float = 0
        self.history: list[dict] = []   # Previous intents for context

    def update(self, intent: str, posture: str = "", priority_targets: list = None):
        """Update the commander's intent."""
        if self.intent:
            self.history.append({
                "intent": self.intent,
                "posture": self.posture,
                "time": self.updated_at,
            })
            if len(self.history) > 5:
                self.history = self.history[-5:]
        self.intent = intent[:200]
        if posture in ("aggressive", "defensive", "balanced", "recon"):
            self.posture = posture
        if priority_targets:
            self.priority_targets = [str(t)[:30] for t in priority_targets[:5]]
        self.updated_at = time.time()

    def build_context(self) -> str:
        """Build the intent context for the AI prompt."""
        if not self.intent:
            return ""
        age = int(time.time() - self.updated_at) if self.updated_at else 0
        parts = [f"COMMANDER'S INTENT (set {age}s ago, posture={self.posture}): {self.intent}"]
        if self.priority_targets:
            parts.append(f"PRIORITY TARGETS: {', '.join(self.priority_targets)}")
        if self.history:
            prev = self.history[-1]
            prev_age = int(time.time() - prev["time"]) if prev.get("time") else 0
            parts.append(f"PREVIOUS INTENT ({prev_age}s ago): {prev['intent']}")
        return "\n".join(parts)


# Per-server commander's intent
_intents: dict[str, CommanderIntent] = {}

def get_intent(server_id: str = None) -> CommanderIntent:
    sid = server_id or DEFAULT_SERVER
    if sid not in _intents:
        _intents[sid] = CommanderIntent()
    return _intents[sid]


# ─── Dynamic Difficulty Engine ──────────────────────────────────────
class DynamicDifficulty:
    """Auto-adjusts difficulty based on player performance within a session.
    The AI gets harder when players are dominating, easier when struggling."""

    def __init__(self, base_difficulty: int = 65):
        self.base_difficulty = base_difficulty
        self.current_difficulty = base_difficulty
        self.adjustment_history: list[dict] = []
        self.last_adjustment_time: float = 0
        self.adjustment_cooldown: float = 120  # Don't adjust more than every 2 min

    def evaluate(self, state: dict, skill_tracker: PlayerSkillTracker,
                 evaluator: OutcomeEvaluator, awareness: BattlefieldAwareness) -> int:
        """Evaluate and potentially adjust difficulty. Returns current difficulty."""
        now = time.time()
        if now - self.last_adjustment_time < self.adjustment_cooldown:
            return self.current_difficulty

        # Inputs for adjustment
        avg_skill = skill_tracker.get_avg_skill()
        success_rate = evaluator.get_success_rate()
        recent_events = [e for e in awareness.event_log if now - e.get("time", 0) < 300]
        player_deaths = sum(1 for e in recent_events if e["type"] == "PLAYER_DOWN")
        ai_losses = sum(e.get("count", 0) for e in recent_events if e["type"] == "AI_CASUALTIES")

        # Calculate adjustment
        adjustment = 0

        # Players too skilled -> increase difficulty
        if avg_skill > 70:
            adjustment += 5
        elif avg_skill > 55:
            adjustment += 2
        elif avg_skill < 30:
            adjustment -= 5
        elif avg_skill < 40:
            adjustment -= 2

        # AI success_rate = how many AI deployments survive/engage vs get wiped
        # Low success = players destroying AI easily = too easy, increase difficulty
        # High success = AI surviving/dominating = too hard, decrease difficulty
        if success_rate < 0.3:
            adjustment += 3  # Players wiping AI easily -> make it harder
        elif success_rate > 0.8:
            adjustment -= 3  # AI dominating -> ease off

        # Many player deaths = too hard
        if player_deaths >= 3:
            adjustment -= 4
        # Many AI losses, few player deaths = too easy
        if ai_losses > 5 and player_deaths == 0:
            adjustment += 4

        if adjustment != 0:
            old = self.current_difficulty
            self.current_difficulty = max(10, min(100, self.current_difficulty + adjustment))
            self.last_adjustment_time = now
            self.adjustment_history.append({
                "time": now, "old": old, "new": self.current_difficulty,
                "reason": f"skill={avg_skill:.0f} success={success_rate:.1%} deaths={player_deaths} ai_loss={ai_losses}",
            })
            log.info(f"Dynamic difficulty: {old} -> {self.current_difficulty} ({adjustment:+d}) | {self.adjustment_history[-1]['reason']}")

        return self.current_difficulty


# Per-server dynamic difficulty
_dynamic_diff: dict[str, DynamicDifficulty] = {}

def get_dynamic_difficulty(server_id: str = None) -> DynamicDifficulty:
    sid = server_id or DEFAULT_SERVER
    if sid not in _dynamic_diff:
        _dynamic_diff[sid] = DynamicDifficulty(difficulty)
    return _dynamic_diff[sid]


# ─── Operation Planner ──────────────────────────────────────────────
class OperationPlanner:
    """Plans and tracks multi-phase military operations.
    Each operation has phases (recon -> staging -> assault -> exploit)
    that span multiple heartbeats."""

    def __init__(self):
        self.active_op: dict | None = None
        self.completed_ops: list[dict] = []
        self.max_completed = 10

    def start_operation(self, op_name: str, phases: list[dict], context: str = ""):
        """Start a new multi-phase operation."""
        self.active_op = {
            "name": op_name,
            "phases": phases,  # [{name, objective, duration_s, commands_template}]
            "current_phase": 0,
            "phase_start_time": time.time(),
            "start_time": time.time(),
            "context": context,
            "results": [],
            "status": "active",
        }
        log.info(f"Operation '{op_name}' started  - {len(phases)} phases")

    def get_current_phase(self) -> dict | None:
        """Get the current phase of the active operation."""
        if not self.active_op:
            return None
        idx = self.active_op["current_phase"]
        if idx >= len(self.active_op["phases"]):
            return None
        return self.active_op["phases"][idx]

    def advance_phase(self, result: str = ""):
        """Advance to the next phase of the operation."""
        if not self.active_op:
            return
        phase = self.get_current_phase()
        if phase:
            self.active_op["results"].append({
                "phase": phase["name"],
                "result": result,
                "duration": time.time() - self.active_op["phase_start_time"],
            })
        self.active_op["current_phase"] += 1
        self.active_op["phase_start_time"] = time.time()

        if self.active_op["current_phase"] >= len(self.active_op["phases"]):
            self.complete_operation("all_phases_complete")

    def complete_operation(self, reason: str = ""):
        """Complete or abort the current operation."""
        if not self.active_op:
            return
        self.active_op["status"] = "complete"
        self.active_op["end_time"] = time.time()
        self.active_op["completion_reason"] = reason
        self.completed_ops.append(self.active_op)
        if len(self.completed_ops) > self.max_completed:
            self.completed_ops = self.completed_ops[-self.max_completed:]
        log.info(f"Operation '{self.active_op['name']}' complete: {reason}")
        self.active_op = None

    def should_advance(self) -> bool:
        """Check if current phase should auto-advance based on time."""
        if not self.active_op:
            return False
        phase = self.get_current_phase()
        if not phase:
            return False
        elapsed = time.time() - self.active_op["phase_start_time"]
        return elapsed >= phase.get("duration_s", 300)

    def build_context(self) -> str:
        """Build operation context for the AI prompt."""
        if not self.active_op:
            return ""
        phase = self.get_current_phase()
        if not phase:
            return ""
        elapsed = int(time.time() - self.active_op["phase_start_time"])
        remaining = max(0, int(phase.get("duration_s", 300) - elapsed))
        op = self.active_op
        prev_results = "; ".join(r["result"] for r in op.get("results", [])[-3:])
        return (f"ACTIVE OPERATION: {op['name']}  - Phase {op['current_phase']+1}/{len(op['phases'])}: "
                f"{phase['name']} (objective: {phase.get('objective', '?')}, {remaining}s remaining). "
                f"Previous phases: {prev_results or 'none yet'}.")


# Per-server operation planners
_planners: dict[str, OperationPlanner] = {}

def get_planner(server_id: str = None) -> OperationPlanner:
    sid = server_id or DEFAULT_SERVER
    if sid not in _planners:
        _planners[sid] = OperationPlanner()
    return _planners[sid]


# ─── Chat -> Autonomous Handoff ─────────────────────────────────────
# Stores recent chat directives so the autonomous heartbeat knows about
# player requests made through chat.
_chat_directives: dict[str, list[dict]] = {}  # server_id -> [{message, time}]
MAX_DIRECTIVE_AGE = 600  # 10 minutes

def record_chat_directive(server_id: str, message: str):
    """Record a player chat command for autonomous mode to pick up."""
    sid = server_id or DEFAULT_SERVER
    if sid not in _chat_directives:
        _chat_directives[sid] = []
    _chat_directives[sid].append({"message": message, "time": time.time()})
    # Cap at 5 most recent
    _chat_directives[sid] = _chat_directives[sid][-5:]

def get_chat_directives(server_id: str) -> str:
    """Get recent chat directives for the autonomous prompt."""
    sid = server_id or DEFAULT_SERVER
    directives = _chat_directives.get(sid, [])
    now = time.time()
    # Filter out stale directives
    active = [d for d in directives if now - d["time"] < MAX_DIRECTIVE_AGE]
    _chat_directives[sid] = active
    if not active:
        return ""
    lines = [f"[{int(now - d['time'])}s ago] Player said: \"{d['message']}\"" for d in active[-3:]]
    return "PLAYER REQUESTS (incorporate these): " + "; ".join(lines)


# ─── Adaptive Reasoning Router ──────────────────────────────────────
# nemotron-3-super supports variable reasoning budgets. Route simple
# commands to fast inference, complex tactical planning to deep reasoning.

def classify_request_complexity(message: str = "", state: dict = None, is_chat: bool = False) -> str:
    """Classify request complexity for adaptive reasoning budget.
    Returns: 'simple', 'tactical', 'strategic'"""
    if is_chat:
        msg = message.lower()
        # Simple direct commands
        if any(kw in msg for kw in ["spawn", "send", "add", "place", "put", "drop"]):
            if len(msg.split()) < 15:
                return "simple"
        # Complex planning
        if any(kw in msg for kw in ["plan", "strategy", "ambush", "flank", "coordinate",
                                      "defend", "assault", "operation", "set up", "prepare"]):
            return "strategic"
        return "tactical"

    # Autonomous query  - base on battlefield state
    if not state:
        return "tactical"

    awareness = get_awareness(state.get("server_id"))
    engagement = float(state.get("engagement_intensity", 0))
    active_contacts = len(awareness.engagement_zones)
    player_count = state.get("player_count", 0)

    # High engagement with contacts = needs deep tactical thinking
    if engagement > 0.6 or active_contacts > 2:
        return "strategic"
    # Some activity
    if engagement > 0.2 or active_contacts > 0 or player_count > 3:
        return "tactical"
    # Quiet = simple routine spawn
    return "simple"


def get_model_options(complexity: str, is_chat: bool = False) -> dict:
    """Get optimized model options based on request complexity.
    For Ollama: injects num_ctx and optional think param.
    Temperature tuned per task: low for JSON reliability, higher for reasoning/narrative."""
    base = {
        "top_p": 0.95,
    }
    if BACKEND_MODE == "ollama":
        base["options"] = {"num_ctx": OLLAMA_NUM_CTX}

    if is_chat:
        return {**base, "temperature": 0.9, "max_tokens": 1024}
    elif complexity == "simple":
        return {**base, "temperature": 0.4, "max_tokens": 2048}
    elif complexity == "strategic":
        return {**base, "temperature": 0.8, "max_tokens": 4096}
    else:  # tactical
        return {**base, "temperature": 0.6, "max_tokens": 3072}


# ─── Compact Prompt Builder ──────────────────────────────────────────────
# ─── Terrain Map Intelligence ────────────────────────────────────────────
cached_terrain_map: dict = {}

def parse_terrain_map(state: dict) -> dict:
    """Cache and parse the terrain map from game state."""
    global cached_terrain_map
    tmap = state.get("terrain_map")
    if tmap and isinstance(tmap, dict) and tmap.get("grid"):
        cached_terrain_map = tmap
    return cached_terrain_map

def describe_terrain_near(grid: str, terrain_map: dict) -> str:
    """Generate a tactical terrain description around a grid coordinate."""
    if not terrain_map or not terrain_map.get("grid"):
        return ""

    grid_str = terrain_map["grid"]
    cell_m = terrain_map.get("cell_meters", 200)
    grid_size = terrain_map.get("grid_size", 64)

    # Parse grid coordinate to cell indices
    parts = grid.split("-")
    if len(parts) != 2:
        return ""
    try:
        world_x = int(parts[0]) * 100  # grid to meters (100m squares)
        world_z = int(parts[1]) * 100
        cx = int(world_x / cell_m)
        cz = int(world_z / cell_m)
    except:
        return ""

    # Split grid into rows
    rows = grid_str.split("|")
    if len(rows) < grid_size:
        # No row separators  - split by grid_size
        rows = [grid_str[i:i+grid_size] for i in range(0, len(grid_str), grid_size)]

    def get_cell(x, z):
        if 0 <= z < len(rows) and 0 <= x < len(rows[z]):
            return rows[z][x]
        return "?"

    # Describe 8 directions from the point
    labels = {"W": "water", "L": "low ground", "M": "open ground", "H": "high ground", "B": "buildings"}
    dirs = [("N", 0, -1), ("NE", 1, -1), ("E", 1, 0), ("SE", 1, 1),
            ("S", 0, 1), ("SW", -1, 1), ("W", -1, 0), ("NW", -1, -1)]

    desc_parts = []
    here = get_cell(cx, cz)
    desc_parts.append(f"Here: {labels.get(here, '?')}")

    for dname, dx, dz in dirs:
        # Check 1 and 2 cells out
        c1 = get_cell(cx + dx, cz + dz)
        c2 = get_cell(cx + dx*2, cz + dz*2)
        terrain_1 = labels.get(c1, "?")
        terrain_2 = labels.get(c2, "?")
        if c1 == c2:
            desc_parts.append(f"{dname}: {terrain_1}")
        else:
            desc_parts.append(f"{dname}: {terrain_1} then {terrain_2}")

    return ", ".join(desc_parts)

def build_los_tactical_analysis(state: dict) -> str:
    """Pre-compute tactical opportunities from LOS/heading data.
    Converts raw sightline data into spawn advice the AI can act on immediately."""
    awareness_data = state.get("awareness", [])
    if not awareness_data:
        return ""

    # Directions in the opposite hemisphere = player can't see there
    BLIND_HEMISPHERE = {
        "N":  ["SW","S","SE"],  "NE": ["W","SW","S"],
        "E":  ["NW","W","SW"],  "SE": ["N","NW","W"],
        "S":  ["NE","N","NW"],  "SW": ["E","NE","N"],
        "W":  ["SE","E","NE"],  "NW": ["S","SE","E"],
    }

    lines = ["TACTICAL ANALYSIS (use these to choose spawn directions):"]
    for pa in awareness_data:
        pname = pa.get("player", "?")
        heading = pa.get("heading_dir", "")
        los = pa.get("los", {})
        nearest = pa.get("nearest_location", {})
        if not los:
            continue

        blind = BLIND_HEMISPHERE.get(heading, [])

        # Covered approach: building/terrain close in that direction masks movement
        covered = []
        # Exposed: player has long clear LOS — don't spawn units directly in line of sight
        avoid = []
        for d, info in los.items():
            dist = info.get("dist", 800)
            blocked = info.get("blocked", "clear")
            if blocked in ("building", "church", "fortification") and dist < 200:
                covered.append(f"{d}({blocked}@{dist}m)")
            elif blocked == "clear" and dist > 400:
                avoid.append(d)

        loc_hint = f" [{nearest['name']} {nearest.get('dist',0)}m]" if nearest else ""
        line = f"→ {pname}{loc_hint}: facing {heading}"
        if blind:
            line += f" | BLIND SIDE: {'/'.join(blind)} ← spawn here for surprise"
        if covered:
            line += f" | MASKED APPROACH: {', '.join(covered)}"
        if avoid:
            line += f" | CLEAR LOS to {'/'.join(avoid)} (player sees far, avoid direct spawn)"
        lines.append(line)

    return "\n".join(lines) if len(lines) > 1 else ""


def build_ai_group_recommendations(state: dict) -> str:
    """Generate time-sensitive tactical recommendations for existing AI groups.
    Surfaces groups that need immediate attention: in contact, weakened, or idle."""
    groups = state.get("ai_units", {}).get("groups", [])
    if not groups:
        return ""

    recs = []
    for g in groups:
        gtype = g.get("type", "?")
        grid = g.get("grid", "?")
        health = g.get("health")
        wounded = g.get("wounded", 0)
        enemies = g.get("enemies_detected")
        behavior = g.get("behavior", "")
        dist = g.get("dist_to_player")

        if health is not None and health < 25:
            recs.append(f"CRITICAL: {gtype}@{grid} HP {health}% ({wounded} wounded) — REINFORCE or DELETE+replace")
        elif health is not None and health < 55 and wounded > 1:
            recs.append(f"WEAKENED: {gtype}@{grid} HP {health}% — consider REINFORCE")

        if enemies and enemies > 0 and behavior in ("patrol", "observe", "search", "move"):
            recs.append(f"IN CONTACT: {gtype}@{grid} detects {enemies} enemies but behavior='{behavior}' — SET_BEHAVIOR to 'hunt' or 'attack'")

        if dist is not None and dist > 2500 and (enemies is None or enemies == 0):
            recs.append(f"IDLE/FAR: {gtype}@{grid} is {dist}m from players, no contact — MOVE closer or DELETE")

    if not recs:
        return ""
    return "RECOMMENDED ACTIONS (address these first):\n" + "\n".join(f"- {r}" for r in recs)


def build_tactical_assessment(state: dict) -> str:
    """Build a structured commander's assessment — what every group is doing,
    what coordinated action to take, and whether spawning is even needed.
    This replaces vague hints with a concrete decision brief the AI must act on."""
    groups = state.get("ai_units", {}).get("groups", [])
    players = state.get("players", [])
    alive = [p for p in players if p.get("status") == "alive"]
    if not groups and not alive:
        return ""

    lines = ["── TACTICAL ASSESSMENT (read before acting) ──"]

    # Categorise every deployed group
    in_contact, pressing, idle_near, idle_far, weakened = [], [], [], [], []
    for g in groups:
        gtype  = g.get("type", "?")
        grid   = g.get("grid", "?")
        beh    = g.get("behavior", "unknown")
        hp     = g.get("health")
        enemies = g.get("enemies_detected") or 0
        dist   = g.get("dist_to_player")
        label  = f"{gtype}@{grid}[{beh}]"

        if hp is not None and hp < 40:
            weakened.append(f"{label} HP:{hp}%")
        if enemies > 0:
            in_contact.append(f"{label} sees {enemies} enemies")
        elif dist is not None:
            if dist < 600:
                pressing.append(f"{label} {dist}m from player")
            elif dist < 1800:
                idle_near.append(f"{label} {dist}m")
            else:
                idle_far.append(f"{label} {dist}m — too far, reposition or delete")

    if weakened:
        lines.append(f"WEAKENED (reinforce or replace): {'; '.join(weakened)}")
    if in_contact:
        lines.append(f"IN CONTACT — switch to attack/hunt: {'; '.join(in_contact)}")
    if pressing:
        lines.append(f"CLOSE PRESSURE (< 600m, apply aggression): {'; '.join(pressing)}")
    if idle_near:
        lines.append(f"NEAR BUT PASSIVE (give role — flank, ambush, suppress): {'; '.join(idle_near)}")
    if idle_far:
        lines.append(f"TOO FAR / WASTED (MOVE or DELETE): {'; '.join(idle_far)}")

    # Coordination hint when multiple groups are nearby
    active_near = in_contact + pressing + idle_near
    if len(active_near) >= 2:
        lines.append(
            "COORDINATE your forces: assign different roles so groups don't all attack from the same side. "
            "Example: one group SET_BEHAVIOR→attack (frontal), another SET_BEHAVIOR→flank, a third SET_BEHAVIOR→suppress."
        )

    # Spawn gate — only suggest spawning when genuinely needed
    active_ai = state.get("ai_units", {}).get("active", 0)
    max_ai    = state.get("ai_units", {}).get("max", 40)
    budget    = max(6, len(alive) * 3)
    headroom  = max(0, budget - active_ai)

    if headroom <= 0:
        lines.append("SPAWN GATE: AT CAPACITY — do NOT spawn. Use SET_BEHAVIOR/MOVE/SUPPRESS on existing forces.")
    elif idle_far and not in_contact and not pressing:
        lines.append("SPAWN GATE: You have idle units far from the fight. Reposition them before spending budget on new spawns.")
    elif active_near and headroom < 3:
        lines.append(f"SPAWN GATE: Forces engaged nearby. Budget nearly full ({active_ai}/{budget}). Prefer SET_BEHAVIOR over new spawns.")
    else:
        lines.append(f"SPAWN GATE: {headroom} group(s) of budget remaining — spawn only if current forces can't achieve the objective.")

    # Decision priority reminder
    lines.append(
        "DECISION ORDER: 1) Fix weakened/in-contact groups first  "
        "2) Give idle nearby groups a coordinated role (flank/suppress/ambush)  "
        "3) Move or delete far-idle groups  "
        "4) ONLY THEN spawn if there is a genuine gap in coverage."
    )

    return "\n".join(lines)


def format_terrain_for_prompt(state: dict) -> str:
    """Build a compact terrain summary for the AI prompt."""
    tmap = parse_terrain_map(state)
    if not tmap:
        return ""

    lines = []
    min_e = tmap.get("min_elevation", 0)
    max_e = tmap.get("max_elevation", 0)
    lines.append(f"TERRAIN: Elevation {min_e:.0f}-{max_e:.0f}m. Legend: W=water,L=low,M=mid,H=high,B=buildings")

    # Describe terrain near each player
    for p in state.get("players", []):
        px = float(p.get("pos", {}).get("x", 0))
        py = float(p.get("pos", {}).get("y", 0))
        grid = pos_to_grid6(px, py)
        desc = describe_terrain_near(grid, tmap)
        if desc:
            lines.append(f"Near {p.get('name','?')}({grid}): {desc}")

    # Also describe terrain near existing AI groups
    for g in state.get("ai_units", {}).get("groups", [])[:3]:
        grid = g.get("grid", "")
        if grid:
            desc = describe_terrain_near(grid, tmap)
            if desc:
                lines.append(f"At AI {g.get('type','?')}({grid}): {desc}")

    return "\n".join(lines)


def build_doctrine_context(state: dict, planner, escalation_level: int) -> str:
    """Build a compact military doctrine context for the AI prompt.
    Selects relevant mission types and tactical concepts based on current situation."""
    if not MILITARY_DOCTRINE:
        return ""

    lines = []

    # If there's an active operation with a mission type, give specific doctrine
    if planner.active_op:
        mission_type = planner.active_op.get("mission_type", "")
        phase = planner.get_current_phase()
        if phase:
            lines.append(f"ACTIVE OPERATION DOCTRINE ({mission_type}):")

            # Look up doctrine for this mission type
            special_ops = MILITARY_DOCTRINE.get("mission_types", {}).get("special_operations", {})
            conventional = MILITARY_DOCTRINE.get("mission_types", {}).get("conventional_operations", {})

            # Try to find matching doctrine
            doctrine_entry = None
            for key, val in {**special_ops, **conventional}.items():
                if key == mission_type or (isinstance(val, dict) and val.get("name", "").lower().find(mission_type.lower()) >= 0):
                    doctrine_entry = val
                    break

            if doctrine_entry:
                # Extract key principles or phases
                if isinstance(doctrine_entry, dict):
                    desc = doctrine_entry.get("description", "")
                    if desc:
                        lines.append(f"  {desc[:200]}")
                    # Check for sub_types with game_master_scenario
                    for st_key, st_val in doctrine_entry.get("sub_types", {}).items():
                        if isinstance(st_val, dict) and st_val.get("game_master_scenario"):
                            gms = st_val["game_master_scenario"]
                            escalation = gms.get("ai_escalation", [])
                            if escalation:
                                lines.append(f"  ESCALATION OPTIONS: {'; '.join(escalation[:3])}")
                            break

        return "\n".join(lines)

    # No active operation - give the AI a random mission type to inspire operation creation
    special_ops = MILITARY_DOCTRINE.get("mission_types", {}).get("special_operations", {})
    conventional = MILITARY_DOCTRINE.get("mission_types", {}).get("conventional_operations", {})

    # Pick based on escalation level
    if escalation_level <= 1:
        # Low intensity - recon, patrol, checkpoint
        candidates = ["special_reconnaissance", "patrol_operations", "checkpoint_operations"]
    elif escalation_level <= 3:
        # Medium - ambush, deliberate attack, direct action
        candidates = ["direct_action", "ambush", "deliberate_attack", "convoy_operations"]
    else:
        # High - defense in depth, urban ops, personnel recovery
        candidates = ["defense_in_depth", "urban_operations", "personnel_recovery"]

    all_missions = {**special_ops, **conventional}
    picked = None
    for c in candidates:
        if c in all_missions:
            picked = all_missions[c]
            picked_key = c
            break
    if not picked:
        picked_key = random.choice(list(all_missions.keys()))
        picked = all_missions[picked_key]

    if isinstance(picked, dict):
        lines.append(f"SUGGESTED MISSION TYPE: {picked.get('name', picked_key.upper())}")
        desc = picked.get("description", "")
        if desc:
            lines.append(f"  {desc[:250]}")

        # Get game master scenario if available
        for st_key, st_val in picked.get("sub_types", {}).items():
            if isinstance(st_val, dict):
                gms = st_val.get("game_master_scenario")
                if gms:
                    setup = gms.get("setup", "")
                    tasks = gms.get("player_tasks", [])
                    escalation = gms.get("ai_escalation", [])
                    if setup:
                        lines.append(f"  SETUP: {setup}")
                    if tasks:
                        lines.append(f"  PLAYER TASKS: {', '.join(tasks[:4])}")
                    if escalation:
                        lines.append(f"  ESCALATION: {'; '.join(escalation[:3])}")
                    break

    # Add OPORD briefing template
    briefing = MILITARY_DOCTRINE.get("scenario_building_guide", {}).get("briefing_generation", {})
    if briefing:
        template = briefing.get("template", [])
        if template:
            lines.append("BRIEFING FORMAT (use when broadcasting objectives):")
            for t in template:
                lines.append(f"  {t}")

    # Add escalation patterns
    esc_data = MILITARY_DOCTRINE.get("scenario_building_guide", {}).get("escalation_patterns", {})
    if esc_data:
        patterns = esc_data.get("patterns", [])
        if patterns:
            picked_pattern = random.choice(patterns)
            lines.append(f"ESCALATION TECHNIQUE: {picked_pattern.get('name', '?')} - {picked_pattern.get('description', '')}")

    return "\n".join(lines)


def _difficulty_guidance(diff: int) -> str:
    """Translate numeric difficulty to concrete spawn guidance for the AI."""
    if diff >= 80:
        return "4-6 units/group; use vehicles + static weapons freely; combined arms every engagement"
    elif diff >= 60:
        return "3-5 units/group; mix infantry with occasional vehicles or static weapons"
    elif diff >= 40:
        return "2-4 units/group; primarily infantry with light support weapons"
    elif diff >= 20:
        return "2-3 units/group; light infantry only; avoid vehicles"
    else:
        return "1-2 units/group; minimal presence; patrol and observe only"


def build_prompt(state: dict, context: str = "") -> str:
    """Build a COMPACT prompt  - fewer tokens = faster inference."""
    global escalation_level
    escalation_level = compute_escalation(state)

    players = state.get("players", [])
    alive = [p for p in players if p.get("status") == "alive"]
    map_name = state.get("map", "Unknown")
    map_size = state.get("map_size", 12800)

    # Player summary (compact)
    pl_lines = []
    for p in players:
        px = float(p.get("pos", {}).get("x", 0))
        py = float(p.get("pos", {}).get("z", p.get("pos", {}).get("y", 0)))
        grid = pos_to_grid6(px, py)
        faction = p.get('faction', 'Unknown')
        pl_lines.append(f"{p.get('name','?')} @ {grid} [{p.get('status','?')}] ({faction})")
    pl = ", ".join(pl_lines) or "none"

    # AI summary (compact)
    ai_groups = state.get("ai_units", {}).get("groups", [])
    ai_lines = []
    for g in ai_groups:  # show all groups — 32K context handles it
        group_state = g.get("group_state", g.get("state", ""))
        state_str = f"|{group_state}" if group_state and group_state.upper() not in ("", "IDLE") else ""
        ai_lines.append(f"{g.get('type','?')}x{g.get('count','?')} @ {g.get('grid','?')} [{g.get('behavior','?')}{state_str}]")
    ai = ", ".join(ai_lines) or "none"

    # Event log from mod (kills, AI wipes)
    event_log_section = ""
    raw_events = state.get("event_log", [])
    if raw_events:
        ev_lines = []
        for ev in raw_events[-15:]:  # last 15 events
            etype = ev.get("type", "?")
            if etype == "PLAYER_KILLED":
                ev_lines.append(f"PLAYER_KILLED: {ev.get('player','?')} at {ev.get('grid','?')} by {ev.get('killer_unit','?')}")
            elif etype == "AI_GROUP_WIPED":
                ev_lines.append(f"AI_WIPED: {ev.get('killer_unit','?')} at {ev.get('grid','?')}")
            elif etype == "PLAYER_RESPAWN":
                ev_lines.append(f"PLAYER_RESPAWN: {ev.get('player','?')} at {ev.get('grid','?')}")
        if ev_lines:
            event_log_section = "RECENT EVENTS (newest last):\n" + "\n".join(ev_lines) + "\n"

    # Vehicle state from mod
    vehicle_section = ""
    vehicles = state.get("vehicles", [])
    if vehicles:
        v_lines = [f"{v.get('type','?')}({v.get('faction','?')}) @ {v.get('grid','?')} [{v.get('occupants',0)} occupants]" for v in vehicles]
        vehicle_section = "VEHICLES IN AREA: " + ", ".join(v_lines) + "\n"

    # Recent in-game player chat (forwarded from mod)
    chat_section = ""
    _sid = state.get("server_id", "server-1")
    if _sid in _servers:
        _igchat = _servers[_sid].ingame_chat_log[-5:]
        if _igchat:
            c_lines = [f"{e['player']}: {e['content']}" for e in _igchat]
            chat_section = "PLAYER RADIO TRAFFIC (last 5 messages):\n" + "\n".join(c_lines) + "\n"

    # Valid grids  - give the AI grids near players AND across the map
    grid_section = "GRID SYSTEM: XXX-YYY format, each grid square = 100m (matches in-game map)\n"

    # Player positions
    player_grid_info = []
    for p in players:
        pg = pos_to_grid6(p["pos"]["x"], p["pos"].get("z", p["pos"].get("y", 0)))
        player_grid_info.append(f"{p['name']} is at grid {pg}")
    if player_grid_info:
        grid_section += f"PLAYER POSITIONS: {'; '.join(player_grid_info)}\n"

    # Terrain scan data  - the AI reads this to understand the battlefield
    terrain_data = state.get("terrain", [])
    if terrain_data:
        for t in terrain_data:
            scan = t.get("scan", {})
            if scan:
                grid_section += f"\nBATTLEFIELD SCAN from {t.get('player','?')} at {t.get('grid','?')} (elev {t.get('elevation',0)}m):\n"
                for direction, ranges in scan.items():
                    range_info = []
                    for r in ranges:
                        range_info.append(f"{r['range']}m={r['terrain']}@{r['grid']}")
                    grid_section += f"  {direction}: {', '.join(range_info)}\n"

    # Include valid spawn grids — bias toward player positions to avoid empty-island spawns
    valid_grids = state.get("valid_spawn_grids", [])
    if valid_grids:
        import random as _vrng

        # Build player grid coord list for proximity filtering
        player_grid_coords = []
        for p in players:
            px = float(p.get("pos", {}).get("x", 0))
            py = float(p.get("pos", {}).get("z", p.get("pos", {}).get("y", 0)))
            pgrid = pos_to_grid6(px, py)
            parts = pgrid.split("-")
            if len(parts) == 2:
                try:
                    player_grid_coords.append((int(parts[0]), int(parts[1])))
                except ValueError:
                    pass

        if player_grid_coords:
            # Partition grids: near (within 20 grid squares = 2km) vs far
            near_grids, far_grids = [], []
            for g in valid_grids:
                gparts = g.split("-")
                if len(gparts) != 2:
                    continue
                try:
                    gx, gz = int(gparts[0]), int(gparts[1])
                    min_dist = min(abs(gx - px) + abs(gz - pz) for px, pz in player_grid_coords)
                    (near_grids if min_dist <= 20 else far_grids).append(g)
                except ValueError:
                    pass
            # Up to 15 near-player grids + 5 distant (for flanking/staging)
            sample = _vrng.sample(near_grids, min(15, len(near_grids))) + \
                     _vrng.sample(far_grids, min(5, len(far_grids)))
            grid_section += f"\nVALID SPAWN GRIDS (near players listed first — use these): {', '.join(sample)}\n"
            grid_section += "(First ~15 grids are within 2km of players. Last ~5 are distant staging areas only.)\n"
        else:
            sample = _vrng.sample(valid_grids, min(20, len(valid_grids)))
            grid_section += f"\nVALID SPAWN GRIDS (confirmed land, use these): {', '.join(sample)}\n"

    active_ai_now = state.get('ai_units', {}).get('active', 0)
    max_ai_now = state.get('ai_units', {}).get('max', 40)
    player_count_now = len(players) if players else state.get('player_count', 0)
    ai_budget = max(6, player_count_now * 3)  # 3 groups per player, minimum 6
    ai_headroom = max(0, ai_budget - active_ai_now)

    grid_section += "\nSPAWN GRID RULES:\n"
    grid_section += "- ONLY use grids from the VALID SPAWN GRIDS list above or from the terrain scan.\n"
    grid_section += "- Do NOT invent grid numbers. Pick from the lists provided.\n"
    grid_section += "- PROXIMITY: Always spawn near player positions or at your objective location. NEVER spawn isolated units far from all players — they waste server bandwidth with zero gameplay value.\n"
    grid_section += f"- BANDWIDTH BUDGET: {active_ai_now}/{max_ai_now} AI active. Target ≤{ai_budget} groups for {player_count_now} player(s). Headroom: {ai_headroom} group(s). If near cap, use MOVE/SET_BEHAVIOR instead of SPAWN.\n"
    grid_section += "- Be tactical: flank, overwatch on hills, ambush from valleys, attack from multiple directions.\n"
    grid_section += "- VARY your approach  - don't always attack from the same direction."

    # Unit catalog from game (auto-discovered)  - ENEMY ONLY
    # Use side-aware catalog if manual entries exist, otherwise legacy enemy-only filter
    catalog = get_catalog(state)
    has_manual = any(e.get("side") for e in (catalog or []))
    catalog_section = format_catalog_for_prompt(state, enemy_only=not has_manual)

    # Mission context (per-server if available)
    op_ctx = ""
    _sid = state.get("server_id", DEFAULT_SERVER)
    _srv_mission = get_server(_sid).mission_briefing if _sid in _servers else mission_briefing
    if _srv_mission:
        op_ctx = f"MISSION: {_srv_mission}\n"
    if context:
        op_ctx += f"ORDER: {context}\n"

    active_ai = state.get('ai_units', {}).get('active', 0)
    max_ai = state.get('ai_units', {}).get('max', 40)

    # Map intelligence  - use DYNAMIC POIs from game state first, fallback to JSON
    map_intel = ""
    map_key = map_name.lower() if map_name else ""
    map_info = MAP_DATA.get(map_key, {})

    # Dynamic POIs from game (works on ANY map  - auto-discovered)
    all_pois = state.get("all_pois", [])
    if all_pois:
        loc_parts = []
        for poi in all_pois[:30]:
            loc_parts.append(f"{poi['name']}({poi.get('type','?')})@{poi.get('grid','?')}")
        map_intel = f"KEY LOCATIONS (use these for objectives  - auto-detected from map): {', '.join(loc_parts)}\n"
    elif map_info:
        # Fallback to static map JSON if game doesn't provide POIs
        loc_parts = []
        for loc in map_info.get("named_locations", []) + map_info.get("military_sites", []):
            grid = loc.get('grid', '?')
            loc_parts.append(f"{loc['name']}({loc.get('type','?')})@{grid}")
        if loc_parts:
            map_intel = f"KEY LOCATIONS (use these for objectives): {', '.join(loc_parts)}\n"

    if map_info:
        # Terrain features  - for tactical positioning
        terrain_features = map_info.get("terrain_features", [])
        if terrain_features:
            tf_parts = [f"{t['name']}({t.get('type','?')})@{t.get('grid','?')}" for t in terrain_features]
            map_intel += f"TERRAIN FEATURES: {', '.join(tf_parts)}\n"

        # Operation suggestions  - give the AI concrete ideas
        op_suggestions = map_info.get("operation_suggestions", [])
        if op_suggestions and not planner.active_op:
            selected = random.sample(op_suggestions, min(2, len(op_suggestions)))
            map_intel += f"OPERATION IDEAS: {'; '.join(selected)}\n"

        # Tactical notes
        notes = map_info.get("tactical_notes", [])
        if notes:
            selected = random.sample(notes, min(2, len(notes)))
            map_intel += f"TACTICS: {'; '.join(selected)}\n"

    # Faction summary with explicit enemy/friendly guidance
    factions = get_factions(state)
    faction_line = ""
    if factions:
        faction_line = "Factions: " + ", ".join(f"{f['key']}({f['role']})" for f in factions) + "\n"
        # Use session_config for faction guidance (editable from dashboard)
        sc = session_config
        # Detect player factions dynamically from game state
        players = state.get("players", [])
        player_factions = set(p.get("faction", "") for p in players if p.get("faction"))
        if player_factions:
            faction_line += (f"PLAYER FACTIONS (friendly — do not spawn as enemies): "
                             f"{', '.join(player_factions)}\n"
                             f"ENEMY FACTIONS: units from any faction NOT in player factions and NOT CIV\n")
        elif sc["enemy_factions"]:
            faction_line += f"ENEMY FACTIONS: {', '.join(sc['enemy_factions'])}\n"
        if sc["use_civilians"]:
            civ_keys = [f["key"] for f in factions if f.get("role") == "CIV"]
            if civ_keys:
                faction_line += f"CIVILIANS ({', '.join(civ_keys)}): Use for ambiance  - roadblocks, fleeing crowds, civilian vehicles. Adds realism.\n"
        if sc.get("ai_instructions"):
            faction_line += "GM INSTRUCTIONS:\n"
            for instr in sc["ai_instructions"]:
                faction_line += f"- {instr}\n"

    # Terrain intelligence from full map scan
    terrain_intel = format_terrain_for_prompt(state)
    terrain_section = ""
    if terrain_intel:
        terrain_section = terrain_intel + "\n"

    # Pick a random example unit from enemy factions in session_config
    enemy_factions = set(f.upper() for f in session_config.get("enemy_factions", []))
    example_unit = "infantry_patrol"
    catalog = get_catalog(state)
    if catalog:
        # Prefer units from configured enemy factions
        opfor_groups = [e["name"] for e in catalog if e.get("category") == "group"
                       and any(ef in e.get("name", "").upper() or ef in e.get("faction", "").upper()
                              for ef in enemy_factions)]
        if not opfor_groups:
            opfor_groups = [e["name"] for e in catalog if e.get("category") == "group"
                           and e.get("faction", "").upper() in ("OPFOR", *enemy_factions)]
        if opfor_groups:
            example_unit = random.choice(opfor_groups)
        else:
            groups = [e["name"] for e in catalog if e.get("category") == "group"]
            if groups:
                example_unit = random.choice(groups)

    # Terrain context per player from game state (8-direction sampling at 300m)
    player_terrain = ""
    for t in state.get("terrain", []):
        pname = t.get("player", "?")
        pgrid = t.get("grid", "?")
        elev = t.get("elevation", 0)
        surr = t.get("surroundings", {})
        dirs = []
        for d in ["N","NE","E","SE","S","SW","W","NW"]:
            v = surr.get(d, "")
            if v:
                dirs.append(f"{d}:{v}")
        if dirs:
            player_terrain += f"Terrain near {pname} @ {pgrid} (elev {elev}m): {', '.join(dirs)}\n"

    # Find nearest named location to each player  - use dynamic POIs first, then static
    player_locations = ""
    location_source = all_pois if all_pois else (
        (map_info.get("named_locations", []) + map_info.get("military_sites", [])) if map_info else []
    )
    if location_source:
        for p in players:
            px = float(p.get("pos", {}).get("x", 0))
            py = float(p.get("pos", {}).get("y", 0))
            pgrid = pos_to_grid6(px, py)
            pparts = pgrid.split("-")
            if len(pparts) != 2:
                continue
            pgx, pgz = int(pparts[0]), int(pparts[1])
            best_name, best_dist = "unknown", 99999
            for loc in location_source:
                lgrid = loc.get("grid", "")
                lparts = lgrid.split("-") if lgrid else []
                if len(lparts) == 2:
                    try:
                        lx, lz = int(lparts[0]), int(lparts[1])
                        dist = ((pgx - lx)**2 + (pgz - lz)**2)**0.5 * 100
                        if dist < best_dist:
                            best_dist = dist
                            best_name = loc.get("name", "unknown")
                    except ValueError:
                        pass
            if best_name != "unknown":
                player_locations += f"{p.get('name','?')} is near {best_name} ({int(best_dist)}m away). "

    # Battlefield awareness  - the AI's "eyes"
    sid = state.get("server_id", DEFAULT_SERVER)
    awareness = get_awareness(sid)
    narrative = awareness.build_narrative(state)
    awareness_section = ""
    if narrative:
        awareness_section = f"\n{narrative}\n"
    reasoning_ctx = awareness.get_reasoning_context()
    if reasoning_ctx:
        awareness_section += f"\n{reasoning_ctx}\n"

    # ── NEW: Rich Situational Awareness from Enforce Script v9.0 ──
    sa_section = ""
    awareness_data = state.get("awareness", [])
    if awareness_data:
        sa_lines = []
        for pa in awareness_data:
            pname = pa.get("player", "?")
            pgrid = pa.get("grid", "?")
            elev = pa.get("elevation", 0)
            heading_dir = pa.get("heading_dir", "?")

            # Location context
            loc_info = ""
            loc = pa.get("nearest_location")
            if loc:
                loc_info = f", near {loc.get('name', '?')} ({loc.get('type', '?')}, {loc.get('dist', '?')}m)"

            line = f"Player {pname} @ {pgrid} (elev {elev}m, facing {heading_dir}{loc_info})"

            # LOS profile  - what can the player see?
            los = pa.get("los", {})
            if los:
                los_parts = []
                for d, info in los.items():
                    dist = info.get("dist", 0)
                    blocked = info.get("blocked", "clear")
                    if blocked == "clear":
                        los_parts.append(f"{d}={dist}m clear")
                    else:
                        los_parts.append(f"{d}={dist}m({blocked})")
                line += f"\n  Sightlines: {', '.join(los_parts)}"

            # Nearby entities  - cover, buildings, vehicles
            nearby = pa.get("nearby", [])
            if nearby:
                near_parts = []
                for ne in nearby[:8]:
                    name_part = f" '{ne['name']}'" if ne.get("name") else ""
                    near_parts.append(f"{ne.get('type','?')}{name_part} {ne.get('dist',0)}m {ne.get('dir','?')}")
                line += f"\n  Nearby: {', '.join(near_parts)}"

            sa_lines.append(line)
        sa_section = "SITUATIONAL AWARENESS:\n" + "\n".join(sa_lines)

    # POIs near players  - these are potential OBJECTIVE LOCATIONS
    pois_section = ""
    pois = state.get("pois", [])
    if pois:
        poi_parts = []
        for poi in pois[:15]:
            poi_parts.append(f"{poi.get('name','?')}({poi.get('type','?')})@{poi.get('grid','?')} {poi.get('dist',0)}m")
        pois_section = f"NEARBY OBJECTIVE CANDIDATES (within 3km of players): {', '.join(poi_parts)}"

    # Enhanced AI group info (perception, health)
    enhanced_ai_lines = []
    for g in ai_groups:  # show all groups — 32K context handles it
        parts = [f"{g.get('type','?')}x{g.get('count','?')} @ {g.get('grid','?')} [{g.get('behavior','?')}]"]
        health = g.get("health")
        if health is not None:
            wounded = g.get("wounded", 0)
            parts.append(f"HP:{health}%")
            if wounded > 0:
                parts.append(f"{wounded} wounded")
        enemies = g.get("enemies_detected")
        if enemies is not None and enemies > 0:
            parts.append(f"DETECTING {enemies} enemies")
            closest = g.get("closest_enemy", {})
            if closest:
                parts.append(f"nearest@{closest.get('dist',0)}m(vis:{closest.get('exposure',0)})")
        dist_plr = g.get("dist_to_player")
        if dist_plr is not None:
            parts.append(f"{dist_plr}m from player")
        enhanced_ai_lines.append(" | ".join(parts))
    enhanced_ai = "\n".join(enhanced_ai_lines) if enhanced_ai_lines else ""

    # Player skill intel
    skill_tracker = get_skill_tracker(sid)
    skill_summary = skill_tracker.get_player_summary()

    # Outcome feedback  - how did our last deployments perform?
    evaluator = get_evaluator(sid)
    outcome_feedback = evaluator.build_feedback()
    tactic_summary = evaluator.build_tactic_summary()

    # Operation context  - are we running a multi-phase mission?
    planner = get_planner(sid)
    op_context = planner.build_context()

    # Commander's Intent  - persistent strategic guidance
    intent_context = get_intent(sid).build_context()

    # Chat directives  - player requests from chat that autonomous should incorporate
    chat_directives = get_chat_directives(sid)

    # Dynamic difficulty  - auto-adjusted
    dyn_diff = get_dynamic_difficulty(sid)
    effective_difficulty = dyn_diff.current_difficulty

    # Escalation-specific operational directives
    esc_directives = [
        "PEACEFUL: Set the scene. Place compositions (checkpoints, camps) at a nearby location. Deploy 1 sentry team to guard it. Broadcast a recon objective to players.",
        "PROBING: Build a small outpost at a key location. Deploy 1-2 sentry teams and 1 patrol on a nearby road. Broadcast intel about enemy activity in the area.",
        "ENGAGED: Create a defended objective. Place fortifications (bunkers, barricades, MG positions) at a named location. Deploy 2-3 groups defending it with 1 patrol screening. Broadcast a clear objective to players.",
        "ASSAULT: Full operation. Fortified objective with static weapons, 3-4 defending groups, vehicle patrols on approaches, and reserves staged 500m behind. Broadcast OPORD with situation, mission, and execution.",
        "OVERWHELM: Major operation. Multiple fortified positions, 5+ groups with armor and static weapons, QRF on standby, layered defenses. Broadcast urgent combat orders."
    ]

    # LOS tactical analysis and group recommendations
    los_tactical = build_los_tactical_analysis(state)
    ai_recs = build_ai_group_recommendations(state)
    tactical_assessment = build_tactical_assessment(state)

    # Combat tempo summary
    casualties = int(state.get("casualties_last_10min", 0))
    engagement = float(state.get("engagement_intensity", 0))
    combat_tempo = ""
    if casualties > 0 or engagement > 0.1:
        combat_tempo = f"COMBAT TEMPO: {casualties} casualties (last 10min), engagement {int(engagement*100)}% — level: {ESCALATION_NAMES[escalation_level]}"

    # RCON server telemetry (performance + authoritative player list)
    rcon_section = ""
    if _rcon.connected and _rcon.authenticated:
        parts = []
        perf = _rcon_server_perf
        if perf.get("fps") is not None:
            fps_warn = " ⚠ LOW FPS — reduce spawns" if perf["fps"] < 20 else ""
            fps_str = f"{perf['fps']:.0f} FPS{fps_warn}"
            if perf.get("mem_mb"):
                fps_str += f", {perf['mem_mb']}MB RAM"
            if perf.get("entities"):
                fps_str += f", {perf['entities']} entities"
            parts.append(f"SERVER PERF: {fps_str}")
        if _rcon_player_list:
            names = ", ".join(p["name"] for p in _rcon_player_list[:10])
            parts.append(f"RCON PLAYERS ({len(_rcon_player_list)}): {names}")
        rcon_section = "\n".join(parts)

    # Keep prompt compact  - large prompts cause empty responses with tool calling
    sections = [
        f"Map: {map_name} ({map_size}m). Difficulty: {effective_difficulty}/100 → {_difficulty_guidance(effective_difficulty)}. Escalation: {ESCALATION_NAMES[escalation_level]}.",
        f"DIRECTIVE: {esc_directives[escalation_level]}",
        f"Players: {pl}",
    ]
    if rcon_section:
        sections.append(rcon_section)
    if combat_tempo:
        sections.append(combat_tempo)
    if player_locations:
        sections.append(player_locations.strip())
    if skill_summary:
        sections.append(skill_summary)
    # Enhanced AI info with perception data (replaces old compact ai line)
    if enhanced_ai:
        sections.append(f"AI Forces ({active_ai}/{max_ai}):\n{enhanced_ai}")
    else:
        sections.append(f"AI Forces: {active_ai}/{max_ai}. {ai}")
    if event_log_section:
        sections.append(event_log_section.strip())
    if vehicle_section:
        sections.append(vehicle_section.strip())
    if chat_section:
        sections.append(chat_section.strip())
    # Tactical assessment — full commander's picture with decision gate (high priority)
    if tactical_assessment:
        sections.append(tactical_assessment)
    elif ai_recs:
        sections.append(ai_recs)
    if faction_line:
        sections.append(faction_line.strip())
    # Rich situational awareness from enforce script
    if sa_section:
        sections.append(sa_section)
    # Pre-computed tactical interpretation of LOS data
    if los_tactical:
        sections.append(los_tactical)
    if pois_section:
        sections.append(pois_section)
    if awareness_section:
        sections.append(awareness_section.strip())
    if outcome_feedback:
        sections.append(outcome_feedback)
    if tactic_summary:
        sections.append(tactic_summary)
    if op_context:
        sections.append(op_context)
    if intent_context:
        sections.append(intent_context)
    if chat_directives:
        sections.append(chat_directives)
    if op_ctx:
        sections.append(op_ctx.strip())
    sections.append(grid_section)
    sections.append(catalog_section)

    # Military doctrine context  - mission types, OPORD format, escalation
    doctrine_ctx = build_doctrine_context(state, planner, escalation_level)
    if doctrine_ctx:
        sections.append(doctrine_ctx)

    # Scenario templates — randomly pick 2 each query to keep context tight
    _ALL_SCENARIOS = [
        "DIRECT ACTION RAID: Fortified compound at objective. E_CamoNet+E_Bunker+E_Barricade, 2-3 defending squads, MG overwatch, vehicle QRF 500m away. Mission: 'Assault and clear compound at [location].'",
        "SPECIAL RECON: Scattered patrols, hidden sentry teams, 1 camouflaged static weapon, light vehicle patrol. Mission: 'Recon enemy positions near [location]. Identify strength and disposition.'",
        "HVT NEUTRALISATION: Heavy guard at location, inner/outer security rings, QRF with vehicles 500m+. Mission: 'Locate and neutralize HVT at [location]. Expect heavy resistance.'",
        "CHECKPOINT ASSAULT: E_Checkpoint+E_Barricade, sentry team, MG overwatch, road patrol, reserve in nearby building. Mission: 'Clear enemy checkpoint at [location] to open the route.'",
        "AREA CLEARANCE: Sentry teams at intersections, MG covering approaches, patrol routes between positions. Mission: 'Clear all enemy forces from [location]. Secure the area.'",
        "AMBUSH: Concealed infantry in treeline/buildings, MG overwatch on kill zone, blocking force to cut retreat. Mission: 'INTEL: Enemy ambush activity reported near [location]. Proceed with caution.'",
        "DEFENSE IN DEPTH: Layer 1 (500m): OP posts. Layer 2 (300m): MG fighting positions. Layer 3 (100m): bunkers. QRF reserve behind. Mission: 'Break through enemy defenses at [location].'",
        "PATROL BASE DESTRUCTION: E_CamoNet_AmmoCache+E_CanvasCover+E_Bed, defending squad, perimeter patrols, supply vehicle. Mission: 'Locate and destroy enemy patrol base near [location].'",
        "HOSTAGE RESCUE: Guards at entries, interior sentry, roving patrol, QRF nearby, MG covering approach. Mission: 'Rescue friendly personnel held at [location]. Minimize collateral.'",
        "CONVOY AMBUSH: Ambush forces along road, IED-style barricade compositions, flanking force staged to hit mid-convoy. Mission: 'Enemy reported along convoy route near [location]. Secure the route.'",
    ]
    if not planner.active_op:
        # Session-stable selection — re-rolls hourly at most, not every heartbeat
        _session_seed = int(session_start / 3600)
        _rng = random.Random(_session_seed)
        picked = _rng.sample(_ALL_SCENARIOS, min(2, len(_ALL_SCENARIOS)))
        sections.append("SCENARIO IDEAS (pick one, adapt to current map):\n" + "\n".join(f"- {s}" for s in picked))

    prompt = "\n".join(s for s in sections if s)

    # Operation-aware tactical directive  - skip random directives if an operation or intent is active
    intent_obj = get_intent(sid)
    if planner.active_op:
        phase = planner.get_current_phase()
        if phase:
            prompt += f"\n\nACTIVE OPERATION: Execute {phase['name']}  - {phase.get('objective', 'proceed')}. Use tools to carry out this phase."
    elif intent_obj.intent:
        prompt += f"\n\nFOCUS: Execute your Commander's Intent. Adapt tactics based on TACTIC EFFECTIVENESS data."
    else:
        # No active operation or intent  - prompt the AI to CREATE one
        directives = [
            "CREATE AN OPERATION: Pick a named location from KEY LOCATIONS. Place compositions (checkpoint, bunkers) there. Deploy defenders. Broadcast an objective to players. Use plan_operation to track phases.",
            "BUILD A SCENARIO: Set up an enemy checkpoint on a road near players. Place barricades/compositions first, then sentry teams, then a patrol. Broadcast intel about enemy activity ahead.",
            "DESIGN AN ENCOUNTER: Find a town or military site from KEY LOCATIONS. Fortify it with compositions. Station defenders. Set up patrols on approaches. Give players a clear mission via broadcast.",
            "CRAFT A MISSION: Establish an enemy forward operating base at a key location. Place camp compositions, static weapons for overwatch, infantry for defense, and vehicle patrols. Brief players on the objective.",
            "SET UP AN AMBUSH SCENARIO: Place an ambush along a road or chokepoint between players and a named location. Use concealed infantry with MG overwatch. Broadcast a warning about enemy ambush activity in the area.",
            "CREATE A PATROL ENCOUNTER: Deploy multiple enemy patrols between players and a key location. Each patrol should have a different route and behavior. Include a vehicle patrol on main roads.",
        ]
        prompt += f"\n\nNO ACTIVE OPERATION  - {random.choice(directives)}"
    prompt += "\nUse EXACT prefab names from AVAILABLE UNITS above."
    return prompt


# ─── Tool Definitions for nemotron-3-super ────────────────────────────────
# Native tool calling  - model returns structured tool_calls instead of raw JSON
ZEUS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "spawn_units",
            "description": "Spawn units or place objects at a grid location. Use for: (1) ENVIRONMENT  - place compositions like checkpoints, bunkers, barricades, camps at objective areas BEFORE combat units, (2) ENEMY FORCES  - infantry, vehicles, static weapons defending objectives or patrolling, (3) FRIENDLY FORCES  - sparingly as QRF or support. Always place enemies AT OBJECTIVES (300-800m from players), never directly ON players.",
            "parameters": {
                "type": "object",
                "required": ["units", "count", "grid", "behavior", "faction", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "EXACT prefab name from AVAILABLE UNITS. Pick from any category and any side (enemy, friendly, neutral)."},
                    "count": {"type": "integer", "description": "How many to spawn. Infantry: 2-6. Vehicles: 1-3. Static weapons: 1-2. Compositions: 1"},
                    "grid": {"type": "string", "description": "Grid XXX-YYY (each square = 100m, matches in-game map)"},
                    "behavior": {"type": "string", "description": "Unit behavior: patrol (cycle route), defend (hold position), ambush (concealed wait), hunt (pursue enemies), attack (direct assault), flank (maneuver around), retreat (fall back), search (area clearance), observe (static OP), overwatch (fire support), scout (recon concealed), suppress (pin down with fire), cycle (loop patrol)"},
                    "faction": {"type": "string", "description": "Faction: OPFOR (enemy), BLUFOR (friendly to players), INDFOR (independent/hostile)"},
                    "reasoning": {"type": "string", "description": "Brief tactical reasoning for this deployment"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_units",
            "description": "Move an existing AI group to a new grid position. Use the EXACT unit type name shown in ACTIVE AI FORCES. If multiple groups share the same type, all matching groups will be moved.",
            "parameters": {
                "type": "object",
                "required": ["units", "grid", "behavior", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Unit type or group to move"},
                    "grid": {"type": "string", "description": "Destination grid XXX-YYY"},
                    "behavior": {"type": "string", "description": "Behavior after move"},
                    "reasoning": {"type": "string", "description": "Tactical reasoning"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_units",
            "description": "Remove AI units or groups from the map. IMPORTANT: without a grid, ALL units of that type are deleted across the entire map. Provide a grid to limit deletion to that area. Use units='all' to trigger DELETE_ALL (clears entire battlefield).",
            "parameters": {
                "type": "object",
                "required": ["units", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Unit type/group to delete, or 'all' for DELETE_ALL"},
                    "grid": {"type": "string", "description": "Grid of units to delete (optional)"},
                    "reasoning": {"type": "string", "description": "Why removing these units"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reinforce_group",
            "description": "Add reinforcement units near an existing group",
            "parameters": {
                "type": "object",
                "required": ["units", "count", "grid", "behavior", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Reinforcement unit prefab name"},
                    "count": {"type": "integer", "description": "Number of reinforcements"},
                    "grid": {"type": "string", "description": "Grid near existing group"},
                    "behavior": {"type": "string", "description": "Behavior for reinforcements when they arrive: patrol, defend, hunt, attack, ambush"},
                    "reasoning": {"type": "string", "description": "Tactical reasoning"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_behavior",
            "description": "Change behavior of an existing AI group",
            "parameters": {
                "type": "object",
                "required": ["units", "behavior", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Unit type/group to change"},
                    "behavior": {"type": "string", "description": "New behavior: patrol, defend, ambush, hunt, attack, flank, retreat"},
                    "grid": {"type": "string", "description": "Grid of group (optional)"},
                    "reasoning": {"type": "string", "description": "Tactical reasoning"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "broadcast_message",
            "description": "Send a message to all players via in-game chat. CRITICAL: Use this to give players their MISSION OBJECTIVE when starting operations. Also use for intel updates, warnings, and situation reports. Good GMs always communicate with their players.",
            "parameters": {
                "type": "object",
                "required": ["message"],
                "properties": {
                    "message": {"type": "string", "description": "Message to broadcast. For objectives use format: 'OBJECTIVE: [task] at [location]. [context]'. For intel: 'INTEL: [information]'. Keep under 200 chars."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plan_operation",
            "description": "Plan a multi-phase military operation (OPORD style). Use this to create structured scenarios that span multiple heartbeats. Phase 1 should always set the environment (compositions, fortifications). Phase 2 deploys defenders. Phase 3+ handles player contact and escalation. ALWAYS broadcast the mission to players when starting an operation.",
            "parameters": {
                "type": "object",
                "required": ["name", "phases", "reasoning"],
                "properties": {
                    "name": {"type": "string", "description": "Operation name (e.g., 'Operation Iron Fist', 'Checkpoint Viper')"},
                    "objective_grid": {"type": "string", "description": "Grid of the main objective area (from KEY LOCATIONS or VALID GRIDS)"},
                    "mission_type": {"type": "string", "description": "Type: assault, defense, ambush, patrol, raid, reconnaissance, checkpoint, hostage_rescue, convoy_ambush, area_denial"},
                    "phases": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "Phase name (e.g., 'Set Environment', 'Deploy Defenders', 'Player Contact', 'Reinforcement')"},
                                "objective": {"type": "string", "description": "What to achieve  - be specific about what to spawn/place and where"},
                                "duration_minutes": {"type": "integer", "description": "How long this phase lasts (2-10 minutes)"},
                            },
                        },
                        "description": "2-5 phases. Phase 1 = environment setup, Phase 2 = force deployment, Phase 3+ = contact/escalation",
                    },
                    "reasoning": {"type": "string", "description": "OPORD-style reasoning: Situation, Mission, Execution concept"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "assess_situation",
            "description": "Request a situation assessment before deciding on actions. Use when the battlefield state is complex and you need to think before acting. Returns current outcome feedback and intel.",
            "parameters": {
                "type": "object",
                "required": ["focus"],
                "properties": {
                    "focus": {"type": "string", "description": "What to assess: 'deployments' (check how current forces are doing), 'threats' (analyze player threat levels), 'terrain' (evaluate tactical positions), 'all' (comprehensive assessment of all three)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_intent",
            "description": "Update your strategic Commander's Intent. This persists across heartbeats and guides your future decisions. Use to set high-level goals like 'contain players in eastern sector' or 'escalate pressure with armored push from north'.",
            "parameters": {
                "type": "object",
                "required": ["intent", "posture"],
                "properties": {
                    "intent": {"type": "string", "description": "Your high-level strategic intent (what you're trying to achieve and why)"},
                    "posture": {"type": "string", "description": "Force posture: 'aggressive' (push forward, attack), 'defensive' (hold positions, fortify), 'balanced' (mix of offense/defense), 'recon' (gather intel, probe)"},
                    "priority_targets": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Priority grid areas or player names to focus on (optional, max 5)"
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "artillery_strike",
            "description": "Assign an Artillery Support waypoint to a deployed mortar or artillery group, directing them to fire on a target grid. Uses the engine's native Artillery Support waypoint. The group must already be deployed on the map.",
            "parameters": {
                "type": "object",
                "required": ["units", "grid", "rounds", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Mortar or artillery group type to assign the fire mission to"},
                    "grid": {"type": "string", "description": "Target grid XXX-YYY to fire on"},
                    "rounds": {"type": "integer", "description": "Number of rounds (1-10)"},
                    "shell_type": {"type": "string", "description": "Shell: 'he' (high explosive, default), 'smoke' (concealment), 'flare' (illumination)"},
                    "reasoning": {"type": "string", "description": "Tactical reason for this fire mission"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "smoke_cover",
            "description": "Direct an AI group to deploy smoke grenades at a position (uses engine's Deploy Smoke waypoint). Use to cover an advance, protect a retreat, or blind a defender before assault.",
            "parameters": {
                "type": "object",
                "required": ["units", "grid", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Unit group to deploy smoke"},
                    "grid": {"type": "string", "description": "Grid XXX-YYY where smoke should be deployed"},
                    "reasoning": {"type": "string", "description": "Why deploying smoke here"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suppress_position",
            "description": "Direct an AI group to suppress a position with sustained fire, pinning players in cover (uses engine's Suppress waypoint). Use before an assault to fix players while flanking units maneuver.",
            "parameters": {
                "type": "object",
                "required": ["units", "grid", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Unit group to perform suppression"},
                    "grid": {"type": "string", "description": "Target grid XXX-YYY to suppress"},
                    "duration_seconds": {"type": "integer", "description": "How long to suppress in seconds (30-180, default 60)"},
                    "reasoning": {"type": "string", "description": "Tactical purpose of this suppression"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_formation",
            "description": "Change an AI group's tactical formation. Wedge for assaults (360 coverage), Line for maximum firepower forward, Column for road movement, StaggeredColumn for open terrain patrol.",
            "parameters": {
                "type": "object",
                "required": ["units", "formation", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Unit group to change formation"},
                    "formation": {"type": "string", "description": "Formation: 'wedge' (assault, 360 coverage), 'line' (max firepower forward), 'column' (road movement), 'staggered_column' (patrol)"},
                    "reasoning": {"type": "string", "description": "Tactical reason for this formation"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_skill",
            "description": "Change the skill level of an AI group (0.0=recruit to 1.0=elite). Elite guards (0.8+) have better aim, faster reactions, smarter cover use. Use to make key objectives harder and routine patrols easier.",
            "parameters": {
                "type": "object",
                "required": ["units", "skill", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Unit group to adjust skill level"},
                    "skill": {"type": "number", "description": "Skill 0.0 (recruit) to 1.0 (elite). Patrol=0.3, defender=0.5, elite guard=0.8"},
                    "reasoning": {"type": "string", "description": "Why adjusting this group's skill"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "scout_mission",
            "description": "Assign a Scout waypoint to a recon group, sending them to observe an area while maintaining concealment. Good for passive intelligence gathering before committing forces.",
            "parameters": {
                "type": "object",
                "required": ["units", "grid", "reasoning"],
                "properties": {
                    "units": {"type": "string", "description": "Scout or recon unit group"},
                    "grid": {"type": "string", "description": "Target grid XXX-YYY to observe"},
                    "reasoning": {"type": "string", "description": "What intelligence this scout mission serves"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_weather",
            "description": "Change the in-game weather conditions. Use fog/rain to reduce player visibility and change engagement distances. Use storm for dramatic scenarios. Use clear for long-range engagements. Powerful for setting atmosphere and forcing tactical adaptations.",
            "parameters": {
                "type": "object",
                "required": ["weather", "reasoning"],
                "properties": {
                    "weather": {"type": "string", "description": "Weather type: 'clear' (bright, long visibility), 'overcast' (grey, medium visibility), 'fog' (heavy fog, <100m visibility), 'rain' (rain + reduced visibility ~300m), 'storm' (heavy rain + wind + very low visibility), 'night_clear' (night with stars), 'night_fog' (night + fog, minimal visibility)"},
                    "intensity": {"type": "number", "description": "Intensity 0.0-1.0 (optional, default 0.5)"},
                    "reasoning": {"type": "string", "description": "Tactical reasoning for the weather change"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_time_of_day",
            "description": "Change the in-game time of day. Dawn/dusk create dramatic lighting and partial concealment. Night significantly changes engagement dynamics (NVG required, shorter detection ranges). Use to match the tactical scenario (night raid = 2200, dawn assault = 0530, afternoon patrol = 1400).",
            "parameters": {
                "type": "object",
                "required": ["hour", "reasoning"],
                "properties": {
                    "hour": {"type": "number", "description": "Hour 0-23 (e.g. 6=dawn, 12=noon, 18=dusk, 22=night)"},
                    "minute": {"type": "integer", "description": "Minute 0-59 (optional, default 0)"},
                    "reasoning": {"type": "string", "description": "Why changing time of day for this scenario"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fire_support",
            "description": "Call indirect fire support (mortars or artillery) on a target grid. Use to suppress entrenched players before an assault, deny an area, or punish static positions. Requires mortar/artillery units to already be deployed near the target.",
            "parameters": {
                "type": "object",
                "required": ["grid", "rounds", "reasoning"],
                "properties": {
                    "grid": {"type": "string", "description": "Target grid XXX-YYY to strike with indirect fire"},
                    "rounds": {"type": "integer", "description": "Number of rounds to fire (1-5, default 3)"},
                    "weapon_type": {"type": "string", "description": "Weapon: 'mortar' (short range, precise), 'artillery' (long range, area effect), 'smoke' (concealment only). Default: mortar"},
                    "reasoning": {"type": "string", "description": "Tactical reason for calling fire support here"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mark_objective",
            "description": "Place a map marker visible to all players at a grid location. Use to mark objectives, danger zones, friendly positions, rally points, or enemy contact reports. Helps players understand the operational picture.",
            "parameters": {
                "type": "object",
                "required": ["grid", "label", "marker_type", "reasoning"],
                "properties": {
                    "grid": {"type": "string", "description": "Grid XXX-YYY for the marker"},
                    "label": {"type": "string", "description": "Short label (max 30 chars): e.g. 'OBJ ALPHA', 'DANGER AREA', 'RALLY POINT', 'ENEMY CONTACT'"},
                    "marker_type": {"type": "string", "description": "Type: 'objective' (flag), 'danger' (warning), 'intel' (info), 'friendly' (green), 'enemy' (red), 'rally' (waypoint)"},
                    "color": {"type": "string", "description": "Color: 'red', 'blue', 'green', 'yellow', 'white' (optional)"},
                    "reasoning": {"type": "string", "description": "Why placing this marker"},
                },
            },
        },
    },
]

# Map tool calls to command types
TOOL_TO_CMD = {
    "spawn_units": "SPAWN",
    "move_units": "MOVE",
    "delete_units": "DELETE",
    "reinforce_group": "REINFORCE",
    "set_behavior": "SET_BEHAVIOR",
    "broadcast_message": "BROADCAST",
    "plan_operation": "PLAN_OP",
    "assess_situation": "ASSESS",
    "update_intent": "INTENT",
    "set_weather": "SET_WEATHER",
    "set_time_of_day": "SET_TIME",
    "fire_support": "FIRE_SUPPORT",
    "mark_objective": "MARKER",
    "artillery_strike": "ARTILLERY",
    "smoke_cover": "SMOKE",
    "suppress_position": "SUPPRESS",
    "set_formation": "SET_FORMATION",
    "set_skill": "SET_SKILL",
    "scout_mission": "SCOUT",
}


# ─── AI Query (Multi-Turn Agent Loop) ────────────────────────────────────
# The AI is now a real agent: it calls tools, gets results back, and can
# chain actions across multiple turns. This enables:
# - Assess situation -> then spawn based on assessment
# - Plan operation -> execute phase 1 -> evaluate -> execute phase 2
# - Spawn scouts -> check result -> reinforce or reposition
MAX_AGENT_TURNS = 5  # Max tool-call -> result -> next-call cycles

async def query_zeus(state: dict, context: str = "", is_chat: bool = False) -> list:
    global last_ai_response_time, last_ai_latency_ms, total_spawns, total_heartbeats, ai_thinking

    # Skip if lock is held and this is autonomous (don't pile up)
    if not is_chat and _query_lock.locked():
        log.info("Skipping autonomous query  - another query in flight")
        return []

    async with _query_lock:
        total_heartbeats += 1
        ai_thinking = True
        await broadcast("ai_thinking", {"thinking": True})

        sid = state.get("server_id", DEFAULT_SERVER)
        srv = get_server(sid)
        sm = srv.state_machine

        # ── Use focused executor prompt when inside an active operation phase ──
        if not is_chat and sm.state == "ACTIVE" and sm.active_operation:
            phase = sm.active_operation.current_phase()
            if phase:
                messages = build_executor_messages(
                    state, phase,
                    sm.active_operation.commander_intent,
                    sm.active_operation.roe,
                )
                log.info(f"[{sid}] Using Executor prompt for phase: {phase.name}")
                t0_exec = time.time()
                try:
                    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                        exec_body = {
                            "model": MODEL_NAME,
                            "messages": messages,
                            "temperature": 0.4,
                            "max_tokens": 1024,
                            "top_p": 0.9,
                        }
                        if BACKEND_MODE == "vllm":
                            exec_body["chat_template_kwargs"] = {"enable_thinking": False, "clear_thinking": True}
                        resp = await client.post(VLLM_URL, json=exec_body)
                        if resp.status_code == 200:
                            result = resp.json()
                            last_ai_latency_ms = (time.time() - t0_exec) * 1000
                            last_ai_response_time = time.time()
                            content = strip_think_tags(result.get("choices", [{}])[0].get("message", {}).get("content", "") or "")
                            commands = extract_json_array(content)
                            valid_types = {"SPAWN", "MOVE", "EVENT", "DELETE_ALL", "DELETE", "REINFORCE", "SET_BEHAVIOR", "BROADCAST", "INTENT", "PLAN_OP",
                                           "SET_WEATHER", "SET_TIME", "FIRE_SUPPORT", "MARKER", "ARTILLERY", "SMOKE", "SET_FORMATION", "SET_SKILL", "SCOUT", "SUPPRESS"}
                            all_valid_cmds = []
                            for c in (commands or []):
                                ctype = (c.get("type") or "").upper()
                                c["type"] = ctype
                                if ctype not in valid_types:
                                    continue
                                if ctype == "BROADCAST":
                                    c.setdefault("message", "Zeus: operation in progress.")
                                    c.setdefault("units", ""); c.setdefault("count", 0)
                                    c.setdefault("grid", "000-000"); c.setdefault("behavior", "")
                                    c.setdefault("faction", ""); c.setdefault("reasoning", "Phase directive")
                                    all_valid_cmds.append(c)
                                    continue
                                c.setdefault("units", "infantry_patrol")
                                c.setdefault("count", 4)
                                c.setdefault("grid", "050-050")
                                c["grid"] = validate_grid(c["grid"], state)
                                c.setdefault("behavior", "patrol")
                                c.setdefault("faction", "OPFOR")
                                c.setdefault("reasoning", "Phase execution")
                                c["units"] = validate_unit_type(c.get("units", ""), state, enforce_enemy=True, requested_faction=c.get("faction", ""))
                                if ctype == "SPAWN":
                                    total_spawns += c.get("count", 0)
                                all_valid_cmds.append(c)
                            if all_valid_cmds:
                                log_decision(state, all_valid_cmds)
                                await broadcast("ai_decision", {
                                    "commands": all_valid_cmds, "latency_ms": last_ai_latency_ms,
                                    "complexity": "executor", "reasoning": content[:300],
                                    "agent_turns": 1,
                                    "operation": sm.active_operation.name if sm.active_operation else None,
                                })
                                log.info(f"[{sid}] Executor issued {len(all_valid_cmds)} commands in {last_ai_latency_ms:.0f}ms")
                            ai_thinking = False
                            await broadcast("ai_thinking", {"thinking": False})
                            return all_valid_cmds
                        else:
                            log.warning(f"[{sid}] Executor HTTP {resp.status_code} — falling through to standard query")
                            ai_thinking = False
                            await broadcast("ai_thinking", {"thinking": False})
                except Exception as e:
                    log.error(f"Executor prompt failed: {e} — falling through to standard query")

        # ── Adaptive reasoning  - adjust compute budget based on battlefield complexity ──
        complexity = classify_request_complexity(context, state, is_chat)
        model_opts = get_model_options(complexity)
        log.info(f"Request complexity: {complexity} -> max_tokens={model_opts['max_tokens']}, temp={model_opts['temperature']}")

        # ── Check if we should advance an active operation ──
        planner = get_planner(sid)
        if planner.active_op and planner.should_advance():
            phase = planner.get_current_phase()
            log.info(f"Auto-advancing operation phase: {phase['name'] if phase else '?'}")
            planner.advance_phase("time_elapsed")

        system_prompt = """You are Zeus, a professional AI Game Master for Arma Reforger. You CREATE OPERATIONS  - complete military scenarios with objectives, environment, atmosphere, and intelligent enemy forces. You are NOT a spawn bot. You think like a human GM who crafts immersive experiences.

## YOUR JOB AS GAME MASTER
A good GM does NOT randomly drop enemies on players. A good GM:
1. SETS THE SCENE  - places compositions (checkpoints, bunkers, camps, barricades), parked vehicles, and environmental props BEFORE combat starts
2. CREATES AN OBJECTIVE  - broadcasts a clear mission to players (secure the village, destroy the convoy, clear the compound)
3. DEPLOYS ENEMY FORCES AROUND THE OBJECTIVE  - not around players. Enemies should be defending positions, manning checkpoints, patrolling routes, or staging for their own operations
4. PHASES THE ENCOUNTER  - initial contact is light (patrols, sentries), then escalates as players push forward (reinforcements, QRF, counterattack)
5. TELLS A STORY  - broadcasts intel updates, warnings, and situation reports that make players feel like they're in a real operation

## DECISION PROCESS — follow this every single heartbeat
Before issuing any command, read the TACTICAL ASSESSMENT block in the user message and ask yourself:

**Step 1 — Fix what's broken**
- Any group IN CONTACT with passive behavior (patrol/observe)? → SET_BEHAVIOR to attack or hunt immediately.
- Any group WEAKENED below 40% HP? → REINFORCE or DELETE and replace.

**Step 2 — Coordinate existing forces**
- Groups within 600m of players are your active combat power. Give each a distinct role:
  - One group: SET_BEHAVIOR → attack (direct pressure)
  - One group: SET_BEHAVIOR → flank (perpendicular approach from blind side)
  - One group: SET_BEHAVIOR → suppress (pin players in place)
  - Reserve group: hold at 500m+, ready to SET_BEHAVIOR → hunt if players break through
- Use MOVE to reposition groups that are in the wrong place, not to give them "orders"— SET_BEHAVIOR is what actually drives their tactics.

**Step 3 — Clear deadweight**
- Groups more than 2km from players with no contact? MOVE them to a relevant position or DELETE them. Dead weight wastes server budget.

**Step 4 — Spawn only to fill genuine gaps**
- If you have coordinated pressure from multiple directions AND an active objective, you do NOT need more units.
- Only spawn when a specific role is missing: e.g., no overwatch, no vehicle threat, no flanking element.
- SPAWN is the last resort, not the first response.

## OPERATION DESIGN (OPORD FORMAT)
When you plan an operation, think like a military planner:
- SITUATION: What is the enemy doing? Where are they set up? What is the tactical environment?
- MISSION: What must players accomplish? Be specific  - a grid reference, a named location, a clear task
- EXECUTION: How will you phase the encounter? Recon -> Contact -> Assault -> Exploitation
- ENVIRONMENT: What does the area LOOK like? Place compositions: checkpoints (E_Checkpoint_S/M/L), bunkers (E_Bunker), barricades (E_Barricade), camo nets (E_CamoNet), field hospitals (E_FieldHospital), and supply caches

## FORCE DEPLOYMENT DOCTRINE
- NEVER spawn enemies directly ON players. Enemies should be 300-800m away at objective locations
- Place SENTRIES first (2-4 man teams) at the perimeter of objective areas
- Place DEFENSIVE POSITIONS second (static weapons, bunkers) at key terrain
- Place PATROL routes third  - moving groups between positions
- Hold RESERVES back (500m+ from objective)  - only commit when players make contact
- Use compositions to build the objective area BEFORE placing troops in it

## COMBINED ARMS
- Infantry squads defend positions and man checkpoints
- Static weapons (MGs, mortars) provide overwatch from elevated or fortified positions
- Vehicles patrol roads and serve as QRF (Quick Reaction Force)
- Compositions create the physical environment  - bunkers, barricades, camps

## ESCALATION & REINFORCEMENT
- When players engage, DO NOT immediately spawn more enemies on them
- Instead: move EXISTING reserves forward, change behaviors to "attack" or "hunt"
- Reinforcements should arrive from BEHIND enemy lines (further from players), as if called in
- Broadcast warnings: "Enemy QRF spotted moving from the north" before reinforcements arrive

## Agent Workflow
You have up to 5 tool calls per turn. Typical operation setup:
1. plan_operation -> defines phases and broadcasts OPORD to players
2. spawn compositions at objective (checkpoints, bunkers) -> spawn sentries -> spawn patrols
3. On subsequent heartbeats: monitor player approach, adjust behaviors, commit reserves
4. update_intent to track what you're trying to achieve across heartbeats

## Radio Communications (use these formats when broadcasting)
- OBJECTIVE: "[Unit] [task] at [location] in order to [purpose]"
- INTEL: "Intel reports [enemy activity] at [location]. [Instructions]."
- CONTACT: "CONTACT! [Direction], [distance], [enemy type]. [Response]."
- SITREP: "[Location]. [Status]. [Enemy situation]. [Next actions]."
- WARNING: "Be advised, [threat/change]. All units [instructions]."
- PHASE: "Phase [N] is go. [Element] [task]. [Element] [task]."

## VEHICLE OPERATIONS
When using vehicles tactically, sequence your tool calls across heartbeats:
- Heartbeat 1: SPAWN vehicle at staging grid (500m+ from players, same grid as infantry). SPAWN infantry at same grid with behavior "defend" — they will automatically board nearby vehicles.
- Heartbeat 2: MOVE vehicle to assault grid with behavior "attack". Infantry in the vehicle will engage as they arrive.
- Heartbeat 3: SPAWN dismount infantry at the objective grid to reinforce the attack.
For vehicle QRF: SPAWN vehicle 600m+ from contact, MOVE toward contact, BROADCAST "QRF en route from [direction]".
Vehicles on "patrol" behavior will drive road routes — use for convoy simulation.

## MOD ARSENAL AWARENESS
The AVAILABLE UNITS list marks non-base-game items with [MOD]. These are mod-added weapons, vehicles, or compositions (custom bombs, special vehicles, unique fortifications).
Rules for [MOD] items:
- Read the name carefully — it tells you what the item does (e.g. NuclearBombCarrier, ArtilleryStrike_Composition)
- NEVER use [MOD] items in Phase 1 of an operation — build dramatic tension first
- Reserve [MOD] items for escalation peaks: the final assault wave, a desperate counterattack, or a special objective
- If a [MOD] item is a composition (bomb, fortification, special structure), SPAWN it as environment first before placing troops around it
- Treat [MOD] vehicles as heavy/elite assets — 1 is worth 3 standard vehicles tactically

## Performance & Bandwidth
- Keep total AI proportional to player count: aim for ≤ 3 groups per player (e.g. 2 players = 6 groups max)
- The prompt tells you current AI count and your budget. RESPECT IT. At 80%+ capacity, prefer MOVE or SET_BEHAVIOR over SPAWN.
- NEVER spawn units on empty terrain far from all players. Every spawn must serve a purpose tied to player progression.
- Isolated units on distant islands or far corners of the map waste server bandwidth and degrade performance. Don't do it.
- Quality over quantity: 2 well-placed squads create better gameplay than 8 random spawns.

## Using Situational Awareness Data
The user message contains rich live data from the game engine — USE IT:
- **TACTICAL ANALYSIS → "BLIND SIDE: X/Y"**: these directions are opposite the player's heading — the player CANNOT see them. Spawn and maneuver enemies from these directions.
- **TACTICAL ANALYSIS → "MASKED APPROACH"**: buildings/terrain at those bearings mask movement — ideal ambush positions or covered infiltration routes.
- **TACTICAL ANALYSIS → "CLEAR LOS"**: player has long unobstructed sightline here — DO NOT spawn enemies directly in line of sight at range, or they will be spotted immediately.
- **RECOMMENDED ACTIONS**: if present, these are time-sensitive — weakened groups need REINFORCE, groups in contact need SET_BEHAVIOR. Address before spawning new forces.
- **"nearest_location"**: the named town/village/landmark the player is closest to. Use this name in BROADCAST messages ("Enemy forces spotted near [location]") for immersion.
- **SITUATIONAL AWARENESS "nearby"**: buildings within 200m are cover for ambush; vehicles are tactical assets. Use them in your decisions.
- **COMBAT TEMPO**: shows casualties and engagement intensity. High tempo = reinforce and exploit; low tempo = probe and setup.

## Rules
- ALWAYS call at least 1 tool. NEVER respond with plain text only.
- "units" MUST be an exact prefab name from AVAILABLE UNITS.
- Scale force size to difficulty level. Higher difficulty = more units, heavier weapons, smarter positioning.
- Call up to 5 tools per response. Prefer quality deployments over quantity.
- ALWAYS broadcast a mission/objective with a named location when starting a new operation.
- Place compositions and environment BEFORE or alongside combat units.
- Use MILITARY DOCTRINE data when available to create realistic operations.
- EVERY spawned group MUST have active orders. After spawning, immediately issue a MOVE or SET_BEHAVIOR command with a specific grid and purpose. Groups with no orders go idle. NO IDLE GROUPS.
- Patrol groups must have a route grid 200-400m from spawn, not at the spawn point itself.
- When you see groups listed as "idle" or far from players in the situation report, your FIRST action is MOVE them toward the objective — not spawn more units."""

        # For non-tool-call backends (Ollama/qwen2.5:14b), override system prompt
        # to request direct JSON array output — eliminates the always-failing tool
        # call round-trip and gets 3-5 commands in a single pass.
        if not SUPPORTS_TOOL_CALLS:
            catalog_for_prompt = get_catalog(state)
            groups_fp = [e["name"] for e in catalog_for_prompt if e.get("category") == "group"][:12]
            vehicles_fp = [e["name"] for e in catalog_for_prompt if e.get("category") == "vehicle"][:6]
            statics_fp = [e["name"] for e in catalog_for_prompt if e.get("category") == "static_weapon"][:6]
            players_fp = state.get("players", [])
            player_grids_fp = []
            for p in players_fp:
                px2 = float(p.get("pos", {}).get("x", 0))
                py2 = float(p.get("pos", {}).get("y", 0))
                player_grids_fp.append(f"{p.get('name','?')} at {pos_to_grid6(px2, py2)}")
            valid_grids_fp = state.get("valid_spawn_grids", [])
            sample_fp = random.sample(valid_grids_fp, min(15, len(valid_grids_fp))) if valid_grids_fp else []
            active_ai_fp = state.get('ai_units', {}).get('active', 0)
            max_ai_fp = state.get('ai_units', {}).get('max', 40)
            budget_fp = max(6, len(players_fp) * 3)

            json_system_prompt = f"""You are Zeus, an AI Game Master for Arma Reforger. You output ONLY a JSON array of 3-5 tactical commands. No text, no markdown, no explanation — ONLY the JSON array.

## Your Mission
Design a complete tactical scenario with COORDINATED forces. Think like a military commander — every unit has a role, every role serves the objective.

## Decision Process (follow every heartbeat)
Read the TACTICAL ASSESSMENT in the user message, then:
1. **Fix first**: Groups IN CONTACT with passive behavior → SET_BEHAVIOR to attack/hunt. Weakened groups → REINFORCE or DELETE.
2. **Coordinate**: Give nearby groups distinct roles — one attacks, one flanks, one suppresses. Use SET_BEHAVIOR, not just MOVE.
3. **Reposition deadweight**: Groups >2km from players → MOVE closer or DELETE.
4. **Spawn last**: Only spawn if a specific role is genuinely missing (no overwatch, no vehicle, no flanking element). Never spawn just because you have budget.

## Command Format (ALL valid types)
[
  {{"type":"SPAWN","units":"<exact_name>","count":<n>,"grid":"XXX-YYY","behavior":"<b>","faction":"OPFOR","reasoning":"<why>"}},
  {{"type":"SET_BEHAVIOR","units":"<exact_name>","behavior":"<b>","grid":"XXX-YYY","reasoning":"<why>"}},
  {{"type":"MOVE","units":"<exact_name>","grid":"XXX-YYY","behavior":"<b>","reasoning":"<why>"}},
  {{"type":"REINFORCE","units":"<exact_name>","count":<n>,"grid":"XXX-YYY","reasoning":"<why>"}},
  {{"type":"DELETE","units":"<exact_name>","reasoning":"<why>"}},
  {{"type":"BROADCAST","message":"<OBJECTIVE/INTEL/CONTACT/SITREP radio message to players>"}},
  {{"type":"INTENT","intent":"<your strategic goal>","posture":"aggressive|defensive|balanced|recon"}},
  {{"type":"PLAN_OP","name":"<operation name>","phases":[{{"name":"<phase>","objective":"<what to do>","duration_minutes":<n>}}],"reasoning":"<OPORD>"}}
]

## Available Units
Infantry: {', '.join(groups_fp) or 'none'}
Vehicles: {', '.join(vehicles_fp) or 'none'}
Static weapons: {', '.join(statics_fp) or 'none'}
Behaviors: patrol, defend, ambush, hunt, attack, flank, search, overwatch, observe

## Players
{chr(10).join(player_grids_fp) if player_grids_fp else 'No players yet'}

## Valid Spawn Grids (near players — use these)
{', '.join(sample_fp) if sample_fp else 'Use player grids'}

## AI Budget
{active_ai_fp}/{max_ai_fp} active. Max {budget_fp} for current player count. Stay under budget.

## Reading the Battlefield Context (in the user message)
- TACTICAL ANALYSIS → "BLIND SIDE: X/Y" means the player CANNOT see those directions — spawn there
- RECOMMENDED ACTIONS → time-sensitive! Address these first (weakened groups, groups in contact)
- SITUATIONAL AWARENESS → "los": short dist = cover blocks view; "heading_dir" = where player faces
- NEARBY OBJECTIVE CANDIDATES → named locations within 3km — use these names in BROADCAST messages
- COMBAT TEMPO → casualties and engagement intensity, drives escalation level

## Rules
- Output EXACTLY a JSON array starting with [ — nothing before or after
- Always include 1 BROADCAST with a clear mission objective using a named location
- Check RECOMMENDED ACTIONS first — respond to weakened/in-contact groups before spawning new ones
- Spawn enemies in player BLIND SIDE directions (from TACTICAL ANALYSIS), 300-800m away
- Use EXACT unit names from the lists above
- 3-5 commands forming a complete, tactically coherent encounter
- Use INTENT to track your strategic goal across heartbeats
- Use PLAN_OP only for multi-phase scenarios (2-3 phases max)
- CRITICAL: Every SPAWN must be paired with a MOVE command sending the group to an active position. "grid" on patrol commands must be 200-400m from spawn — NOT the spawn grid itself. NO IDLE GROUPS.
- If you see idle groups in the situation report, MOVE them immediately before spawning anything new.

/no_think"""
            # For Ollama: enable thinking on strategic/tactical queries, skip for simple
            _use_think = OLLAMA_THINK == "on" or (OLLAMA_THINK == "auto" and complexity in ("strategic", "tactical"))
            messages = [
                {"role": "system", "content": json_system_prompt},
                {"role": "user", "content": build_prompt(state, context)},
            ]
            if BACKEND_MODE == "ollama":
                model_opts["think"] = False  # /no_think in prompt, reinforce at API level
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": build_prompt(state, context)},
            ]
            if BACKEND_MODE == "ollama":
                model_opts["think"] = OLLAMA_THINK == "on" or (OLLAMA_THINK == "auto" and complexity in ("strategic", "tactical"))

        t0 = time.time()
        all_valid_cmds = []
        agent_turns_used = 0
        content = ""  # Last model content (for reasoning display)

        # ── Agent loop: tool-calling (vLLM) or direct JSON-array (Ollama) ──
        log.info(f"Agent query start - {MODEL_NAME} (esc: {ESCALATION_NAMES[escalation_level]}, complexity: {complexity}, tools={'yes' if SUPPORTS_TOOL_CALLS else 'no'})")

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                for agent_turns_used in range(MAX_AGENT_TURNS):
                    body = {
                        "model": MODEL_NAME,
                        "messages": messages,
                        **model_opts,  # temperature, top_p, max_tokens
                    }
                    if SUPPORTS_TOOL_CALLS:
                        body["tools"] = ZEUS_TOOLS
                        body["tool_choice"] = "required" if agent_turns_used == 0 else "auto"
                    # vLLM-only: suppress chain-of-thought tokens that break tool calling
                    if BACKEND_MODE == "vllm":
                        body["chat_template_kwargs"] = {"enable_thinking": False, "clear_thinking": True}

                    # Retry loop: up to 3 attempts with exponential backoff
                    resp = None
                    for _attempt in range(3):
                        try:
                            resp = await client.post(VLLM_URL, json=body)
                            if resp.status_code == 200:
                                break
                            if resp.status_code in (429, 503) and _attempt < 2:
                                log.warning(f"Backend busy ({resp.status_code}), retry {_attempt+1}/3")
                                await asyncio.sleep(2 ** _attempt)
                            else:
                                log.error(f"Backend error {resp.status_code}: {resp.text[:300]}")
                                break
                        except (httpx.TimeoutException, httpx.ConnectError) as _e:
                            if _attempt < 2:
                                log.warning(f"Connection error, retry {_attempt+1}/3: {_e}")
                                await asyncio.sleep(2 ** _attempt)
                            else:
                                log.error(f"Backend unreachable after 3 attempts: {_e}")
                                resp = None
                                break
                    if resp is None or resp.status_code != 200:
                        break

                    result = resp.json()
                    last_ai_latency_ms = (time.time() - t0) * 1000
                    last_ai_response_time = time.time()

                    # DEBUG: Log raw vLLM response for tool call debugging
                    choice = result.get("choices", [{}])[0]
                    finish_reason = choice.get("finish_reason", "unknown")
                    msg = choice.get("message", {})
                    reasoning_content = msg.get("reasoning", msg.get("reasoning_content", "")) or ""
                    log.info(f"  vLLM raw: finish={finish_reason}, has_tool_calls={bool(msg.get('tool_calls'))}, content_len={len(msg.get('content','') or '')}, reasoning_len={len(reasoning_content)}, keys={list(msg.keys())}")
                    content = msg.get("content", "") or ""
                    # Preserve AI reasoning from <think> tags as operational memory
                    think_reasoning = extract_think_content(content)
                    if think_reasoning:
                        get_awareness(sid).record_reasoning(think_reasoning)
                    raw_tool_calls = msg.get("tool_calls", []) or []
                    # vLLM returns arguments as JSON string, Ollama used dict  - normalize
                    tool_calls = []
                    for tc in raw_tool_calls:
                        func = tc.get("function", {})
                        args = func.get("arguments", {})
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except json.JSONDecodeError:
                                args = {}
                        tool_calls.append({"function": {"name": func.get("name", ""), "arguments": args}})

                    log.info(f"  Turn {agent_turns_used+1}: {len(tool_calls)} tool calls, content: {content[:150] if content else '(none)'}")

                    if not tool_calls:
                        # No tool calls — try to extract from content, then break.
                        # For Ollama mode this is the PRIMARY path (JSON array output).
                        if content:
                            content = strip_think_tags(content)
                            commands = extract_json_array(content)
                            valid_types = {"SPAWN", "MOVE", "EVENT", "DELETE_ALL", "DELETE", "REINFORCE", "SET_BEHAVIOR", "BROADCAST", "INTENT", "PLAN_OP",
                                           "SET_WEATHER", "SET_TIME", "FIRE_SUPPORT", "MARKER", "ARTILLERY", "SMOKE", "SET_FORMATION", "SET_SKILL", "SCOUT", "SUPPRESS"}
                            for c in (commands or []):
                                ctype = (c.get("type") or "").upper()
                                c["type"] = ctype
                                if ctype not in valid_types:
                                    continue
                                # ── Handle INTENT inline (Ollama path) ──
                                if ctype == "INTENT":
                                    intent_obj = get_intent(sid)
                                    intent_obj.update(
                                        c.get("intent", ""),
                                        c.get("posture", "balanced"),
                                        c.get("priority_targets", []),
                                    )
                                    log.info(f"  Ollama INTENT: {c.get('intent','')[:80]}")
                                    continue
                                # ── Handle PLAN_OP inline (Ollama path) ──
                                if ctype == "PLAN_OP":
                                    raw_phases = c.get("phases", [])
                                    phases = []
                                    for p in raw_phases:
                                        if isinstance(p, dict):
                                            phases.append({
                                                "name": p.get("name", "Phase"),
                                                "objective": p.get("objective", "Execute"),
                                                "duration_s": int(p.get("duration_minutes", 5)) * 60,
                                            })
                                    if phases:
                                        get_planner(sid).start_operation(
                                            c.get("name", "Operation Zeus"),
                                            phases,
                                            c.get("reasoning", ""),
                                        )
                                        log.info(f"  Ollama PLAN_OP: {c.get('name','?')} ({len(phases)} phases)")
                                    continue
                                if ctype == "BROADCAST":
                                    # BROADCAST only needs a message field
                                    c.setdefault("message", "Zeus actual: contact expected. Stay frosty.")
                                    c.setdefault("units", "")
                                    c.setdefault("count", 0)
                                    c.setdefault("grid", "000-000")
                                    c.setdefault("behavior", "")
                                    c.setdefault("faction", "")
                                    c.setdefault("reasoning", "Player briefing")
                                    all_valid_cmds.append(c)
                                    continue
                                c.setdefault("units", "infantry_patrol")
                                c.setdefault("count", 4)
                                c.setdefault("grid", "050-050")
                                c["grid"] = validate_grid(c["grid"], state)
                                c.setdefault("behavior", "patrol")
                                c.setdefault("faction", "OPFOR")
                                c.setdefault("reasoning", "Tactical deployment")
                                c["units"] = validate_unit_type(c.get("units", ""), state, enforce_enemy=True, requested_faction=c.get("faction", ""))
                                if c.get("type") == "SPAWN":
                                    total_spawns += c.get("count", 0)
                                all_valid_cmds.append(c)
                            if all_valid_cmds:
                                log.info(f"  Direct JSON: extracted {len(all_valid_cmds)} commands from content")
                        break

                    # ── Process tool calls ──
                    # Add the assistant's message to conversation history
                    messages.append(msg)

                    has_info_tool = False  # Did this turn include assess/plan/intent?
                    tool_results = []

                    for tc in tool_calls:
                        func = tc.get("function", {})
                        fname = func.get("name", "")
                        args = func.get("arguments", {})
                        cmd_type = TOOL_TO_CMD.get(fname)

                        if not cmd_type:
                            log.warning(f"Unknown tool call: {fname}")
                            tool_results.append({"role": "tool", "content": f"Error: unknown tool '{fname}'"})
                            continue

                        # ── Handle INTENT  - update Commander's Intent ──
                        if cmd_type == "INTENT":
                            intent_obj = get_intent(sid)
                            intent_text = args.get("intent", "")
                            posture = args.get("posture", "balanced")
                            targets = args.get("priority_targets", [])
                            intent_obj.update(intent_text, posture, targets)
                            tool_results.append({"role": "tool", "content": f"Commander's Intent updated: {intent_text} (posture={posture}). This will guide your future decisions."})
                            has_info_tool = True
                            log.info(f"  Tool: update_intent -> posture={posture}, intent={intent_text[:80]}")
                            continue

                        # ── Handle ASSESS  - return computed analytics ──
                        if cmd_type == "ASSESS":
                            focus = args.get("focus", "deployments")
                            evaluator = get_evaluator(sid)
                            awareness = get_awareness(sid)
                            skill_tracker = get_skill_tracker(sid)
                            intent_obj = get_intent(sid)

                            assessment = []

                            # Computed analytics  - not just raw data dumps
                            if focus in ("deployments", "all"):
                                success_rate = evaluator.get_success_rate()
                                tactic_info = evaluator.build_tactic_summary()
                                feedback = evaluator.build_feedback()
                                assessment.append(f"DEPLOYMENT ANALYSIS: Overall success rate {success_rate:.0%}.")
                                if tactic_info:
                                    assessment.append(tactic_info)
                                if feedback:
                                    assessment.append(feedback)
                                # Force composition analysis
                                ai_data = state.get("ai_units", {})
                                groups = ai_data.get("groups", [])
                                if groups:
                                    behaviors = {}
                                    for g in groups:
                                        b = g.get("behavior", "unknown")
                                        behaviors[b] = behaviors.get(b, 0) + g.get("count", 1)
                                    composition = ", ".join(f"{b}:{c}" for b, c in sorted(behaviors.items(), key=lambda x: -x[1]))
                                    assessment.append(f"FORCE COMPOSITION: {ai_data.get('active', 0)} active  - {composition}")
                                else:
                                    assessment.append("FORCE COMPOSITION: No units deployed.")

                            if focus in ("threats", "all"):
                                player_summary = skill_tracker.get_player_summary()
                                assessment.append(player_summary or "No player threat data yet.")
                                # Engagement zone analysis
                                if awareness.engagement_zones:
                                    hot_grids = set(e["grid"] for e in awareness.engagement_zones)
                                    assessment.append(f"ACTIVE CONTACT ZONES: {', '.join(hot_grids)}")
                                else:
                                    assessment.append("NO ACTIVE CONTACTS  - players not engaging.")

                            if focus in ("terrain", "all"):
                                narrative = awareness.build_narrative(state) or "Quiet battlefield."
                                assessment.append(narrative)

                            # Include current intent for self-awareness
                            if intent_obj.intent:
                                assessment.append(f"CURRENT INTENT: {intent_obj.intent} (posture={intent_obj.posture})")

                            result_text = "\n".join(assessment)
                            tool_results.append({"role": "tool", "content": result_text})
                            has_info_tool = True
                            log.info(f"  Tool: assess_situation({focus}) -> analytics ({len(result_text)} chars)")
                            continue

                        # ── Handle PLAN_OP  - start a multi-phase operation ──
                        if cmd_type == "PLAN_OP":
                            op_name = args.get("name", "Operation Zeus")
                            mission_type = args.get("mission_type", "assault")
                            objective_grid = args.get("objective_grid", "")
                            raw_phases = args.get("phases", [])
                            phases = []
                            for p in raw_phases:
                                if isinstance(p, dict):
                                    phases.append({
                                        "name": p.get("name", "Phase"),
                                        "objective": p.get("objective", "Execute"),
                                        "duration_s": int(p.get("duration_minutes", 5)) * 60,
                                    })
                            if phases:
                                planner.start_operation(op_name, phases, args.get("reasoning", ""))
                                planner.active_op["mission_type"] = mission_type
                                planner.active_op["objective_grid"] = objective_grid
                                tool_results.append({
                                    "role": "tool",
                                    "content": f"Operation '{op_name}' ({mission_type}) started with {len(phases)} phases at grid {objective_grid}. "
                                               f"Phase 1: {phases[0]['name']} - {phases[0]['objective']}. "
                                               f"IMPORTANT: Now you must (1) broadcast the mission objective to players, "
                                               f"(2) spawn compositions/environment at {objective_grid}, and "
                                               f"(3) deploy forces. Execute Phase 1 now."
                                })
                                has_info_tool = True
                                log.info(f"  Tool: plan_operation -> {op_name} ({mission_type}) @ {objective_grid} ({len(phases)} phases)")
                            else:
                                tool_results.append({"role": "tool", "content": "Error: no valid phases provided."})
                            continue

                        # ── Handle DELETE_ALL ──
                        if cmd_type == "DELETE" and args.get("units", "").lower() == "all":
                            cmd_type = "DELETE_ALL"

                        # ── Handle BROADCAST ──
                        if cmd_type == "BROADCAST":
                            c = {
                                "type": "BROADCAST",
                                "message": args.get("message", ""),
                                "reasoning": "AI broadcast",
                            }
                            all_valid_cmds.append(c)
                            tool_results.append({"role": "tool", "content": f"Broadcast queued: '{c['message']}'"})
                            log.info(f"  Tool: broadcast_message -> \"{c['message']}\"")
                            continue

                        # ── Environment/tactical commands (no unit validation needed) ──
                        if cmd_type in ("SET_WEATHER", "SET_TIME", "FIRE_SUPPORT", "MARKER", "ARTILLERY", "SMOKE", "SET_FORMATION", "SET_SKILL", "SCOUT", "SUPPRESS"):
                            if cmd_type == "SET_WEATHER":
                                c = {"type": "SET_WEATHER", "weather": args.get("weather", "clear"),
                                     "intensity": float(args.get("intensity", 0.5)), "reasoning": args.get("reasoning", ""),
                                     "units": "", "count": 0, "grid": "", "behavior": "", "faction": ""}
                                result_msg = f"Weather changing to {c['weather']} (intensity {c['intensity']:.1f})"
                            elif cmd_type == "SET_TIME":
                                c = {"type": "SET_TIME", "hour": float(args.get("hour", 12)),
                                     "minute": int(args.get("minute", 0)), "reasoning": args.get("reasoning", ""),
                                     "units": "", "count": 0, "grid": "", "behavior": "", "faction": ""}
                                result_msg = f"Time set to {int(c['hour']):02d}:{c['minute']:02d}"
                            elif cmd_type == "FIRE_SUPPORT":
                                c = {"type": "FIRE_SUPPORT", "grid": validate_grid(args.get("grid", ""), state),
                                     "rounds": min(int(args.get("rounds", 3)), 5),
                                     "weapon_type": args.get("weapon_type", "mortar"), "reasoning": args.get("reasoning", ""),
                                     "units": "", "count": 0, "behavior": "", "faction": ""}
                                result_msg = f"Fire mission: {c['rounds']}x {c['weapon_type']} rounds on {c['grid']}"
                            elif cmd_type == "ARTILLERY":
                                c = {"type": "ARTILLERY", "units": validate_unit_type(args.get("units", ""), state),
                                     "grid": validate_grid(args.get("grid", ""), state),
                                     "rounds": min(int(args.get("rounds", 3)), 10),
                                     "shell_type": args.get("shell_type", "he"), "reasoning": args.get("reasoning", ""),
                                     "count": 0, "behavior": "", "faction": ""}
                                result_msg = f"Artillery: {c['units']} fires {c['rounds']}x {c['shell_type']} on {c['grid']}"
                            elif cmd_type == "SMOKE":
                                c = {"type": "SMOKE", "units": validate_unit_type(args.get("units", ""), state),
                                     "grid": validate_grid(args.get("grid", ""), state),
                                     "reasoning": args.get("reasoning", ""),
                                     "count": 0, "behavior": "", "faction": ""}
                                result_msg = f"Smoke deployment: {c['units']} at {c['grid']}"
                            elif cmd_type == "SET_FORMATION":
                                c = {"type": "SET_FORMATION", "units": validate_unit_type(args.get("units", ""), state),
                                     "formation": args.get("formation", "wedge"), "reasoning": args.get("reasoning", ""),
                                     "count": 0, "grid": "", "behavior": "", "faction": ""}
                                result_msg = f"Formation: {c['units']} -> {c['formation']}"
                            elif cmd_type == "SET_SKILL":
                                c = {"type": "SET_SKILL", "units": validate_unit_type(args.get("units", ""), state),
                                     "skill": max(0.0, min(1.0, float(args.get("skill", 0.5)))),
                                     "reasoning": args.get("reasoning", ""),
                                     "count": 0, "grid": "", "behavior": "", "faction": ""}
                                result_msg = f"Skill set: {c['units']} -> {c['skill']:.1f}"
                            elif cmd_type == "SCOUT":
                                c = {"type": "SCOUT", "units": validate_unit_type(args.get("units", ""), state),
                                     "grid": validate_grid(args.get("grid", ""), state),
                                     "reasoning": args.get("reasoning", ""),
                                     "count": 0, "behavior": "observe", "faction": ""}
                                result_msg = f"Scout mission: {c['units']} observing {c['grid']}"
                            elif cmd_type == "SUPPRESS":
                                c = {"type": "SUPPRESS", "units": validate_unit_type(args.get("units", ""), state),
                                     "grid": validate_grid(args.get("grid", ""), state),
                                     "duration_seconds": min(int(args.get("duration_seconds", 60)), 180),
                                     "reasoning": args.get("reasoning", ""),
                                     "count": 0, "behavior": "suppress", "faction": ""}
                                result_msg = f"Suppression: {c['units']} firing on {c['grid']} for {c['duration_seconds']}s"
                            elif cmd_type == "MARKER":
                                c = {"type": "MARKER", "grid": validate_grid(args.get("grid", ""), state),
                                     "label": str(args.get("label", ""))[:30],
                                     "marker_type": args.get("marker_type", "objective"),
                                     "color": args.get("color", ""), "reasoning": args.get("reasoning", ""),
                                     "units": "", "count": 0, "behavior": "", "faction": ""}
                                result_msg = f"Marker placed: '{c['label']}' ({c['marker_type']}) at {c['grid']}"
                            all_valid_cmds.append(c)
                            tool_results.append({"role": "tool", "content": result_msg + " — command queued"})
                            log.info(f"  Tool: {fname} -> {result_msg}")
                            continue

                        # ── Standard command (SPAWN, MOVE, DELETE, etc.) ──
                        # Pick a random default from the catalog instead of always infantry_patrol
                        _cat = get_catalog(state)
                        _default_unit = random.choice([e["name"] for e in _cat]) if _cat else "infantry_patrol"
                        c = {
                            "type": cmd_type,
                            "units": args.get("units", _default_unit),
                            "count": args.get("count", 3),
                            "grid": validate_grid(args.get("grid", "050-050"), state),
                            "behavior": args.get("behavior", random.choice(["patrol", "defend", "ambush", "overwatch", "hunt"])),
                            "faction": args.get("faction", "OPFOR"),
                            "reasoning": args.get("reasoning", "Tactical deployment"),
                        }
                        c["units"] = validate_unit_type(c["units"], state, enforce_enemy=True, requested_faction=c.get("faction", ""))
                        if c["type"] == "SPAWN":
                            total_spawns += c.get("count", 0)
                        all_valid_cmds.append(c)

                        # Build result message for multi-turn feedback
                        result_msg = f"{cmd_type} {c['units']} x{c.get('count',1)} at {c.get('grid','?')} [{c.get('behavior','?')}]  - command queued"
                        tool_results.append({"role": "tool", "content": result_msg})
                        log.info(f"  Tool: {fname} -> {cmd_type} {c['units']} x{c.get('count',1)} @ {c.get('grid','?')} [{c.get('behavior','?')}]")

                    # ── Multi-turn: always feed tool results back for another turn ──
                    # This enables: assess -> deploy, intent -> spawn, spawn -> reinforce
                    if agent_turns_used < MAX_AGENT_TURNS - 1 and tool_results:
                        # If we only had action tools (no assess/plan/intent) and already
                        # have 3+ commands, stop to avoid over-deploying
                        if not has_info_tool and len(all_valid_cmds) >= 3:
                            break
                        for tr in tool_results:
                            messages.append(tr)
                        log.info(f"  Agent loop: feeding {len(tool_results)} tool results back for turn {agent_turns_used+2}")
                        continue
                    else:
                        break

                # ── Retry WITHOUT tools if agent loop produced nothing ──
                if not all_valid_cmds:
                    log.warning("Agent loop produced no commands  - falling back to JSON prompt...")
                    catalog = get_catalog(state)
                    # Pick units from DIFFERENT categories for variety
                    groups = [e["name"] for e in catalog if e.get("category") == "group"][:10]
                    vehicles = [e["name"] for e in catalog if e.get("category") == "vehicle"][:5]
                    statics = [e["name"] for e in catalog if e.get("category") == "static_weapon"][:5]
                    compositions = [e["name"] for e in catalog if e.get("category") == "composition"][:3]
                    all_units = groups + vehicles + statics + compositions
                    if not all_units:
                        # Use first available enemy faction group from catalog
                        all_units = [e["name"] for e in catalog if e.get("category") == "group"][:2]
                        if not all_units:
                            all_units = ["infantry_patrol"]

                    player_grids = []
                    player_names = []
                    for p in state.get("players", []):
                        px = float(p.get("pos", {}).get("x", 0))
                        py = float(p.get("pos", {}).get("y", 0))
                        player_grids.append(pos_to_grid6(px, py))
                        player_names.append(p.get("name", "unknown"))

                    # Build existing AI groups info for SET_BEHAVIOR/MOVE commands
                    existing_groups = []
                    for g in state.get("ai_units", {}).get("groups", []):
                        gname = g.get("type", g.get("name", "unknown"))
                        ggrid = g.get("grid", "")
                        gbehavior = g.get("behavior", "unknown")
                        existing_groups.append(f"{gname} at {ggrid} [{gbehavior}]")

                    # Pick varied example units
                    example_infantry = random.choice(groups) if groups else all_units[0]
                    example_vehicle = random.choice(vehicles) if vehicles else ""
                    example_static = random.choice(statics) if statics else ""

                    # Detect if this is a chat/directive context (player asked for something)
                    has_chat_context = bool(context and any(kw in context.lower() for kw in ["attack", "hunt", "flank", "move", "send", "destroy", "kill", "assault", "ambush", "retreat", "defend"]))

                    retry_examples = []
                    if has_chat_context and existing_groups:
                        # Prioritize SET_BEHAVIOR and MOVE for existing units
                        eg = existing_groups[0].split(" at ")[0] if existing_groups else example_infantry
                        retry_examples.append(f'{{"type":"SET_BEHAVIOR","units":"{eg}","behavior":"hunt","grid":"{player_grids[0] if player_grids else "050-050"}","reasoning":"Directing forces to hunt player"}}')
                        retry_examples.append(f'{{"type":"MOVE","units":"{eg}","grid":"{player_grids[0] if player_grids else "050-050"}","behavior":"attack","reasoning":"Moving units to attack player position"}}')
                        retry_examples.append(f'{{"type":"BROADCAST","message":"All units, converge on grid {player_grids[0] if player_grids else "050-050"}. Engage hostile forces."}}')
                    else:
                        retry_examples.append(f'{{"type":"SPAWN","units":"{example_infantry}","count":3,"grid":"{player_grids[0] if player_grids else "050-050"}","behavior":"ambush","faction":"OPFOR","reasoning":"Infantry ambush near player route"}}')
                        if example_vehicle:
                            retry_examples.append(f'{{"type":"SPAWN","units":"{example_vehicle}","count":1,"grid":"{player_grids[0] if player_grids else "060-060"}","behavior":"patrol","faction":"OPFOR","reasoning":"Vehicle patrol on nearby road"}}')
                        if example_static:
                            retry_examples.append(f'{{"type":"SPAWN","units":"{example_static}","count":1,"grid":"{player_grids[0] if player_grids else "055-065"}","behavior":"overwatch","faction":"OPFOR","reasoning":"MG overwatch covering approach"}}')

                    # Build context-aware retry prompt
                    # Include the model's own scenario reasoning as context so it can
                    # translate its plan into structured commands (fixes single-command output)
                    scenario_context = ""
                    if content:
                        scenario_context = f"\nYou already designed this tactical scenario:\n---\n{content[:2000]}\n---\nNow convert this plan into concrete JSON commands that execute it.\n"

                    chat_section = ""
                    if context:
                        chat_section = f"\nPlayer command/context: {context}\n"

                    existing_section = ""
                    if existing_groups:
                        existing_section = f"\nExisting AI groups on map:\n" + "\n".join(f"  - {g}" for g in existing_groups[:15]) + "\n"

                    # Valid spawn grids near players for the retry
                    valid_for_retry = state.get("valid_spawn_grids", [])
                    near_retry = []
                    if valid_for_retry and player_grids:
                        for g in valid_for_retry:
                            gp = g.split("-")
                            if len(gp) == 2:
                                try:
                                    gx2, gz2 = int(gp[0]), int(gp[1])
                                    pg_parts = player_grids[0].split("-") if player_grids else []
                                    if len(pg_parts) == 2:
                                        pdist = abs(gx2 - int(pg_parts[0])) + abs(gz2 - int(pg_parts[1]))
                                        if pdist <= 20:
                                            near_retry.append(g)
                                except ValueError:
                                    pass
                    valid_sample = random.sample(near_retry, min(12, len(near_retry))) if near_retry else random.sample(valid_for_retry, min(12, len(valid_for_retry)))

                    retry_prompt = f"""You are a military AI Game Master for Arma Reforger. Output ONLY a valid JSON array of 3-5 commands.
{scenario_context}
Available command types:
- SPAWN: {{"type":"SPAWN","units":"<exact_name>","count":<n>,"grid":"XXX-YYY","behavior":"<b>","faction":"OPFOR","reasoning":"<why>"}}
- SET_BEHAVIOR: {{"type":"SET_BEHAVIOR","units":"<exact_name>","behavior":"<b>","grid":"XXX-YYY","reasoning":"<why>"}}
- MOVE: {{"type":"MOVE","units":"<exact_name>","grid":"XXX-YYY","behavior":"<b>","reasoning":"<why>"}}
- BROADCAST: {{"type":"BROADCAST","message":"<radio_message>"}}

Behaviors: patrol, defend, ambush, hunt, attack, flank, search, overwatch, observe
{chat_section}{existing_section}
Players: {', '.join(f'{n} at {g}' for n, g in zip(player_names, player_grids)) if player_grids else 'unknown at 050-050'}
Difficulty: {difficulty}/100. Escalation: {ESCALATION_NAMES[escalation_level]}.
Infantry groups: {', '.join(groups[:8])}
Vehicles: {', '.join(vehicles[:5]) if vehicles else 'none'}
Static weapons: {', '.join(statics[:5]) if statics else 'none'}
Valid grids near players (use these): {', '.join(valid_sample) if valid_sample else ', '.join(player_grids)}

Rules:
- Output 3-5 commands that together form a complete tactical scenario (spawn + broadcast minimum).
- Always include at least 1 BROADCAST to brief the player.
- Use grids from the valid list above — all within 2km of the player.
- ONLY use exact unit names from the infantry/vehicle/static lists above.
- If existing units are listed, prefer SET_BEHAVIOR/MOVE over spawning new ones.

Output ONLY the JSON array starting with [ — no explanation, no markdown, no wrapping object."""

                    retry_body = {
                        "model": MODEL_NAME,
                        "messages": [
                            {"role": "system", "content": "You output ONLY valid JSON arrays starting with [. No markdown, no explanation, no wrapping object."},
                            {"role": "user", "content": retry_prompt},
                        ],
                        "temperature": 0.4,
                        "max_tokens": 1536,
                        "top_p": 0.9,
                        # NOTE: Do NOT use response_format json_object here - it forces {} wrapping
                        # which prevents array output and results in only 1 command being parsed.
                    }
                    if BACKEND_MODE == "vllm":
                        retry_body["chat_template_kwargs"] = {"enable_thinking": False, "clear_thinking": True}
                    t1 = time.time()
                    resp2 = await client.post(VLLM_URL, json=retry_body)
                    last_ai_latency_ms = (time.time() - t0) * 1000
                    if resp2.status_code == 200:
                        r2 = resp2.json()
                        retry_content = strip_think_tags(r2.get("choices", [{}])[0].get("message", {}).get("content", "") or "")
                        log.info(f"JSON retry ({(time.time()-t1)*1000:.0f}ms): {retry_content[:300]}")
                        commands = extract_json_array(retry_content)
                        if not commands:
                            try:
                                parsed = json.loads(retry_content)
                                if isinstance(parsed, list):
                                    commands = parsed
                                elif isinstance(parsed, dict):
                                    commands = parsed.get("commands", parsed.get("data", [parsed]))
                            except Exception:
                                pass
                        for c in (commands or []):
                            if not isinstance(c, dict):
                                continue
                            cmd_type = c.get("type", "").upper()
                            if cmd_type == "BROADCAST":
                                # BROADCAST only needs a message
                                c["type"] = "BROADCAST"
                                c.setdefault("message", "All units, be advised.")
                                all_valid_cmds.append(c)
                                continue
                            if cmd_type not in ("SPAWN", "MOVE", "DELETE", "DELETE_ALL", "REINFORCE", "SET_BEHAVIOR",
                                                "SET_WEATHER", "SET_TIME", "FIRE_SUPPORT", "MARKER", "ARTILLERY", "SMOKE", "SET_FORMATION", "SET_SKILL", "SCOUT", "SUPPRESS"):
                                c["type"] = "SPAWN"
                            else:
                                c["type"] = cmd_type
                            # SET_BEHAVIOR and MOVE don't need count/faction
                            if c["type"] in ("SET_BEHAVIOR", "MOVE"):
                                c.setdefault("units", random.choice(all_units) if all_units else "infantry_patrol")
                                c.setdefault("grid", player_grids[0] if player_grids else "050-050")
                                if c.get("grid"):
                                    c["grid"] = validate_grid(c["grid"], state)
                                c.setdefault("behavior", "hunt")
                                c.setdefault("reasoning", "Tactical redeployment")
                            else:
                                c.setdefault("units", random.choice(all_units) if all_units else "infantry_patrol")
                                c.setdefault("count", 3)
                                c.setdefault("grid", player_grids[0] if player_grids else "050-050")
                                c["grid"] = validate_grid(c["grid"], state)
                                c.setdefault("behavior", random.choice(["patrol", "defend", "ambush", "overwatch", "hunt"]))
                                c.setdefault("faction", "OPFOR")
                                c.setdefault("reasoning", "Tactical deployment")
                                c["units"] = validate_unit_type(c.get("units", ""), state, enforce_enemy=True, requested_faction=c.get("faction", ""))
                                if c.get("type") == "SPAWN":
                                    total_spawns += c.get("count", 0)
                            all_valid_cmds.append(c)
                        if all_valid_cmds:
                            log.info(f"JSON retry produced {len(all_valid_cmds)} commands")

        except Exception as e:
            ai_thinking = False
            await broadcast("ai_thinking", {"thinking": False})
            log.error(f"Zeus agent failed: {type(e).__name__}: {e}")
            return []

        ai_thinking = False
        await broadcast("ai_thinking", {"thinking": False})

        if all_valid_cmds:
            log_decision(state, all_valid_cmds)
            awareness = get_awareness(sid)
            awareness.record_decision(all_valid_cmds, context)
            # Track for outcome evaluation
            get_evaluator(sid).track_commands(all_valid_cmds, state)
            await broadcast("ai_decision", {
                "commands": all_valid_cmds, "latency_ms": last_ai_latency_ms,
                "complexity": complexity, "reasoning": content[:300] if content else "",
                "agent_turns": agent_turns_used + 1,
                "operation": planner.active_op.get("name") if planner.active_op else None,
            })
            log.info(f"Zeus agent issued {len(all_valid_cmds)} commands in {last_ai_latency_ms:.0f}ms (complexity: {complexity}, turns: {agent_turns_used+1})")
        else:
            log.warning(f"Zeus agent returned no valid commands")

        return all_valid_cmds


async def background_query(state: dict, context: str = "", server_id: str = None):
    sid = server_id or state.get("server_id", DEFAULT_SERVER)
    srv = get_server(sid)
    cmds = await query_zeus(state, context)
    if cmds:
        srv.pending_commands.extend(cmds)
        srv.command_history.extend(cmds)
        # Also update legacy globals
        pending_commands.extend(cmds)
        command_history.extend(cmds)
        log.info(f"[{sid}] >>> {len(cmds)} commands QUEUED (pending: {len(srv.pending_commands)})")


async def _broadcast_objective(state: dict, server_id: str):
    """Generate and broadcast a situation/objective update to players via in-game chat."""
    # Skip if main query is in flight — avoid concurrent LLM requests on single GPU
    if _query_lock.locked():
        log.debug(f"[{server_id}] Skipping objective broadcast — query in flight")
        return
    try:
        awareness = get_awareness(server_id)
        narrative = awareness.build_narrative(state)
        pc = state.get("player_count", 0)
        active_ai = state.get("ai_units", {}).get("active", 0)
        map_name = state.get("map", "Unknown")

        prompt = f"""Generate a short in-game radio message (under 150 chars) for military players.

Situation: {map_name}, {pc} players, {active_ai} AI contacts active. {narrative[:200] if narrative else 'Quiet sector.'}
Mission: {get_server(server_id).mission_briefing or 'Patrol and secure the area.'}

Write a brief tactical radio message like a military commander would broadcast. Examples:
- "SITREP: Enemy patrol spotted NE of Morton. All units stay alert. ROE weapons free."
- "OPORD: Recon reports hostiles massing near Tyrone. QRF stand by."
- "All callsigns: Sector is clear. Continue patrol. Report any contacts."

Output ONLY the radio message, nothing else. /no_think"""

        body = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": "You are a military radio operator. Output only the radio message, no quotes, no explanation."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.8,
            "max_tokens": 100,
            "top_p": 0.95,
        }
        if BACKEND_MODE == "vllm":
            body["chat_template_kwargs"] = {"enable_thinking": False, "clear_thinking": True}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(VLLM_URL, json=body)
            if resp.status_code == 200:
                result = resp.json()
                message = strip_think_tags(result.get("choices", [{}])[0].get("message", {}).get("content", "") or "").strip()
                message = message.strip('"').strip("'")
                # Strip "Thinking Process:" preamble that Qwen/Cascade sometimes emit
                import re as _re
                message = _re.sub(r'^.*?(?:Thinking Process|Analysis|Step \d).*?\n', '', message, flags=_re.DOTALL | _re.IGNORECASE).strip()
                # If still contains markdown or thinking artifacts, take just the last line
                if "**" in message or "Process:" in message or "Step " in message:
                    lines = [l.strip() for l in message.split('\n') if l.strip() and not l.strip().startswith(('*', '-', '#', 'Think', 'Step', 'Analy'))]
                    message = lines[-1] if lines else ""
                message = message[:200]  # Cap length

                if message:
                    srv = get_server(server_id)
                    # Add as a BROADCAST command for the game server to pick up
                    broadcast_cmd = {"type": "BROADCAST", "message": message, "reasoning": "Periodic objective update"}
                    srv.pending_commands.append(broadcast_cmd)
                    pending_commands.append(broadcast_cmd)
                    log.info(f"[{server_id}] Objective broadcast: \"{message}\"")
                    await broadcast("server_log", {
                        "time": datetime.now().strftime("%H:%M:%S"),
                        "level": "INFO",
                        "msg": f"📡 Objective: {message}",
                    }, server_id=server_id)

    except Exception as e:
        log.warning(f"Objective broadcast failed: {e}")


def log_decision(state, commands):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "player_count": state.get("player_count", 0),
        "escalation": escalation_level,
        "difficulty": difficulty,
        "commands": commands,
        "latency_ms": last_ai_latency_ms,
    }
    decision_log.append(entry)
    with open(DECISION_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


# ─── Game Server Endpoints ────────────────────────────────────────────────
@app.post("/state")
async def receive_state(request: Request):
    global current_state, last_state_time, last_autonomous_query
    try:
        body = json.loads((await request.body()).decode("utf-8", errors="replace"))
    except Exception as e:
        log.error(f"Parse error: {e}")
        return {"status": "error", "pending": 0}

    # Per-server state tracking
    server_id = body.get("server_id", DEFAULT_SERVER)
    srv = get_server(server_id)
    srv.state = body
    srv.last_state_time = time.time()

    # Ensure log tailer exists for this server_id (reuse default tailer's log dir)
    if server_id not in _log_tailers and DEFAULT_SERVER in _log_tailers:
        _log_tailers[server_id] = _LogTailer(server_id, _log_tailers[DEFAULT_SERVER].log_dir)
        log.info(f"Log tailer registered for {server_id}")
    # Update stdout thread's server_id and re-tag existing "default" console logs
    global _active_stdout_server_id
    if server_id != DEFAULT_SERVER:
        _active_stdout_server_id = server_id
        for entry in console_log_buffer:
            if entry.get("server_id") == DEFAULT_SERVER:
                entry["server_id"] = server_id

    # Also update legacy globals (for backward-compat with functions that use them)
    current_state = body
    last_state_time = time.time()

    (STATE_DIR / f"{server_id}.json").write_text(json.dumps(body, indent=2))

    # Feed battlefield awareness engine  - this gives the AI "eyes"
    awareness = get_awareness(server_id)
    bf_events = awareness.update(body)
    if bf_events:
        log.info(f"[{server_id}] Battlefield events: {', '.join(e['type'] for e in bf_events)}")

    # Feed player skill tracker
    skill_tracker = get_skill_tracker(server_id)
    for p in body.get("players", []):
        pname = p.get("name", "")
        if not pname:
            continue
        if p.get("status") == "alive":
            skill_tracker.record_alive(pname)
    for e in bf_events:
        if e["type"] == "PLAYER_DOWN":
            skill_tracker.record_death(e["player"])
        elif e["type"] == "AI_CASUALTIES":
            # Credit kill to only the most-engaged player — avoid double-counting
            best_ez = None
            best_intensity = -1
            for ez in awareness.engagement_zones:
                pname = ez.get("player")
                if pname and any(p.get("name") == pname and p.get("status") == "alive" for p in body.get("players", [])):
                    intensity = ez.get("intensity", 0)
                    if intensity > best_intensity:
                        best_intensity = intensity
                        best_ez = ez
            if best_ez:
                skill_tracker.record_kill(best_ez["player"], e.get("count", 1))
                skill_tracker.record_engagement_survived(best_ez["player"])
            else:
                # Fallback: credit first alive player
                for p in body.get("players", []):
                    if p.get("status") == "alive":
                        skill_tracker.record_kill(p["name"], e.get("count", 1))
                        break

    # Feed outcome evaluator  - check how past deployments are performing
    evaluator = get_evaluator(server_id)
    new_outcomes = evaluator.evaluate(body)
    if new_outcomes:
        for o in new_outcomes:
            log.info(f"[{server_id}] Outcome: {o['units']}x{o['count']} @ {o['grid']} -> {o['result']}")

    # Dynamic difficulty adjustment
    dyn_diff = get_dynamic_difficulty(server_id)
    dyn_diff.evaluate(body, skill_tracker, evaluator, awareness)

    await broadcast("state_update", body, server_id=server_id)
    # Also broadcast updated server list
    await broadcast("server_list", get_server_list())

    pc = body.get("player_count", 0)
    active_ai = body.get('ai_units', {}).get('active', 0)
    max_ai = body.get('ai_units', {}).get('max', 40)
    map_name = body.get("map", "?")

    log.info(f"[{server_id}] State: {map_name} | {pc}plr | AI={active_ai}/{max_ai} | diff={dyn_diff.current_difficulty} | mode={gm_mode} | pending={len(srv.pending_commands)}")

    # Evaluate phase advance triggers (every 30s, no AI needed)
    sm = srv.state_machine
    if sm.state == "ACTIVE" and sm.active_operation:
        trigger_reason = sm.evaluate_triggers(body)
        if trigger_reason:
            log.info(f"Phase advance triggered: {trigger_reason}")
            sm.advance_phase(trigger_reason, srv.pending_commands)
            phase = sm.active_operation.current_phase() if sm.active_operation else None
            if phase:
                log.info(f"Now in phase: {phase.name} — {phase.objective}")

    # ── Auto-planning: start a new operation if IDLE and players present (autonomous mode only) ──
    players = body.get("players", [])
    if gm_mode == "autonomous" and sm.state == "IDLE" and players and time.time() > sm._plan_cooldown_until:
        log.info("State machine IDLE with players present — starting operation planning")
        # State flip is synchronous — no lock needed; subsequent receive_state calls
        # will see sm.state == "PLANNING" before any await point is reached.
        sm.begin_planning()
        plan_messages = build_planner_messages(body)
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(VLLM_URL, json={
                    "model": MODEL_NAME,
                    "messages": plan_messages,
                    "temperature": 0.7,
                    "max_tokens": 4096,
                })
                if resp.status_code == 200:
                    content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                    content = strip_think_tags(content)
                    op_data = extract_json_object(content)
                    if op_data and op_data.get("phases"):
                        phases = [OperationPhase(**{k: v for k, v in p.items() if k in PHASE_FIELDS})
                                  for p in op_data["phases"] if isinstance(p, dict) and "name" in p and "objective" in p]
                        op = Operation(
                            name=op_data.get("name", "AI Operation"),
                            source="ai_generated",
                            phases=phases,
                            broadcast_mode=op_data.get("broadcast_mode", "command"),
                            commander_intent=op_data.get("commander_intent", ""),
                            roe=op_data.get("roe", ""),
                            code_words=op_data.get("code_words", {}),
                        )
                        sm.set_operation(op)
                        log.info(f"Auto-planned: {op.name}, {len(phases)} phases")
                        # Queue staging commands for phase 0
                        phase0 = op.current_phase()
                        if phase0:
                            for force in phase0.forces:
                                if force.get("units") and force.get("grid"):
                                    srv.pending_commands.append({
                                        "type": "SPAWN",
                                        "units": force["units"],
                                        "count": force.get("count", 2),
                                        "grid": force["grid"],
                                        "behavior": force.get("behavior", "patrol"),
                                        "faction": force.get("faction", "OPFOR"),
                                        "reasoning": f"Phase 0 staging: {phase0.name}",
                                    })
                            for bc in phase0.broadcasts:
                                if bc.get("trigger") == "phase_start":
                                    srv.pending_commands.append({
                                        "type": "BROADCAST",
                                        "message": bc["message"],
                                        "visibility": bc.get("visibility", op.broadcast_mode),
                                    })
                        sm.activate()   # always activate after set_operation
                    else:
                        sm.state = "IDLE"
                        sm._plan_cooldown_until = time.time() + 60
                        log.warning("Planner returned invalid JSON — falling back to legacy mode")
                else:
                    sm.state = "IDLE"
                    sm._plan_cooldown_until = time.time() + 60
                    log.warning(f"Planner got HTTP {resp.status_code} — falling back to legacy mode")
        except Exception as e:
            sm.state = "IDLE"
            sm._plan_cooldown_until = time.time() + 60
            log.error(f"Planning error: {e}")

    # During LLM planning/parsing, don't pile up additional queries
    if sm.state in ("PLANNING", "PARSING", "STAGING"):
        return  # LLM is busy — wait for it to finish

    # Autonomous mode  - only fire if no query in flight
    if gm_mode == "autonomous" and pc > 0 and ai_enabled and not _query_lock.locked():
        time_since_last = time.time() - srv.last_autonomous_query
        # Escalation affects trigger rate — scaled around HEARTBEAT_SEC as the ENGAGED baseline
        _base = HEARTBEAT_SEC
        esc_intervals = [_base * 2, int(_base * 1.5), _base, max(25, int(_base * 0.65)), max(20, int(_base * 0.4))]
        effective_interval = esc_intervals[min(escalation_level, 4)]
        if time_since_last >= effective_interval:
            srv.last_autonomous_query = time.time()
            last_autonomous_query = time.time()
            # Rotating tactical contexts  - scaled by escalation level
            esc_contexts = {
                0: [  # QUIET / Peaceful
                    "Deploy a single small recon patrol on a distant road",
                    "Place a sentry team observing a crossroad far from the player",
                ],
                1: [  # PROBING
                    "Deploy a recon screen of small groups watching player movement corridors",
                    "Set up a single patrol team along a nearby road",
                    "Place a sentry team with binoculars observing from high ground",
                ],
                2: [  # ENGAGED
                    "Deploy a mixed force with infantry and support weapons near the player",
                    "Set up an ambush with hidden infantry along the player's route",
                    "Establish a defensive position with static weapons and infantry",
                    "Create a vehicle patrol with mechanized infantry support",
                ],
                3: [  # ASSAULT
                    "Launch a coordinated attack with infantry, vehicles, and mortars on the player",
                    "Deploy multiple squads with vehicle support to surround the player area",
                    "Set up mortar positions on high ground with infantry assault groups advancing",
                    "Create a pincer movement with flanking vehicles and frontal infantry",
                ],
                4: [  # OVERWHELM
                    "Launch a massive combined arms assault: multiple squads, vehicles, mortars, MG teams from all directions",
                    "Deploy maximum force: infantry waves with vehicle and heavy weapon support overwhelming the player",
                    "Create a kill zone with overlapping MG positions, mortar fire, and armored vehicle assault",
                ],
            }
            auto_ctx = random.choice(esc_contexts.get(escalation_level, esc_contexts[2]))
            # Tactic cooldown — prevent identical assault at high escalation every tick
            ctx_key = auto_ctx[:40]
            last_used = srv.last_tactic_types.get(ctx_key, 0)
            if escalation_level >= 3 and time.time() - last_used < effective_interval * 2.5:
                alt_contexts = [c for c in esc_contexts.get(escalation_level, []) if c[:40] != ctx_key]
                if alt_contexts:
                    auto_ctx = random.choice(alt_contexts)
                    ctx_key = auto_ctx[:40]
            srv.last_tactic_types[ctx_key] = time.time()
            # Prune stale entries
            _cutoff = time.time() - 900
            srv.last_tactic_types = {k: v for k, v in srv.last_tactic_types.items() if v > _cutoff}
            log.info(f"[{server_id}] Autonomous trigger ({time_since_last:.0f}s since last)  - {auto_ctx[:60]}...")
            asyncio.create_task(background_query(body.copy(), context=auto_ctx, server_id=server_id))

    # Periodic objective broadcast  - every OBJECTIVE_INTERVAL seconds, generate situation update for players
    if gm_mode == "autonomous" and pc > 0 and ai_enabled:
        time_since_objective = time.time() - srv.last_objective_broadcast
        if time_since_objective >= OBJECTIVE_INTERVAL:
            srv.last_objective_broadcast = time.time()
            asyncio.create_task(_broadcast_objective(body.copy(), server_id))

    return {"status": "ok", "pending": len(srv.pending_commands)}


@app.get("/commands")
async def get_commands(server_id: str = DEFAULT_SERVER):
    global total_commands_dispatched
    srv = get_server(server_id)
    cmds = srv.pending_commands.copy()
    srv.pending_commands.clear()
    # Also clear legacy global if it matches
    if server_id == DEFAULT_SERVER:
        pending_commands.clear()
    # Enrich BROADCAST commands with admin GUIDs and accumulate in broadcast_log
    enriched = []
    for cmd in cmds:
        if cmd.get("type") == "BROADCAST":
            if cmd.get("visibility") == "command":
                cmd = {**cmd, "command_recipients": srv.admin_guids}
            srv.broadcast_log.append({
                "message": cmd.get("message", ""),
                "visibility": cmd.get("visibility", "guided"),
                "type": cmd.get("broadcast_type", ""),
                "timestamp": time.time(),
            })
            if len(srv.broadcast_log) > 200:
                srv.broadcast_log = srv.broadcast_log[-200:]
        enriched.append(cmd)
    cmds = enriched
    if cmds:
        total_commands_dispatched += len(cmds)
        log.info(f"[{server_id}] >>> DISPATCHING {len(cmds)} commands (total: {total_commands_dispatched})")
    return cmds


# ─── Direct AI Chat ──────────────────────────────────────────────────────
CHAT_COOLDOWN: float = 5.0  # Minimum seconds between chat commands (per-server, tracked in _ServerData.last_chat_time)

@app.post("/api/chat")
async def api_chat(request: Request):
    global total_spawns, ai_thinking
    try:
        body = await request.json()
    except:
        body = {}

    message = body.get("message", "").strip()
    server_id = body.get("server_id") or DEFAULT_SERVER
    srv = get_server(server_id)

    # Rate limit chat commands to prevent spawn spam (per-server)
    now = time.time()
    if now - srv.last_chat_time < CHAT_COOLDOWN:
        remaining = CHAT_COOLDOWN - (now - srv.last_chat_time)
        return {"reply": f"Wait {remaining:.0f}s before sending another command.", "commands": []}
    srv.last_chat_time = now
    # Use this server's state (fallback to global for backward compat)
    _state = srv.state if srv.state else current_state
    _chat_history = srv.chat_history
    _pending = srv.pending_commands

    if not message:
        return {"reply": "No message provided.", "commands": []}

    sm = srv.state_machine

    # --- Code word check ---
    code_effect = sm.check_code_word(message)
    if code_effect == "operation_complete":
        sm.abort()
        reply = "Copy. Operation concluded."
        _chat_history.append({"role": "user", "content": message})
        _chat_history.append({"role": "assistant", "content": reply})
        _save_chat_history(server_id, _chat_history)
        await broadcast("chat_response", {"message": message, "reply": reply, "commands": []}, server_id=server_id)
        return {"reply": reply, "commands": []}
    if code_effect == "abort_extract":
        sm.abort()
        reply = "WILDFIRE acknowledged. All units standing down. Extract immediately."
        _chat_history.append({"role": "user", "content": message})
        _chat_history.append({"role": "assistant", "content": reply})
        _save_chat_history(server_id, _chat_history)
        await broadcast("chat_response", {"message": message, "reply": reply, "commands": []}, server_id=server_id)
        return {"reply": reply, "commands": []}

    # --- Conversational shortcut (no AI needed) ---
    msg_lower = message.lower().strip().rstrip("!?.")
    conversational = msg_lower in ("hi", "hello", "hey", "sup", "yo",
                                   "how are you", "good morning", "good evening",
                                   "thanks", "thank you", "ok", "okay",
                                   "roger", "copy", "understood", "affirmative")
    if conversational:
        n_alive = len([p for p in _state.get("players", []) if p.get("status") == "alive"])
        ai_count = _state.get("ai_units", {}).get("active", 0)
        map_name = clean_map_name(_state.get("map", "Unknown"))
        op_status = ""
        if sm.active_operation:
            phase = sm.active_operation.current_phase()
            op_status = f" Active op: {sm.active_operation.name}"
            if phase:
                op_status += f", Phase {sm.active_operation.phase_index+1}: {phase.name}."
        reply = f"Zeus online. {n_alive} players, {ai_count} OPFOR on {map_name}.{op_status} Standing by."
        _chat_history.append({"role": "user", "content": message})
        _chat_history.append({"role": "assistant", "content": reply})
        _save_chat_history(server_id, _chat_history)
        await broadcast("chat_response", {"message": message, "reply": reply, "commands": []}, server_id=server_id)
        return {"reply": reply, "commands": []}

    # --- Intent classification ---
    players = _state.get("players", [])
    catalog = _state.get("catalog", [])
    classification = classify_intent(message, players)
    intent = classification["intent"]
    target_player = classification["target_player"]
    mod_action = classification["mod_action"]
    log.info(f"Chat intent: {intent} | target: {target_player.get('name') if target_player else None}")

    # --- INFO_QUERY: answer from game state, no AI ---
    if intent == "INFO_QUERY":
        if target_player:
            px = float(target_player.get("pos", {}).get("x", 0))
            pz = float(target_player.get("pos", {}).get("z", target_player.get("pos", {}).get("y", 0)))
            grid = f"{int(px/100):03d}-{int(pz/100):03d}"
            reply = (f"{target_player['name']} is at grid {grid} "
                     f"[{target_player.get('status','?')}] ({target_player.get('faction','?')}).")
        else:
            ai_count = _state.get("ai_units", {}).get("active", 0)
            n_alive = len([p for p in players if p.get("status") == "alive"])
            reply = f"SITREP: {n_alive} players active, {ai_count} OPFOR deployed."
            if sm.active_operation:
                phase = sm.active_operation.current_phase()
                if phase:
                    reply += f" Phase {sm.active_operation.phase_index+1}: {phase.name} — {phase.objective}"
        _chat_history.append({"role": "user", "content": message})
        _chat_history.append({"role": "assistant", "content": reply})
        _save_chat_history(server_id, _chat_history)
        await broadcast("chat_response", {"message": message, "reply": reply, "commands": []}, server_id=server_id)
        return {"reply": reply, "commands": []}

    # --- FRIENDLY_SUPPORT: deterministic support spawn, no AI ---
    if intent == "FRIENDLY_SUPPORT":
        broadcast_mode = sm.active_operation.broadcast_mode if sm.active_operation else "command"
        commands = build_friendly_support_commands(target_player, players, catalog, broadcast_mode)
        if commands:
            _pending.extend(commands)
            spawn_cmd = next((c for c in commands if c["type"] == "SPAWN"), None)
            if spawn_cmd:
                tname = target_player.get("name", "your position") if target_player else "players"
                reply = f"Copy. Sending {spawn_cmd['count']}x {spawn_cmd['units']} to {tname}."
            else:
                reply = "Copy. Support en route."
        else:
            reply = "No friendly units available for that faction in the current catalog."
        _chat_history.append({"role": "user", "content": message})
        _chat_history.append({"role": "assistant", "content": reply})
        _save_chat_history(server_id, _chat_history)
        await broadcast("chat_response", {"message": message, "reply": reply, "commands": commands}, server_id=server_id)
        return {"reply": reply, "commands": commands}

    # --- OPERATION_MOD: update state machine, no AI ---
    if intent == "OPERATION_MOD":
        if mod_action == "abort":
            sm.abort()
            reply = "Operation aborted. All forces standing down."
        elif mod_action == "hold":
            reply = "Hold order acknowledged. Issuing defend behavior to all groups."
            _pending.extend([{"type": "SET_BEHAVIOR", "group_id": "all", "behavior": "defend"}])
        else:
            reply = "Order acknowledged."
        _chat_history.append({"role": "user", "content": message})
        _chat_history.append({"role": "assistant", "content": reply})
        _save_chat_history(server_id, _chat_history)
        await broadcast("chat_response", {"message": message, "reply": reply, "commands": []}, server_id=server_id)
        return {"reply": reply, "commands": []}

    # --- PHASE_ADVANCE: force phase transition, no AI ---
    if intent == "PHASE_ADVANCE":
        if sm.active_operation and sm.state == "ACTIVE":
            sm.advance_phase("chat_override", _pending)
            phase = sm.active_operation.current_phase() if sm.active_operation else None
            if phase:
                reply = f"Phase advanced. Now: {phase.name} — {phase.objective}"
            else:
                reply = "Operation complete."
        else:
            reply = "No active operation to advance."
        _chat_history.append({"role": "user", "content": message})
        _chat_history.append({"role": "assistant", "content": reply})
        _save_chat_history(server_id, _chat_history)
        await broadcast("chat_response", {"message": message, "reply": reply, "commands": []}, server_id=server_id)
        return {"reply": reply, "commands": []}

    # ── ENEMY_ACTION / NEW_OPERATION — call AI (Prompt 4) ──
    log.info(f"Chat: '{message[:100]}' (intent: {intent}, using Prompt 4)")
    current_phase = sm.active_operation.current_phase() if sm.active_operation else None
    messages = build_chat_messages(_state, message, current_phase, _chat_history)
    valid_commands = []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            chat_body = {
                "model": MODEL_NAME,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 1024,
                "top_p": 0.9,
            }
            if BACKEND_MODE == "vllm":
                chat_body["chat_template_kwargs"] = {"enable_thinking": False, "clear_thinking": True}
            resp = await client.post(VLLM_URL, json=chat_body)
            if resp.status_code == 200:
                result = resp.json()
                content = strip_think_tags(result.get("choices", [{}])[0].get("message", {}).get("content", "") or "")
                commands = extract_json_array(content)
                valid_types = {"SPAWN", "MOVE", "EVENT", "DELETE_ALL", "DELETE", "REINFORCE", "SET_BEHAVIOR", "BROADCAST", "INTENT", "PLAN_OP",
                               "SET_WEATHER", "SET_TIME", "FIRE_SUPPORT", "MARKER", "ARTILLERY", "SMOKE", "SET_FORMATION", "SET_SKILL", "SCOUT", "SUPPRESS"}
                for c in (commands or []):
                    ctype = (c.get("type") or "").upper()
                    c["type"] = ctype
                    if ctype not in valid_types:
                        continue
                    if ctype == "BROADCAST":
                        c.setdefault("message", "Zeus: standing by.")
                        c.setdefault("units", ""); c.setdefault("count", 0)
                        c.setdefault("grid", "000-000"); c.setdefault("behavior", "")
                        c.setdefault("faction", ""); c.setdefault("reasoning", "Chat directive")
                        valid_commands.append(c)
                        continue
                    c.setdefault("units", "infantry_patrol")
                    c.setdefault("count", 4)
                    c.setdefault("grid", "050-050")
                    c["grid"] = validate_grid(c["grid"], _state)
                    c.setdefault("behavior", "patrol")
                    c.setdefault("faction", "OPFOR")
                    c.setdefault("reasoning", "Chat order")
                    c["units"] = validate_unit_type(c.get("units", ""), _state, enforce_enemy=True, requested_faction=c.get("faction", ""))
                    valid_commands.append(c)
            else:
                log.warning(f"Chat AI HTTP {resp.status_code} — no valid commands")
    except Exception as e:
        log.error(f"Chat AI call failed: {e}")
    if valid_commands:
        _pending.extend(valid_commands)
        srv.command_history.extend(valid_commands)
        parts = []
        for c in valid_commands:
            ctype = c.get("type", "?")
            if ctype == "SPAWN":
                parts.append(f"Spawning {c.get('count',1)}x {c.get('units','?')} at {c.get('grid','?')} [{c.get('behavior','patrol')}]")
            elif ctype == "MOVE":
                parts.append(f"Moving {c.get('units', c.get('group_id','units'))} to {c.get('grid','?')}")
            elif ctype == "BROADCAST":
                pass  # BROADCAST commands don't generate chat text
            else:
                parts.append(f"{ctype}")
        reply = "Copy. " + ". ".join(parts) + "." if parts else "Copy. Orders acknowledged."
    else:
        reply = "Zeus couldn't generate valid orders. Try a simpler command."
    _chat_history.append({"role": "user", "content": message})
    _chat_history.append({"role": "assistant", "content": reply})
    _save_chat_history(server_id, _chat_history)
    await broadcast("chat_response", {"message": message, "reply": reply, "commands": valid_commands}, server_id=server_id)
    return {"reply": reply, "commands": valid_commands}


@app.post("/chat_event")
async def receive_chat_event(req: ChatEventRequest):
    """Receives player chat forwarded by the game mod.
    Adds to server chat history and broadcasts to dashboard."""
    srv = get_server(req.server_id)
    entry = {
        "role": "user",
        "content": req.message,
        "player": req.player,
        "source": "in_game_chat",
        "timestamp": time.time(),
    }
    srv.ingame_chat_log.append(entry)
    if len(srv.ingame_chat_log) > 50:
        srv.ingame_chat_log[:] = srv.ingame_chat_log[-50:]

    log.info(f"[In-Game Chat] {req.player}: {req.message}")
    await broadcast("chat_message", {
        "player": req.player,
        "message": req.message,
        "source": "in_game",
        "server_id": req.server_id,
    })
    return {"status": "ok"}


# ─── Dashboard API ────────────────────────────────────────────────────────
@app.get("/api/status")
async def api_status():
    up = time.time() - session_start
    # Gather agent-specific stats
    sid = DEFAULT_SERVER
    if _servers:
        # Prefer first real (non-default) server, fallback to whatever is first
        sid = next((s for s in _servers if s != DEFAULT_SERVER), next(iter(_servers)))
    srv = get_server(sid)
    skill_tracker = get_skill_tracker(sid)
    evaluator = get_evaluator(sid)
    dyn_diff = get_dynamic_difficulty(sid)
    planner = get_planner(sid)

    return {
        "bridge": "online", "version": "10.0",
        "servers": get_server_list(),
        "ai_enabled": ai_enabled, "ai_thinking": ai_thinking,
        "query_in_flight": _query_lock.locked(),
        "difficulty": difficulty,
        "effective_difficulty": dyn_diff.current_difficulty,
        "gm_mode": gm_mode,
        "spark_ip": SPARK_IP, "model": MODEL_NAME,
        "escalation": escalation_override if escalation_override >= 0 else 50,
        "escalation_level": escalation_level,
        "escalation_name": ESCALATION_NAMES[escalation_level],
        "uptime_seconds": up,
        "last_state_age": time.time() - last_state_time if last_state_time else None,
        "last_ai_latency_ms": last_ai_latency_ms,
        "total_commands": len(command_history),
        "total_commands_dispatched": total_commands_dispatched,
        "total_spawns": total_spawns,
        "total_heartbeats": total_heartbeats,
        "total_decisions": len(decision_log),
        "pending_commands": len(pending_commands),
        "mission_briefing": mission_briefing,
        "heartbeat_interval": HEARTBEAT_SEC,
        "max_agent_turns": MAX_AGENT_TURNS,
        "current_state": current_state,
        "connected_dashboards": len(connected_ws),
        "valid_grids_count": len(current_state.get("valid_spawn_grids", [])),
        "catalog": get_catalog(current_state),
        "catalog_count": len(get_catalog(current_state)),
        "factions": get_factions(current_state),
        "chat_history": srv.chat_history[-100:] or chat_history[-100:],
        "console_logs": [e for e in console_log_buffer[-200:] if e.get("server_id") in (sid, DEFAULT_SERVER)],
        "server_logs": log_buffer[-50:],
        "recent_commands": command_history[-50:],
        # Agent features
        "agent": {
            "player_skills": {name: {"skill": p["skill_rating"], "threat": p["threat_level"],
                                       "kd": f"{p['kills']}/{p['deaths']}"}
                              for name, p in skill_tracker.players.items()},
            "deployment_success_rate": f"{evaluator.get_success_rate():.0%}",
            "deployment_outcomes": len(evaluator.outcomes),
            "pending_evaluations": len(evaluator.pending_evaluations),
            "dynamic_difficulty": dyn_diff.current_difficulty,
            "difficulty_adjustments": len(dyn_diff.adjustment_history),
            "active_operation": planner.active_op.get("name") if planner.active_op else None,
            "operation_phase": f"{planner.active_op['current_phase']+1}/{len(planner.active_op['phases'])}" if planner.active_op else None,
            "completed_operations": len(planner.completed_ops),
            "chat_directives_active": len(_chat_directives.get(sid, [])),
        },
    }

@app.get("/api/aigm/operation")
async def aigm_operation_status():
    """Return current operation state for the panel."""
    sid = DEFAULT_SERVER
    if _servers:
        sid = next((s for s in _servers if s != DEFAULT_SERVER), next(iter(_servers)))
    sm = get_server(sid).state_machine
    return sm.get_status()


@app.get("/api/aigm/status")
async def aigm_status():
    """Full AI GM status for the panel — extends /api/status with operation, broadcast_log, aar."""
    base = await api_status()
    sid = DEFAULT_SERVER
    if _servers:
        sid = next((s for s in _servers if s != DEFAULT_SERVER), next(iter(_servers)))
    srv = get_server(sid)
    sm = srv.state_machine
    sm_status = sm.get_status()
    op = sm_status.get("operation")
    # Normalize phase_remaining_s → phase_remaining_seconds for panel
    if op and "phase_remaining_s" in op:
        op = {**op, "phase_remaining_seconds": op.pop("phase_remaining_s")}
    base["operation"] = op
    base["broadcast_log"] = srv.broadcast_log[-200:]
    base["aar"] = {
        "phase_results": op.get("phase_results", []) if op else [],
        "event_log": srv.state.get("event_log", []),
    }
    return base


@app.post("/api/aigm/operation/advance")
async def aigm_advance_phase(request: Request):
    """Advance the current operation phase immediately (panel Skip Phase button)."""
    sid = DEFAULT_SERVER
    if _servers:
        sid = next((s for s in _servers if s != DEFAULT_SERVER), next(iter(_servers)))
    srv = get_server(sid)
    sm = srv.state_machine
    if sm.state != "ACTIVE":
        return {"error": f"Cannot advance — operation state is {sm.state}"}
    sm.advance_phase("chat_override", srv.pending_commands)
    return {"ok": True, "state": sm.state}


@app.post("/api/aigm/operation/abort")
async def aigm_abort_operation(request: Request):
    """Abort the current operation and stand down all forces."""
    sid = DEFAULT_SERVER
    if _servers:
        sid = next((s for s in _servers if s != DEFAULT_SERVER), next(iter(_servers)))
    sm = get_server(sid).state_machine
    sm.abort()
    return {"ok": True, "state": sm.state}


@app.post("/api/aigm/config")
async def aigm_config(request: Request):
    """Update AI GM runtime config (broadcast_mode, heartbeat_interval, etc.)."""
    global HEARTBEAT_SEC, session_config
    body = await request.json()
    if "broadcast_mode" in body:
        mode = body["broadcast_mode"]
        if mode not in ("guided", "command", "silent"):
            return {"error": "Invalid broadcast_mode — must be guided, command, or silent"}
        session_config["broadcast_mode"] = mode
    if "heartbeat_interval" in body:
        val = int(body["heartbeat_interval"])
        if 10 <= val <= 300:
            HEARTBEAT_SEC = val
    return {"ok": True}


@app.post("/api/aigm/opord")
async def aigm_opord_save(request: Request):
    """Save a structured OPORD. Does not activate it yet."""
    body = await request.json()
    server_id = body.get("server_id", DEFAULT_SERVER)
    opord = body.get("opord", {})
    if not opord:
        return {"error": "No OPORD data provided"}
    safe_id = server_id.replace("/", "_").replace("\\", "_") or "default"
    path = OPORD_DIR / f"{safe_id}_opord.json"
    path.write_text(json.dumps(opord, indent=2), encoding="utf-8")
    return {"status": "saved"}


@app.get("/api/aigm/opord")
async def aigm_opord_get(request: Request):
    """Return the saved OPORD for this server."""
    server_id = request.query_params.get("server_id", DEFAULT_SERVER)
    safe_id = server_id.replace("/", "_").replace("\\", "_") or "default"
    path = OPORD_DIR / f"{safe_id}_opord.json"
    if not path.exists():
        return {"opord": None}
    try:
        return {"opord": json.loads(path.read_text(encoding="utf-8"))}
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/aigm/opord/parse")
async def aigm_opord_parse(request: Request):
    """Parse the saved OPORD into an executable operation. Activates on state machine."""
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    server_id = body.get("server_id", DEFAULT_SERVER)
    safe_id = server_id.replace("/", "_").replace("\\", "_") or "default"
    srv = get_server(server_id)
    sm = srv.state_machine
    _state = srv.state if srv.state else {}

    path = OPORD_DIR / f"{safe_id}_opord.json"
    if not path.exists():
        return {"error": "No OPORD saved. POST to /api/aigm/opord first."}
    opord = json.loads(path.read_text(encoding="utf-8"))

    try:
        sm.begin_parsing()
        messages = build_opord_parser_messages(opord, _state)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(VLLM_URL, json={
                "model": MODEL_NAME,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 4096,
            })
            if resp.status_code != 200:
                sm.state = "IDLE"
                return {"error": f"AI backend error: {resp.status_code}"}

            result = resp.json()
            content = strip_think_tags(result.get("choices", [{}])[0].get("message", {}).get("content", "") or "")
            op_data = extract_json_object(content)
            if not op_data:
                sm.state = "IDLE"
                return {"error": "Could not parse operation JSON from AI response", "raw": content[:500]}

            phases = [OperationPhase(**{k: v for k, v in p.items() if k in PHASE_FIELDS})
                      for p in op_data.get("phases", []) if isinstance(p, dict) and "name" in p and "objective" in p]
            op = Operation(
                name=op_data.get("name", "OPORD Operation"),
                source="opord",
                phases=phases,
                broadcast_mode=op_data.get("broadcast_mode", "command"),
                commander_intent=op_data.get("commander_intent", ""),
                roe=op_data.get("roe", ""),
                code_words=op_data.get("code_words", {}),
                source_opord=opord,
            )
            sm.set_operation(op)
            log.info(f"OPORD parsed: {op.name}, {len(phases)} phases")
            return {"status": "ok", "operation": sm.get_status()["operation"]}

    except Exception as e:
        sm.state = "IDLE"
        log.error(f"OPORD parse failed: {e}")
        return {"error": str(e)}


@app.delete("/api/aigm/opord")
async def aigm_opord_delete(request: Request):
    """Delete saved OPORD and abort active operation if from OPORD source."""
    server_id = request.query_params.get("server_id", DEFAULT_SERVER)
    safe_id = server_id.replace("/", "_").replace("\\", "_") or "default"
    sm = get_server(server_id).state_machine
    if sm.active_operation and sm.active_operation.source == "opord":
        sm.abort()
    path = OPORD_DIR / f"{safe_id}_opord.json"
    if path.exists():
        path.unlink()
    return {"status": "cleared"}


@app.get("/api/aigm/session-config")
async def aigm_get_session_config():
    """Alias for /api/session-config — used by the AI GM panel tab."""
    return {**session_config, "broadcast_mode": session_config.get("broadcast_mode", "command")}


@app.post("/api/aigm/session-config")
async def aigm_set_session_config(request: Request):
    """Alias for /api/session-config — used by the AI GM panel tab."""
    global session_config
    body = await request.json()
    for key in list(session_config.keys()) + ["broadcast_mode", "heartbeat_interval"]:
        if key in body:
            session_config[key] = body[key]
    return session_config


@app.post("/api/aigm/admin-guids")
async def aigm_set_admin_guids(request: Request):
    """Panel calls this when players join to keep command-visibility recipient list fresh."""
    body = await request.json()
    server_id = body.get("server_id", DEFAULT_SERVER)
    guids = body.get("guids", [])
    if not isinstance(guids, list):
        guids = []
    get_server(server_id).admin_guids = guids
    return {"status": "ok", "count": len(guids)}


@app.post("/command_confirm")
async def receive_command_confirm(request: Request):
    """Receive command execution confirmation from the mod."""
    try:
        body = await request.json()
    except Exception:
        return {"error": "Invalid JSON"}
    server_id = body.get("server_id", DEFAULT_SERVER)
    safe_id = server_id.replace("/", "_").replace("\\", "_") or "default"
    group_id = body.get("group_id", "")
    status = body.get("status", "")
    actual_grid = body.get("actual_grid", "")

    sm = get_server(server_id).state_machine
    if sm.active_operation and group_id:
        phase_idx = sm.active_operation.phase_index
        sm.active_operation.allocated_groups[group_id] = {
            "type": body.get("unit_type", ""),
            "phase": phase_idx,
            "status": status,
            "actual_grid": actual_grid,
        }
        sm.active_operation.save(safe_id)

    log.info(f"Command confirm: {group_id} {status} @ {actual_grid}")
    return {"status": "ok"}


@app.get("/api/decisions")
async def api_decisions(limit: int = 50):
    return decision_log[-limit:]

@app.post("/api/config")
async def api_config(cfg: ConfigUpdate):
    global ai_enabled, difficulty, gm_mode, escalation_override, escalation_level
    if cfg.ai_enabled is not None: ai_enabled = cfg.ai_enabled
    if cfg.difficulty is not None: difficulty = max(0, min(100, cfg.difficulty))
    if cfg.gm_mode is not None and cfg.gm_mode in ("on_demand", "autonomous"):
        gm_mode = cfg.gm_mode
        log.info(f"GM mode changed to: {gm_mode}")
    if cfg.escalation is not None:
        escalation_override = max(0, min(100, cfg.escalation))
        escalation_level = min(4, escalation_override * 5 // 101)
        log.info(f"Escalation override set to {escalation_override} (level: {ESCALATION_NAMES[escalation_level]})")
    await broadcast("config_update", {"ai_enabled": ai_enabled, "difficulty": difficulty, "gm_mode": gm_mode, "escalation": escalation_override})
    return {"ai_enabled": ai_enabled, "difficulty": difficulty, "gm_mode": gm_mode, "escalation": escalation_override}

@app.get("/api/session-config")
async def api_get_session_config():
    """Get current session config (faction rules, map notes). Resets on bridge restart."""
    return session_config

@app.post("/api/session-config")
async def api_set_session_config(request: Request):
    """Update session config. Only provided fields are updated."""
    global session_config
    body = await request.json()
    for key in session_config:
        if key in body:
            session_config[key] = body[key]
    log.info(f"Session config updated: {json.dumps(session_config, default=str)}")
    await broadcast("session_config_update", session_config)
    return session_config

@app.post("/api/session-config/reset")
async def api_reset_session_config():
    """Reset session config to defaults."""
    global session_config
    session_config = {
        "enemy_factions": ["USSR", "FIA"],    # Factions to spawn as enemies (override per session)
        "use_civilians": True,                # Whether to mix in civilian ambiance
        "ai_instructions": [],                # Free-form GM instructions injected each query
    }
    log.info("Session config reset to defaults")
    await broadcast("session_config_update", session_config)
    return session_config

@app.get("/api/model-config")
async def get_model_config():
    """Return current model configuration."""
    return {
        "model": MODEL_NAME,
        "backend_mode": BACKEND_MODE,
        "num_ctx": OLLAMA_NUM_CTX,
        "think_mode": OLLAMA_THINK,
        "kv_cache_type": os.environ.get("OLLAMA_KV_CACHE_TYPE", "f16"),
        "max_tokens": MAX_TOKENS,
    }


class ModelConfigUpdate(BaseModel):
    model: str | None = None
    num_ctx: int | None = None
    think_mode: str | None = None  # "auto" / "on" / "off"
    max_tokens: int | None = None


@app.post("/api/model-config")
async def update_model_config(update: ModelConfigUpdate):
    """Update model configuration at runtime (takes effect on next query)."""
    global MODEL_NAME, OLLAMA_NUM_CTX, OLLAMA_THINK, MAX_TOKENS
    changed = []
    rejected = []
    if update.model is not None:
        MODEL_NAME = update.model
        changed.append(f"model={MODEL_NAME}")
    if update.num_ctx is not None:
        OLLAMA_NUM_CTX = update.num_ctx
        changed.append(f"num_ctx={OLLAMA_NUM_CTX}")
    if update.think_mode is not None:
        if update.think_mode in ("auto", "on", "off"):
            OLLAMA_THINK = update.think_mode
            changed.append(f"think={OLLAMA_THINK}")
        else:
            rejected.append(f"think_mode={update.think_mode!r} (must be auto/on/off)")
    if update.max_tokens is not None:
        MAX_TOKENS = update.max_tokens
        changed.append(f"max_tokens={MAX_TOKENS}")
    log.info(f"Model config updated: {', '.join(changed) or 'no changes'}")
    return {"status": "ok", "changed": changed, **({"rejected": rejected} if rejected else {})}


@app.post("/api/trigger")
async def api_trigger(request: Request):
    try:
        body = await request.json()
    except:
        body = {}
    server_id = body.get("server_id", DEFAULT_SERVER)
    srv = get_server(server_id)
    _state = srv.state if srv.state else current_state
    if not _state:
        raise HTTPException(400, "No game state yet")
    asyncio.create_task(background_query(_state.copy(), server_id=server_id))
    return {"status": "queued"}

@app.post("/api/warmup")
async def api_warmup():
    """Pre-load model into VRAM by sending a trivial request."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            body = {
                "model": MODEL_NAME,
                "messages": [{"role": "user", "content": "Reply OK"}],
                "max_tokens": 5,
            }
            t0 = time.time()
            resp = await client.post(VLLM_URL, json=body)
            latency = (time.time() - t0) * 1000
            log.info(f"Warmup complete ({latency:.0f}ms)")
            return {"status": "ok", "latency_ms": latency}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.post("/api/mission")
async def api_mission(request: Request):
    global mission_briefing
    body = await request.json()
    briefing_text = body.get("briefing", "")
    server_id = body.get("server_id", DEFAULT_SERVER)
    srv = get_server(server_id)
    mission_briefing = briefing_text
    srv.mission_briefing = briefing_text
    log.info(f"[{server_id}] Mission set: {briefing_text[:100]}")
    await broadcast("mission_update", {"briefing": briefing_text}, server_id=server_id)
    _state = srv.state if srv.state else current_state
    if _state and ai_enabled:
        asyncio.create_task(background_query(_state.copy(), server_id=server_id))
    return {"status": "ok", "briefing": briefing_text}

@app.delete("/api/mission")
async def clear_mission():
    global mission_briefing
    mission_briefing = ""
    await broadcast("mission_update", {"briefing": ""})
    return {"status": "cleared"}

@app.post("/api/admin")
async def api_admin(request: Request):
    global total_spawns
    body = await request.json()
    cmd = body.get("command", "")
    # If caller specifies a server_id, target only that server; otherwise fan out to ALL known servers.
    requested_sid = body.get("server_id")
    target_sids = [requested_sid] if requested_sid else (list(_servers.keys()) or [DEFAULT_SERVER])
    srv = get_server(target_sids[0])  # for non-fanout ops
    if cmd == "delete_all":
        delete_cmd = {"type": "DELETE_ALL", "units": "all", "count": 0, "grid": "000-000", "behavior": "none", "faction": "OPFOR", "reasoning": "Admin: delete all AI"}
        for sid in target_sids:
            s = get_server(sid)
            s.pending_commands.clear()
            s.pending_commands.append(dict(delete_cmd))
            await broadcast("admin_command", {"command": "delete_all"}, server_id=sid)
        return {"status": "ok", "action": "delete_all", "servers": target_sids}
    elif cmd == "clear_queue":
        n = len(srv.pending_commands)
        srv.pending_commands.clear()
        return {"status": "ok", "cleared": n}
    elif cmd == "spawn":
        c = {
            "type": "SPAWN",
            "units": body.get("units", "infantry_patrol"),
            "count": body.get("count", 4),
            "grid": body.get("grid", "050-050"),
            "behavior": body.get("behavior", "patrol"),
            "faction": body.get("faction", "OPFOR"),
            "reasoning": "Manual spawn"
        }
        for sid in target_sids:
            s = get_server(sid)
            s.pending_commands.append(dict(c))
            s.command_history.append(dict(c))
        total_spawns += c["count"]
        await broadcast("admin_command", {"command": "spawn", "details": c}, server_id=target_sids[0])
        return {"status": "ok", "action": "spawn", "command": c}
    return {"status": "error", "detail": f"Unknown: {cmd}"}


# ─── Scheduler REST API ───────────────────────────────────────────────────

@app.get("/api/schedule")
async def api_schedule_list():
    """Return all scheduled events with computed next_run."""
    async with _schedule_lock:
        events = _load_schedule()
    return {"events": events}


@app.post("/api/schedule")
async def api_schedule_create(request: Request):
    """Create a new scheduled event. Server assigns a UUID id."""
    body = await request.json()
    async with _schedule_lock:
        events = _load_schedule()
        new_event = {
            "id": str(uuid.uuid4()),
            "name": body.get("name", "Untitled Event"),
            "enabled": body.get("enabled", True),
            "action": body.get("action", "BROADCAST"),
            "params": body.get("params", {}),
            "schedule": body.get("schedule", {"type": "daily", "time": "03:00", "timezone": "UTC"}),
            "warnings": body.get("warnings", {"enabled": False, "minutes": [15, 5, 1], "message": "[Server] Restarting in {N} minutes."}),
            "player_gate": body.get("player_gate", {"enabled": False, "defer_minutes": 30}),
            "next_run_utc": None,
            "last_run": None,
            "log": [],
        }
        # Compute first next_run
        nxt = compute_next_run(new_event)
        new_event["next_run_utc"] = nxt.isoformat() if nxt else None
        events.append(new_event)
        _save_schedule(events)
    log.info(f"[Scheduler] Created event: {new_event['id']} — {new_event['name']}")
    return {"id": new_event["id"], "event": new_event}


@app.put("/api/schedule/{event_id}")
async def api_schedule_update(event_id: str, request: Request):
    """Update an existing event (partial merge). Recomputes next_run."""
    body = await request.json()
    async with _schedule_lock:
        events = _load_schedule()
        for ev in events:
            if ev["id"] == event_id:
                for key in ("name", "enabled", "action", "params", "schedule", "warnings", "player_gate"):
                    if key in body:
                        ev[key] = body[key]
                # Recompute next_run when schedule or enabled changes
                if "schedule" in body or "enabled" in body:
                    nxt = compute_next_run(ev)
                    ev["next_run_utc"] = nxt.isoformat() if nxt else None
                    _warnings_sent.pop(event_id, None)
                _save_schedule(events)
                log.info(f"[Scheduler] Updated event: {event_id}")
                return {"event": ev}
    raise HTTPException(status_code=404, detail=f"Event {event_id} not found")


@app.delete("/api/schedule/{event_id}")
async def api_schedule_delete(event_id: str):
    """Delete a scheduled event."""
    async with _schedule_lock:
        events = _load_schedule()
        before = len(events)
        events = [e for e in events if e["id"] != event_id]
        if len(events) == before:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
        _save_schedule(events)
        _warnings_sent.pop(event_id, None)
    log.info(f"[Scheduler] Deleted event: {event_id}")
    return {"status": "ok"}


@app.post("/api/schedule/{event_id}/run")
async def api_schedule_run(event_id: str):
    """Immediately execute a scheduled event, bypassing schedule/gate logic."""
    async with _schedule_lock:
        events = _load_schedule()
        target = next((e for e in events if e["id"] == event_id), None)
        if not target:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
        event_copy = dict(target)

    log_entry = {"ts": datetime.now(timezone.utc).isoformat(), "action": event_copy["action"], "status": "ok", "message": ""}
    try:
        log_entry["message"] = await _scheduler_execute_action(event_copy)
    except Exception as ex:
        log_entry["status"] = "error"
        log_entry["message"] = str(ex)
        return {"status": "error", "message": str(ex)}

    # Append log entry to persisted event
    async with _schedule_lock:
        events = _load_schedule()
        for ev in events:
            if ev["id"] == event_id:
                ev.setdefault("log", []).append(log_entry)
                if len(ev["log"]) > 100:
                    ev["log"] = ev["log"][-100:]
                ev["last_run"] = log_entry
                break
        _save_schedule(events)

    return {"status": log_entry["status"], "message": log_entry["message"]}


@app.post("/api/schedule/{event_id}/toggle")
async def api_schedule_toggle(event_id: str):
    """Toggle a scheduled event enabled/disabled."""
    async with _schedule_lock:
        events = _load_schedule()
        for ev in events:
            if ev["id"] == event_id:
                ev["enabled"] = not ev.get("enabled", True)
                if ev["enabled"]:
                    nxt = compute_next_run(ev)
                    ev["next_run_utc"] = nxt.isoformat() if nxt else None
                    _warnings_sent.pop(event_id, None)
                _save_schedule(events)
                return {"id": event_id, "enabled": ev["enabled"]}
    raise HTTPException(status_code=404, detail=f"Event {event_id} not found")


# ─── WebSocket ────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    connected_ws.append(ws)
    log.info(f"Dashboard connected ({len(connected_ws)})")

    # Determine first server to show  - prefer real servers over "default"
    server_list = get_server_list()
    first_server_id = next((s["server_id"] for s in server_list if s["server_id"] != DEFAULT_SERVER), server_list[0]["server_id"] if server_list else DEFAULT_SERVER)
    srv = get_server(first_server_id)

    try:
        await ws.send_text(json.dumps({
            "event": "init",
            "data": {
                "servers": server_list,
                "server_id": first_server_id,
                "state": srv.state if srv.state else current_state,
                "ai_enabled": ai_enabled,
                "difficulty": difficulty,
                "gm_mode": gm_mode,
                "escalation": escalation_level,
                "decisions": srv.decision_log[-20:] or decision_log[-20:],
                "mission": srv.mission_briefing or mission_briefing,
                "chat_history": srv.chat_history[-100:] or chat_history[-100:],
                "server_logs": log_buffer[-50:],
                "console_logs": [e for e in console_log_buffer[-100:] if e.get("server_id") in (first_server_id, DEFAULT_SERVER)],
            },
            "ts": time.time()
        }))
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            action = msg.get("action", "")
            if action == "trigger":
                sid = msg.get("server_id", DEFAULT_SERVER)
                _srv = get_server(sid)
                _state = _srv.state if _srv.state else current_state
                if _state:
                    asyncio.create_task(background_query(_state.copy(), server_id=sid))
            elif action == "select_server":
                # Dashboard is switching to a different server  - send that server's state
                sid = msg.get("server_id", DEFAULT_SERVER)
                _srv = get_server(sid)
                await ws.send_text(json.dumps({
                    "event": "init",
                    "data": {
                        "servers": get_server_list(),
                        "server_id": sid,
                        "state": _srv.state if _srv.state else {},
                        "ai_enabled": ai_enabled,
                        "difficulty": difficulty,
                        "gm_mode": gm_mode,
                        "escalation": escalation_level,
                        "decisions": _srv.decision_log[-20:],
                        "mission": _srv.mission_briefing,
                        "chat_history": _srv.chat_history[-10:],
                        "server_logs": log_buffer[-50:],
                        "console_logs": [e for e in console_log_buffer[-100:] if e.get("server_id") in (sid, DEFAULT_SERVER)],
                    },
                    "ts": time.time()
                }))
    except (WebSocketDisconnect, Exception):
        if ws in connected_ws:
            connected_ws.remove(ws)
        log.info(f"Dashboard disconnected ({len(connected_ws)})")


# ─── Server Config API ─────────────────────────────────────────────────
SERVER_CONFIG_PATH = Path(os.environ.get("SERVER_CONFIG", "/opt/arma/configs/config.json"))
SERVER_PROFILE_DIR = Path(os.environ.get("SERVER_PROFILE", "/opt/arma/profile"))

@app.get("/api/server/config")
async def get_server_config():
    """Read the server config.json"""
    try:
        if SERVER_CONFIG_PATH.exists():
            return json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8"))
        return {"error": "Config file not found", "path": str(SERVER_CONFIG_PATH)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/server/config")
async def save_server_config(request: Request):
    """Save the server config.json"""
    try:
        body = await request.json()
        # Backup before save
        if SERVER_CONFIG_PATH.exists():
            backup = SERVER_CONFIG_PATH.with_suffix(".json.bak")
            backup.write_text(SERVER_CONFIG_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        SERVER_CONFIG_PATH.write_text(json.dumps(body, indent=4), encoding="utf-8")
        log.info(f"Server config saved to {SERVER_CONFIG_PATH}")
        return {"status": "ok"}
    except Exception as e:
        log.error(f"Config save error: {e}")
        return {"status": "error", "detail": str(e)}

@app.get("/api/server/mods")
async def get_server_mods():
    """Get current mod list from config"""
    try:
        if SERVER_CONFIG_PATH.exists():
            cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8"))
            mods = cfg.get("game", {}).get("mods", [])
            return {"mods": mods}
        return {"mods": []}
    except Exception as e:
        return {"error": str(e), "mods": []}

@app.post("/api/server/mods")
async def update_server_mods(request: Request):
    """Update mod list in config"""
    try:
        body = await request.json()
        new_mods = body.get("mods", [])
        if SERVER_CONFIG_PATH.exists():
            cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8"))
            # Backup
            backup = SERVER_CONFIG_PATH.with_suffix(".json.bak")
            backup.write_text(SERVER_CONFIG_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            cfg["game"]["mods"] = new_mods
            SERVER_CONFIG_PATH.write_text(json.dumps(cfg, indent=4), encoding="utf-8")
            log.info(f"Mods updated: {len(new_mods)} mods")
            return {"status": "ok", "count": len(new_mods)}
        return {"status": "error", "detail": "Config not found"}
    except Exception as e:
        log.error(f"Mod update error: {e}")
        return {"status": "error", "detail": str(e)}

@app.get("/api/workshop/search")
async def workshop_search(q: str = "", page: int = 1):
    """Search Arma Reforger Workshop by scraping the Next.js SSR page.
    The workshop at reforger.armaplatform.com uses Next.js with server-side
    rendering  - mod data is embedded as JSON in __NEXT_DATA__ script tag."""
    try:
        # The workshop supports ?search= and ?page= query params
        url = f"https://reforger.armaplatform.com/workshop?search={q}&page={page}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
        }
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return {"data": [], "error": f"Workshop returned {resp.status_code}"}

            html = resp.text

            # Extract __NEXT_DATA__ JSON from the page
            marker = '__NEXT_DATA__'
            start = html.find(f'id="{marker}"')
            if start < 0:
                start = html.find(f"id='{marker}'")
            if start < 0:
                return {"data": [], "error": "Could not find workshop data in page"}

            # Find the JSON content between <script> tags
            json_start = html.find('>', start) + 1
            json_end = html.find('</script>', json_start)
            if json_start <= 0 or json_end <= 0:
                return {"data": [], "error": "Could not parse workshop data"}

            next_data = json.loads(html[json_start:json_end])
            page_props = next_data.get("props", {}).get("pageProps", {})
            assets = page_props.get("assets", [])

            # Transform to a clean format for the dashboard
            mods = []
            for asset in assets:
                if not isinstance(asset, dict):
                    continue
                try:
                    # Extract thumbnail from previews (can be dicts or strings)
                    previews = asset.get("previews") or []
                    thumbnail = ""
                    if isinstance(previews, list):
                        for p in previews:
                            if isinstance(p, dict):
                                thumbnail = p.get("url", "") or p.get("image", "") or p.get("path", "")
                            elif isinstance(p, str):
                                thumbnail = p
                            if thumbnail:
                                break

                    # Extract author (can be dict with username, or plain string)
                    author_raw = asset.get("author", "Unknown")
                    if isinstance(author_raw, dict):
                        author = author_raw.get("username") or author_raw.get("name") or "Unknown"
                    else:
                        author = str(author_raw) if author_raw else "Unknown"

                    # Extract tags (can be dicts with name, or plain strings)
                    tags_raw = asset.get("tags") or []
                    tags = []
                    if isinstance(tags_raw, list):
                        for t in tags_raw:
                            if isinstance(t, dict):
                                tags.append(t.get("name") or t.get("label") or str(t))
                            else:
                                tags.append(str(t))

                    mods.append({
                        "id": str(asset.get("id", "")),
                        "name": str(asset.get("name", "Unknown")),
                        "summary": str(asset.get("summary", "")),
                        "author": author,
                        "rating": float(asset.get("averageRating", 0) or 0),
                        "ratingCount": int(asset.get("ratingCount", 0) or 0),
                        "subscribers": int(asset.get("subscriberCount", 0) or 0),
                        "version": str(asset.get("currentVersionNumber", "")),
                        "size": int(asset.get("currentVersionSize", 0) or 0),
                        "thumbnail": thumbnail,
                        "tags": tags,
                        "updatedAt": str(asset.get("updatedAt", "")),
                        "createdAt": str(asset.get("createdAt", "")),
                    })
                except Exception as parse_err:
                    log.warning(f"Skipping malformed workshop asset: {parse_err}")
                    continue

            total = page_props.get("totalCount", len(mods))
            return {"data": mods, "total": total, "page": page, "query": q}

    except json.JSONDecodeError as e:
        log.warning(f"Workshop JSON parse error: {e}")
        return {"data": [], "error": "Failed to parse workshop data"}
    except Exception as e:
        log.warning(f"Workshop search error: {e}")
        return {"data": [], "error": str(e)}


@app.get("/api/server/files")
async def api_server_files(path: str = ""):
    """Browse server directory files. Sandboxed to SERVER_INSTALL_DIR."""
    base = SERVER_INSTALL_DIR.resolve()
    target = (base / path).resolve() if path else base

    # Security: prevent path traversal outside server directory
    if not str(target).startswith(str(base)):
        return {"error": "Access denied  - path outside server directory"}

    if not target.exists():
        return {"error": f"Path not found: {path}"}

    if target.is_file():
        # Return file content (text files only, capped at 512KB)
        try:
            size = target.stat().st_size
            if size > 512 * 1024:
                return {"error": f"File too large ({size:,} bytes). Max 512KB.", "name": target.name, "size": size}
            content = target.read_text(encoding="utf-8", errors="replace")
            return {
                "type": "file",
                "name": target.name,
                "path": str(target.relative_to(base)),
                "size": size,
                "content": content,
                "modified": target.stat().st_mtime,
            }
        except Exception as e:
            return {"error": str(e)}

    # Directory listing
    entries = []
    try:
        for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            stat = item.stat()
            entries.append({
                "name": item.name,
                "path": str(item.relative_to(base)),
                "is_dir": item.is_dir(),
                "size": stat.st_size if item.is_file() else None,
                "modified": stat.st_mtime,
            })
    except PermissionError:
        return {"error": "Permission denied"}

    return {
        "type": "directory",
        "path": str(target.relative_to(base)) if target != base else "",
        "parent": str(target.parent.relative_to(base)) if target != base else None,
        "entries": entries,
    }


@app.get("/api/server/file-content")
async def api_server_file_content(path: str):
    """Read a specific file's content. Sandboxed to SERVER_INSTALL_DIR."""
    base = SERVER_INSTALL_DIR.resolve()
    target = (base / path).resolve()
    if not str(target).startswith(str(base)):
        return {"error": "Access denied"}
    if not target.exists() or not target.is_file():
        return {"error": "File not found"}
    size = target.stat().st_size
    if size > 512 * 1024:
        return {"error": f"File too large ({size:,} bytes)"}
    try:
        return {"content": target.read_text(encoding="utf-8", errors="replace"), "name": target.name, "size": size}
    except Exception as e:
        return {"error": str(e)}


# ─── RCON API ────────────────────────────────────────────────────────────────
@app.get("/api/rcon/status")
async def api_rcon_status():
    """RCON connection status and recent log."""
    return {
        "connected": _rcon.connected,
        "authenticated": _rcon.authenticated,
        "host": _rcon.host,
        "port": _rcon.port,
        "error": _rcon.last_error or None,
        "log": _rcon._log[-200:],
    }

@app.post("/api/rcon/command")
async def api_rcon_command(request: Request):
    """Send an RCON command and return the server's response."""
    body = await request.json()
    command = body.get("command", "").strip()
    if not command:
        raise HTTPException(400, "command is required")
    output = await _rcon.send_command(command)
    return {"output": output}

@app.post("/api/rcon/connect")
async def api_rcon_connect():
    """Connect or reconnect RCON using credentials from config.json."""
    try:
        cfg = {}
        if SERVER_CONFIG_PATH.exists():
            cfg = json.loads(SERVER_CONFIG_PATH.read_text(encoding="utf-8")).get("rcon", {})
        password = cfg.get("password", "")
        if not password:
            return {"status": "error", "detail": "No RCON password found in config.json (rcon.password)"}
        host = cfg.get("address") or "127.0.0.1"
        port = int(cfg.get("port", 16666))
        await _rcon.connect(host, port, password)
        return {"status": "ok", "host": host, "port": port}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/api/servers")
async def api_servers():
    """List all known game servers with status."""
    return get_server_list()

@app.get("/api/console-logs/{server_id}")
async def api_console_logs(server_id: str, lines: int = 200):
    """Get recent console log entries for a server."""
    entries = [e for e in console_log_buffer if e.get("server_id") == server_id]
    return entries[-lines:]


# ─── Game Server Process Management ──────────────────────────────────
def _detect_server_running() -> bool:
    """Check if ArmaReforgerServer is already running (not launched by us)."""
    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {SERVER_EXE.name}", "/NH"],
            capture_output=True, text=True, timeout=5
        )
        return SERVER_EXE.name.lower() in result.stdout.lower()
    except Exception:
        return False


def _get_server_status() -> dict:
    """Get current server process status."""
    global _server_process, _server_status, _server_pid
    running = False

    if _server_process is not None:
        poll = _server_process.poll()
        if poll is None:
            running = True
            _server_pid = _server_process.pid
        else:
            _server_process = None
            _server_pid = None
            _server_status = "stopped"
    else:
        running = _detect_server_running()
        if running and _server_status in ("unknown", "stopped"):
            _server_status = "running"
        elif not running and _server_status not in ("updating", "starting"):
            _server_status = "stopped"

    return {
        "status": _server_status if _server_status != "unknown" else ("running" if running else "stopped"),
        "running": running or _server_status == "running",
        "pid": _server_pid,
        "exe_path": str(SERVER_EXE),
        "exe_exists": SERVER_EXE.exists(),
        "config_path": str(SERVER_CONFIG_PATH),
        "config_exists": SERVER_CONFIG_PATH.exists(),
        "install_dir": str(SERVER_INSTALL_DIR),
        "steamcmd_exists": STEAMCMD_EXE.exists(),
    }


@app.get("/api/server/status")
async def api_server_status():
    """Get game server process status."""
    return _get_server_status()


async def _do_server_start(profile_dir: str | None = None, max_fps: int = 60, extra_args: list | None = None) -> dict:
    """Core server start logic. Returns result dict. Called by API endpoint and scheduler."""
    global _server_process, _server_status, _server_pid, _stdout_fh

    if _detect_server_running():
        return {"status": "already_running", "message": "Server is already running"}

    if not SERVER_EXE.exists():
        return {"status": "error", "message": f"Server executable not found: {SERVER_EXE}"}

    if not SERVER_CONFIG_PATH.exists():
        return {"status": "error", "message": f"Config not found: {SERVER_CONFIG_PATH}"}

    try:
        cmd = [str(SERVER_EXE), "-config", str(SERVER_CONFIG_PATH)]
        cmd.extend(["-profile", profile_dir or str(SERVER_PROFILE_DIR)])
        cmd.extend(["-maxFPS", str(max_fps)])
        if extra_args:
            cmd.extend(extra_args)

        log.info(f"Starting server: {' '.join(cmd)}")
        _server_status = "starting"
        await broadcast("server_process", {"status": "starting"})

        log_file = SERVER_PROFILE_DIR / "server_stdout.log"
        SERVER_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        _stdout_fh = open(log_file, "a", encoding="utf-8", errors="replace")
        _server_process = subprocess.Popen(
            cmd,
            cwd=str(SERVER_INSTALL_DIR),
            stdout=_stdout_fh,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
        )
        _server_pid = _server_process.pid
        _server_status = "running"

        _event_loop = asyncio.get_running_loop()
        def _tail_stdout():
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    f.seek(0, 2)
                    while _server_process is not None and _server_process.poll() is None:
                        line = f.readline()
                        if line:
                            stripped = line.rstrip()
                            if not stripped:
                                continue
                            ll = stripped.upper()
                            level = "INFO"
                            if "ERROR" in ll or "FATAL" in ll:
                                level = "ERROR"
                            elif "WARNING" in ll or "WARN" in ll:
                                level = "WARNING"
                            elif "DEBUG" in ll:
                                level = "DEBUG"
                            entry = {
                                "time": datetime.now().strftime("%H:%M:%S"),
                                "level": level,
                                "msg": stripped[:500],
                                "source": "game",
                                "server_id": _active_stdout_server_id,
                            }
                            with _console_lock:
                                console_log_buffer.append(entry)
                                if len(console_log_buffer) > CONSOLE_LOG_MAX:
                                    console_log_buffer[:] = console_log_buffer[-CONSOLE_LOG_MAX:]
                            try:
                                asyncio.run_coroutine_threadsafe(
                                    broadcast("console_log", entry, server_id=_active_stdout_server_id),
                                    _event_loop
                                )
                            except Exception:
                                pass
                        else:
                            time.sleep(0.25)
            except Exception as e:
                log.warning(f"Stdout tail thread error: {e}")
        threading.Thread(target=_tail_stdout, daemon=True).start()

        log.info(f"Server started (PID: {_server_pid})")
        await broadcast("server_process", {"status": "running", "pid": _server_pid})
        return {"status": "ok", "pid": _server_pid, "message": "Server started"}

    except Exception as e:
        _server_status = "stopped"
        log.error(f"Failed to start server: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/server/start")
async def api_server_start(request: Request):
    """Start the Arma Reforger dedicated server."""
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    return await _do_server_start(
        profile_dir=body.get("profile_dir"),
        max_fps=body.get("max_fps", 60),
        extra_args=body.get("extra_args"),
    )


@app.post("/api/server/stop")
async def api_server_stop():
    """Stop the Arma Reforger dedicated server."""
    global _server_process, _server_status, _server_pid, _stdout_fh

    if not _detect_server_running() and _server_process is None:
        return {"status": "already_stopped", "message": "Server is not running"}

    _server_status = "stopping"
    await broadcast("server_process", {"status": "stopping"})

    try:
        pid = _server_pid or (_server_process.pid if _server_process else None)

        if os.name == 'nt':
            # Step 1: Graceful shutdown  - taskkill without /F sends WM_CLOSE
            log.info(f"Sending graceful shutdown to {SERVER_EXE.name}...")
            subprocess.run(
                ["taskkill", "/IM", SERVER_EXE.name],
                capture_output=True, timeout=10
            )

            # Step 2: Wait for the process to exit cleanly
            stopped = False
            for i in range(20):  # Wait up to 20 seconds
                await asyncio.sleep(1)
                if _server_process is not None:
                    if _server_process.poll() is not None:
                        stopped = True
                        break
                elif not _detect_server_running():
                    stopped = True
                    break
                if i == 9:
                    log.info("Still waiting for server to shut down...")

            # Step 3: Force terminate if graceful shutdown didn't work
            if not stopped:
                log.warning("Server didn't stop gracefully after 20s, force terminating...")
                subprocess.run(
                    ["taskkill", "/F", "/IM", SERVER_EXE.name],
                    capture_output=True, timeout=10
                )
                await asyncio.sleep(2)
        else:
            # Linux: SIGTERM then SIGKILL
            if _server_process is not None:
                _server_process.terminate()
                try:
                    _server_process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    log.warning("Server didn't stop gracefully, killing...")
                    _server_process.kill()
                    _server_process.wait(timeout=5)
            else:
                subprocess.run(["pkill", "-f", SERVER_EXE.name],
                               capture_output=True, timeout=10)

        _server_process = None
        _server_pid = None
        _server_status = "stopped"
        # Close stdout file handle to prevent leak
        if _stdout_fh is not None:
            try:
                _stdout_fh.close()
            except Exception:
                pass
            _stdout_fh = None
        log.info("Server stopped")
        await broadcast("server_process", {"status": "stopped"})
        return {"status": "ok", "message": "Server stopped"}

    except Exception as e:
        # Last resort: force kill no matter what
        try:
            subprocess.run(["taskkill", "/F", "/IM", SERVER_EXE.name],
                           capture_output=True, timeout=10)
        except Exception:
            pass
        _server_process = None
        _server_pid = None
        _server_status = "stopped"
        if _stdout_fh is not None:
            try:
                _stdout_fh.close()
            except Exception:
                pass
            _stdout_fh = None
        log.error(f"Failed to stop server cleanly: {e}")
        return {"status": "ok", "message": f"Server force-killed ({e})"}


async def _do_server_restart(check_updates: bool = False) -> dict:
    """Core restart logic. Called by API endpoint and scheduler."""
    if _detect_server_running() or _server_process is not None:
        log.info("Scheduler restart: stopping server...")
        await api_server_stop()
        await asyncio.sleep(3)

    if check_updates and STEAMCMD_EXE.exists():
        log.info("Scheduler restart: checking for updates...")
        result = await _run_server_update()
        if result.get("status") == "error":
            log.warning(f"Update check failed: {result.get('message')}")

    log.info("Scheduler restart: starting server...")
    return await _do_server_start()


@app.post("/api/server/restart")
async def api_server_restart(request: Request):
    """Restart the server. Optionally check for updates first."""
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    try:
        return await _do_server_restart(check_updates=body.get("check_updates", False))
    except Exception as e:
        log.error(f"Restart failed: {e}")
        return {"status": "error", "message": str(e)}


async def _run_server_update() -> dict:
    """Run SteamCMD to update the game server."""
    global _server_status, _update_log
    if not STEAMCMD_EXE.exists():
        return {"status": "error", "message": f"SteamCMD not found: {STEAMCMD_EXE}"}

    _server_status = "updating"
    _update_log = []
    await broadcast("server_process", {"status": "updating"})

    try:
        cmd = [
            str(STEAMCMD_EXE),
            "+force_install_dir", str(SERVER_INSTALL_DIR),
            "+login", "anonymous",
            "+app_update", STEAM_APP_ID, "validate",
            "+quit"
        ]
        log.info(f"Running SteamCMD update: {' '.join(cmd)}")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip()
            if text:
                _update_log.append(text)
                log.info(f"[SteamCMD] {text}")
                await broadcast("server_update_log", {"line": text})

        await proc.wait()

        success = proc.returncode == 0
        _server_status = "stopped"
        result = {
            "status": "ok" if success else "error",
            "return_code": proc.returncode,
            "log": _update_log[-20:],
            "message": "Update complete" if success else f"SteamCMD exited with code {proc.returncode}",
        }
        await broadcast("server_process", {"status": "stopped", "update_result": result})
        return result

    except Exception as e:
        _server_status = "stopped"
        return {"status": "error", "message": str(e)}


@app.post("/api/server/update")
async def api_server_update():
    """Update the game server via SteamCMD. Server must be stopped."""
    if _detect_server_running():
        return {"status": "error", "message": "Stop the server before updating"}

    return await _run_server_update()


@app.get("/api/server/update-log")
async def api_update_log():
    """Get the SteamCMD update log."""
    return {"log": _update_log}


# ─── Ollama Health / Speed Diagnostics ───────────────────────────────
@app.get("/api/ollama/health")
async def api_ollama_health():
    """Check AI backend (Ollama or vLLM) connectivity and return model info."""
    try:
        t0 = time.time()
        async with httpx.AsyncClient(timeout=10) as client:
            if BACKEND_MODE == "ollama":
                # Ollama native: /api/tags gives full model list with sizes
                tags_resp = await client.get(f"{VLLM_BASE}/api/tags")
                latency = (time.time() - t0) * 1000
                if tags_resp.status_code != 200:
                    return {"status": "error", "reachable": False, "message": f"HTTP {tags_resp.status_code}"}

                models = tags_resp.json().get("models", [])
                model_names = [m.get("name", "") for m in models]
                model_found = any(MODEL_NAME in n for n in model_names)
                model_info = next((m for m in models if MODEL_NAME in m.get("name", "")), {})
                size_gb = round(model_info.get("size", 0) / 1e9, 1) if model_info.get("size") else 0
                ctx_len = int(os.environ.get("OLLAMA_CONTEXT_LENGTH", "8192"))

                # GPU info via nvidia-smi
                hw = "RTX 4080 16GB"
                try:
                    import subprocess
                    r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total",
                                        "--format=csv,noheader"], capture_output=True, text=True, timeout=2)
                    if r.returncode == 0:
                        hw = r.stdout.strip().replace(", ", " / ")
                except Exception:
                    pass

                kv_type = os.environ.get("OLLAMA_KV_CACHE_TYPE", "f16")
                flash = os.environ.get("OLLAMA_FLASH_ATTENTION", "0") == "1"
                features = ["Direct JSON Output", "OPORD Planning", "Military Doctrine", "Think-tag Stripping"]
                if flash:
                    features.append("Flash Attention")
                if kv_type != "f16":
                    features.append(f"KV Cache {kv_type.upper()}")

                return {
                    "status": "ok",
                    "reachable": True,
                    "latency_ms": round(latency, 1),
                    "model_name": MODEL_NAME,
                    "model_found": model_found,
                    "model_root": model_info.get("name", MODEL_NAME),
                    "max_model_len": ctx_len,
                    "total_models": len(models),
                    "model_size_gb": size_gb,
                    "ollama_url": VLLM_BASE,
                    "engine": "ollama",
                    "kv_cache_type": kv_type,
                    "flash_attention": flash,
                    "features": features,
                    "hardware": hw,
                    "spark_ip": SPARK_IP,
                }
            else:
                # vLLM path
                resp = await client.get(f"{VLLM_BASE}/v1/models")
                latency = (time.time() - t0) * 1000
                if resp.status_code != 200:
                    return {"status": "error", "reachable": False, "message": f"HTTP {resp.status_code}"}

                data = resp.json()
                models = data.get("data", [])
                model_ids = [m.get("id", "") for m in models]
                model_found = any(MODEL_NAME in mid for mid in model_ids)
                model_info = next((m for m in models if MODEL_NAME in m.get("id", "")), {})
                max_model_len = model_info.get("max_model_len", 0)
                model_root = model_info.get("root", MODEL_NAME)

                return {
                    "status": "ok",
                    "reachable": True,
                    "latency_ms": round(latency, 1),
                    "model_name": MODEL_NAME,
                    "model_found": model_found,
                    "model_root": model_root,
                    "max_model_len": max_model_len,
                    "total_models": len(models),
                    "ollama_url": VLLM_BASE,
                    "engine": "vllm",
                    "features": ["Tool Calling", "OPORD Planning", "Agent Loop", "Military Doctrine"],
                    "hardware": "DGX Spark - Grace Blackwell 128GB Unified Memory",
                    "spark_ip": SPARK_IP,
                }
    except httpx.ConnectError:
        return {"status": "error", "reachable": False, "message": f"Cannot connect to AI backend at {VLLM_BASE}"}
    except Exception as e:
        return {"status": "error", "reachable": False, "message": str(e)}


# ─── Startup: warmup + log tailing initialized via lifespan ───────────


async def _auto_warmup():
    """Auto-warmup: verify vLLM is reachable and model is loaded."""
    await asyncio.sleep(2)  # Let the server finish starting
    log.info(f"Checking vLLM at {VLLM_BASE} for model {MODEL_NAME}...")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            # First check if vLLM is up
            resp = await client.get(f"{VLLM_BASE}/v1/models")
            if resp.status_code == 200:
                models = resp.json().get("data", [])
                model_ids = [m.get("id", "") for m in models]
                log.info(f"vLLM online. Available models: {model_ids}")
            else:
                log.warning(f"vLLM health check returned HTTP {resp.status_code}")
                return

            # Quick warmup query
            body = {
                "model": MODEL_NAME,
                "messages": [{"role": "user", "content": "Reply OK"}],
                "max_tokens": 5,
            }
            t0 = time.time()
            resp = await client.post(VLLM_URL, json=body)
            latency = (time.time() - t0) * 1000
            if resp.status_code == 200:
                log.info(f"vLLM warmup complete in {latency:.0f}ms - ready for queries")
            else:
                log.warning(f"Warmup failed: HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        log.warning(f"Auto-warmup failed (vLLM may be offline): {e}")


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    p = Path("dashboard.html")
    return p.read_text(encoding="utf-8") if p.exists() else "<h1>dashboard.html not found</h1>"


if __name__ == "__main__":
    print("=" * 65)
    print("  AI GAME MASTER BRIDGE v10.0 - TACTICAL ZEUS (vLLM Agent)")
    print(f"  Model:      {MODEL_NAME} @ {VLLM_BASE}")
    print(f"  Engine:     vLLM (OpenAI-compatible, tool calling enabled)")
    print(f"  Dashboard:  http://localhost:{BRIDGE_PORT}")
    print(f"  GM Mode:    {gm_mode}")
    print(f"  Heartbeat:  {HEARTBEAT_SEC}s")
    print(f"  Agent Loop: {MAX_AGENT_TURNS} turns max")
    print(f"  Tools:      19 (spawn/move/delete/reinforce/behavior/broadcast/plan/assess/intent/weather/time/fire_support/marker/artillery/smoke/suppress/formation/skill/scout)")
    print(f"  GM Mode:    Operation-based (OPORD planning, environment building, phased scenarios)")
    print(f"  Features:   Agent Loop | Operations | Skill Tracking | Dynamic Difficulty")
    print("=" * 65)
    uvicorn.run(app, host="0.0.0.0", port=BRIDGE_PORT)
