# Server Event Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-featured server event scheduler with 9 action types, 4 schedule patterns, local-timezone UI, RCON pre-warnings, player-aware gates, and a polished tab in the Server view.

**Architecture:** Backend is a 60-second asyncio loop (`SchedulerEngine`) in `bridge.py` that reads/writes `schedule.json`, executes actions by calling internal helpers (no loopback HTTP), and broadcasts results over WebSocket. Frontend is a self-contained `SchedulerTab` component added to the existing `server-config.tsx` tabs, with its own 30-second polling and local-timezone rendering.

**Tech Stack:** Python 3.12 asyncio + `zoneinfo` (stdlib), FastAPI, React 19, TypeScript, Tailwind CSS v4.

---

## File Map

| File | Change |
|------|--------|
| `bridge.py` | Add imports, `SCHEDULE_PATH`, `_do_server_start()`, `_do_server_restart()`, `compute_next_run()`, `_scheduler_execute_action()`, `SchedulerEngine` class, 6 REST endpoints, startup task |
| `src/components/dashboard/server-config.tsx` | Add `scheduler` tab to `TABS`, add `SchedulerTab` component and all supporting types/subcomponents |
| `src/hooks/use-bridge.ts` | No change needed — `scheduler_event` WS message goes directly to server-config polling |

---

## Task 1: Add imports + config + schedule file helpers to bridge.py

**Files:**
- Modify: `bridge.py` (imports block ~line 38, config block ~line 52)

- [ ] **Step 1: Add imports**

Find the existing imports block (line 38):
```python
import asyncio, json, logging, os, time, re, random, math, threading
import struct, zlib
from datetime import datetime, timezone
```

Replace with:
```python
import asyncio, json, logging, os, time, re, random, math, threading
import struct, zlib, uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
```

- [ ] **Step 2: Add SCHEDULE_PATH config and lock**

Find the block after `DATA_DIR = Path("./data")` (around line 109):
```python
DATA_DIR  = Path("./data")
DECISION_LOG = LOG_DIR / "decisions.jsonl"
```

Add after `DATA_DIR`:
```python
SCHEDULE_PATH = Path(os.environ.get("SCHEDULE_PATH", "./data/schedule.json"))
_schedule_lock = asyncio.Lock()
_warnings_sent: dict[str, set[int]] = {}  # event_id -> set of warning minutes already sent
```

- [ ] **Step 3: Add `_load_schedule` and `_save_schedule` helpers**

Add these two functions after the `get_server_list()` function (around line 290, before the log tailing section):

```python
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
```

- [ ] **Step 4: Type-check**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1
```

Expected: clean (no new TS errors introduced)

- [ ] **Step 5: Commit**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
git add bridge.py
git commit -m "feat(scheduler): add imports, SCHEDULE_PATH config, load/save helpers"
```

---

## Task 2: Extract `_do_server_start` and `_do_server_restart` helpers

**Files:**
- Modify: `bridge.py` (~line 4828 `api_server_start`, ~line 5033 `api_server_restart`)

The scheduler needs to start/restart the server without a FastAPI `Request` object. Extract the core logic into standalone async functions.

- [ ] **Step 1: Add `_do_server_start` before `api_server_start`**

Find the line `@app.post("/api/server/start")` (around line 4828) and insert this function immediately above it:

```python
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
```

- [ ] **Step 2: Simplify `api_server_start` to call `_do_server_start`**

Replace the body of `api_server_start` (the existing function that spans ~line 4829 to ~4938, keeping only the decorator and the thin wrapper):

```python
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
```

- [ ] **Step 3: Add `_do_server_restart` before `api_server_restart`**

Find `@app.post("/api/server/restart")` (around line 5033) and insert immediately above it:

```python
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
```

- [ ] **Step 4: Simplify `api_server_restart` to call `_do_server_restart`**

Replace the body of the existing `api_server_restart` function:

```python
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
```

- [ ] **Step 5: Verify bridge starts cleanly**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python -c "import bridge; print('import ok')"
```

Expected: `import ok` (no syntax errors)

- [ ] **Step 6: Commit**

```bash
git add bridge.py
git commit -m "refactor(server): extract _do_server_start and _do_server_restart helpers"
```

---

## Task 3: Add `compute_next_run` and `_scheduler_execute_action`

**Files:**
- Modify: `bridge.py` (add after the `_save_schedule` helper from Task 1)

- [ ] **Step 1: Add `compute_next_run`**

Add immediately after `_save_schedule`:

```python
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
```

- [ ] **Step 2: Add `_scheduler_set_config` helper**

Add immediately after `compute_next_run`:

```python
async def _scheduler_set_config(ai_enabled: bool | None = None, difficulty: int | None = None,
                                 escalation_override_val: int | None = None) -> None:
    """Update global AI config from scheduler context and broadcast."""
    global ai_enabled as _ai_enabled, difficulty as _difficulty, escalation_override, escalation_level
    if ai_enabled is not None:
        _ai_enabled = ai_enabled
    if difficulty is not None:
        _difficulty = max(0, min(100, difficulty))
    if escalation_override_val is not None:
        escalation_override = max(0, min(100, escalation_override_val))
        escalation_level = min(4, escalation_override * 5 // 101)
    await broadcast("config_update", {
        "ai_enabled": _ai_enabled,
        "difficulty": _difficulty,
        "gm_mode": gm_mode,
        "escalation": escalation_override,
    })
```

> **Note**: Python doesn't allow `global ai_enabled as _ai_enabled`. Instead, use the actual global names directly:

```python
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
```

- [ ] **Step 3: Add `_scheduler_execute_action`**

Add immediately after `_scheduler_set_config`:

```python
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
```

- [ ] **Step 4: Verify syntax**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python -c "import bridge; print('ok')"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add bridge.py
git commit -m "feat(scheduler): add compute_next_run, _scheduler_set_config, _scheduler_execute_action"
```

---

## Task 4: Add `SchedulerEngine` class

**Files:**
- Modify: `bridge.py` (add after `_scheduler_execute_action`)

- [ ] **Step 1: Add the class**

```python
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
```

- [ ] **Step 2: Register in lifespan**

Find the lifespan function (line 192):
```python
async def lifespan(app):
    # Startup
    ...
    asyncio.create_task(_log_tail_loop())
    log.info("Log tail background task started")
    asyncio.create_task(_auto_warmup())
    asyncio.create_task(_rcon_auto_connect())
    yield
```

Add the scheduler task:
```python
    asyncio.create_task(_log_tail_loop())
    log.info("Log tail background task started")
    asyncio.create_task(_auto_warmup())
    asyncio.create_task(_rcon_auto_connect())
    asyncio.create_task(_scheduler.run())
    log.info("Scheduler engine started")
    yield
```

- [ ] **Step 3: Verify syntax**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python -c "import bridge; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add bridge.py
git commit -m "feat(scheduler): add SchedulerEngine class and startup task"
```

---

## Task 5: Add REST endpoints for the scheduler

**Files:**
- Modify: `bridge.py` (add a new section before the WebSocket endpoint at line ~4417)

- [ ] **Step 1: Add the 6 scheduler REST endpoints**

Find the line `# ─── WebSocket ─────` (around line 4417) and insert this entire block immediately before it:

```python
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
```

- [ ] **Step 2: Verify syntax**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python -c "import bridge; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add bridge.py
git commit -m "feat(scheduler): add 6 REST endpoints (CRUD + run + toggle)"
```

---

## Task 6: Add SchedulerTab types + skeleton to server-config.tsx

**Files:**
- Modify: `src/components/dashboard/server-config.tsx`

- [ ] **Step 1: Add TypeScript interfaces**

Find the top of `server-config.tsx` after the existing interfaces (around line 90, before `export function ServerConfig`). Add:

```typescript
// ─── Scheduler Types ──────────────────────────────────────────────────────

type ScheduleType = "daily" | "weekly" | "interval" | "one_time";
type ScheduleAction =
  | "RESTART" | "RESTART_UPDATE" | "BROADCAST" | "WARMUP"
  | "CLEAR_AI" | "RESET_ESCALATION" | "SET_DIFFICULTY" | "MISSION_RESET" | "AI_TOGGLE";

interface ScheduleConfig {
  type: ScheduleType;
  time?: string;          // "HH:MM"
  timezone?: string;      // IANA name
  days?: string[];        // ["mon","tue","wed","thu","fri","sat","sun"]
  interval_hours?: number;
  datetime_utc?: string;  // ISO-8601 for one_time
}

interface WarningConfig {
  enabled: boolean;
  minutes: number[];      // [15, 5, 1]
  message: string;
}

interface PlayerGateConfig {
  enabled: boolean;
  defer_minutes: number;
}

interface ScheduleLogEntry {
  ts: string;
  action: string;
  status: "ok" | "skipped" | "error";
  message: string;
}

interface ScheduledEvent {
  id: string;
  name: string;
  enabled: boolean;
  action: ScheduleAction;
  params: Record<string, unknown>;
  schedule: ScheduleConfig;
  warnings: WarningConfig;
  player_gate: PlayerGateConfig;
  next_run_utc: string | null;
  last_run: ScheduleLogEntry | null;
  log: ScheduleLogEntry[];
}

const ACTION_LABELS: Record<ScheduleAction, string> = {
  RESTART: "Restart Server",
  RESTART_UPDATE: "Update + Restart",
  BROADCAST: "Broadcast Message",
  WARMUP: "AI Model Warmup",
  CLEAR_AI: "Clear All AI",
  RESET_ESCALATION: "Reset Escalation",
  SET_DIFFICULTY: "Set Difficulty",
  MISSION_RESET: "Reset Mission",
  AI_TOGGLE: "Toggle AI GM",
};

const ACTION_COLORS: Record<ScheduleAction, string> = {
  RESTART: "text-[#eab308] border-[#eab308]/20 bg-[#eab308]/[0.08]",
  RESTART_UPDATE: "text-[#8b5cf6] border-[#8b5cf6]/20 bg-[#8b5cf6]/[0.08]",
  BROADCAST: "text-[#22d3ee] border-[#22d3ee]/20 bg-[#22d3ee]/[0.08]",
  WARMUP: "text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/[0.08]",
  CLEAR_AI: "text-[#ef4444] border-[#ef4444]/20 bg-[#ef4444]/[0.08]",
  RESET_ESCALATION: "text-[#f97316] border-[#f97316]/20 bg-[#f97316]/[0.08]",
  SET_DIFFICULTY: "text-[#22d3ee] border-[#22d3ee]/20 bg-[#22d3ee]/[0.08]",
  MISSION_RESET: "text-[#6b6b80] border-white/[0.1] bg-white/[0.04]",
  AI_TOGGLE: "text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/[0.08]",
};

const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S"
};

const COMMON_TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Europe/Moscow", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
];

function formatTimeUntil(isoUtc: string | null): string {
  if (!isoUtc) return "—";
  const diff = new Date(isoUtc).getTime() - Date.now();
  if (diff <= 0) return "Due now";
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatUtcAsLocal(isoUtc: string | null, tz: string): string {
  if (!isoUtc) return "—";
  try {
    return new Date(isoUtc).toLocaleString("en-US", {
      timeZone: tz,
      hour: "2-digit", minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
  } catch {
    return isoUtc;
  }
}

function scheduleLabel(event: ScheduledEvent): string {
  const { schedule } = event;
  const tz = schedule.timezone || "UTC";
  switch (schedule.type) {
    case "daily":
      return `Daily at ${schedule.time} ${tz}`;
    case "weekly": {
      const days = (schedule.days || []).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
      return `${days} at ${schedule.time} ${tz}`;
    }
    case "interval":
      return `Every ${schedule.interval_hours}h`;
    case "one_time":
      return `Once: ${formatUtcAsLocal(schedule.datetime_utc || null, tz)}`;
    default:
      return "Unknown schedule";
  }
}
```

- [ ] **Step 2: Add the scheduler tab to `TABS` array**

Find:
```typescript
  const TABS = [
    { id: "controls" as const, label: "Controls" },
    { id: "rcon" as const, label: "RCON" },
```

Replace with:
```typescript
  const TABS = [
    { id: "controls" as const, label: "Controls" },
    { id: "scheduler" as const, label: "Schedule" },
    { id: "rcon" as const, label: "RCON" },
```

- [ ] **Step 3: Add `"scheduler"` to the `activeTab` state type**

Find:
```typescript
  const [activeTab, setActiveTab] = useState<"controls" | "config" | "ollama" | "console" | "files" | "rcon">("controls");
```

Replace with:
```typescript
  const [activeTab, setActiveTab] = useState<"controls" | "scheduler" | "config" | "ollama" | "console" | "files" | "rcon">("controls");
```

- [ ] **Step 4: TypeScript check**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1
```

Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/server-config.tsx
git commit -m "feat(scheduler): add types, helpers, and tab slot to server-config"
```

---

## Task 7: Build the SchedulerTab event list (left panel)

**Files:**
- Modify: `src/components/dashboard/server-config.tsx`

- [ ] **Step 1: Add `SchedulerTab` component state and polling**

Find the closing brace of the `ServerConfig` function body just before the main `return (` statement. Before that `return`, add the full `SchedulerTab` component as a nested function component:

```typescript
  // ─── Scheduler Tab ────────────────────────────────────────────────────────
  function SchedulerTab() {
    const [events, setEvents] = useState<ScheduledEvent[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [, setTick] = useState(0); // forces re-render for countdown updates

    // Poll schedule every 30s when tab is visible
    useEffect(() => {
      if (activeTab !== "scheduler") return;
      const load = async () => {
        try {
          const res = await fetch("/api/schedule");
          if (res.ok) {
            const data = await res.json();
            setEvents(data.events || []);
          }
        } catch { /* bridge offline */ }
      };
      load();
      const poll = setInterval(load, 30000);
      return () => clearInterval(poll);
    }, [activeTab]);

    // Tick every minute to update countdowns
    useEffect(() => {
      const t = setInterval(() => setTick(n => n + 1), 60000);
      return () => clearInterval(t);
    }, []);

    const handleToggle = async (id: string) => {
      try {
        const res = await fetch(`/api/schedule/${id}/toggle`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setEvents(prev => prev.map(e => e.id === id ? { ...e, enabled: data.enabled } : e));
        }
      } catch { /* ignore */ }
    };

    const handleRunNow = async (id: string) => {
      setRunningId(id);
      try {
        await fetch(`/api/schedule/${id}/run`, { method: "POST" });
        // Reload to get updated log
        const res = await fetch("/api/schedule");
        if (res.ok) setEvents((await res.json()).events || []);
      } catch { /* ignore */ }
      setRunningId(null);
    };

    const handleDelete = async (id: string) => {
      try {
        await fetch(`/api/schedule/${id}`, { method: "DELETE" });
        setEvents(prev => prev.filter(e => e.id !== id));
        if (selectedId === id) { setSelectedId(null); setShowForm(false); }
      } catch { /* ignore */ }
    };

    const handleSaved = (saved: ScheduledEvent) => {
      setEvents(prev => {
        const idx = prev.findIndex(e => e.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setShowForm(false);
      setSelectedId(null);
    };

    const nextEvent = events
      .filter(e => e.enabled && e.next_run_utc)
      .sort((a, b) => new Date(a.next_run_utc!).getTime() - new Date(b.next_run_utc!).getTime())[0];

    const editingEvent = selectedId ? events.find(e => e.id === selectedId) : undefined;

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Next event banner */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse shrink-0" />
            {nextEvent ? (
              <span className="text-[12px] text-[#c8c8d0]">
                <span className="text-[#6b6b80] mr-2">NEXT EVENT</span>
                <span className="font-semibold text-white">{nextEvent.name}</span>
                <span className="text-[#22d3ee] ml-2 font-mono">in {formatTimeUntil(nextEvent.next_run_utc)}</span>
              </span>
            ) : (
              <span className="text-[12px] text-[#6b6b80]">No scheduled events</span>
            )}
          </div>
          <button
            onClick={() => { setSelectedId(null); setShowForm(true); }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#22d3ee]/[0.08] border border-[#22d3ee]/20 text-[#22d3ee] text-[11px] font-bold hover:bg-[#22d3ee]/[0.15] transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m-8-8h16" /></svg>
            ADD EVENT
          </button>
        </div>

        {/* Body: list + form */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Event list */}
          <div className="w-[280px] shrink-0 border-r border-white/[0.04] overflow-y-auto">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="text-[#6b6b80] text-[12px] mb-3">No scheduled events yet.</div>
                <button
                  onClick={() => { setSelectedId(null); setShowForm(true); }}
                  className="text-[11px] text-[#22d3ee] hover:underline"
                >
                  Create your first event →
                </button>
              </div>
            ) : (
              <div className="py-2 space-y-px">
                {events.map(ev => (
                  <div
                    key={ev.id}
                    onClick={() => { setSelectedId(ev.id); setShowForm(true); }}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      selectedId === ev.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                    } ${!ev.enabled ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${ACTION_COLORS[ev.action]}`}>
                          {ev.action.replace("_", " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Run Now */}
                        <button
                          onClick={e => { e.stopPropagation(); handleRunNow(ev.id); }}
                          disabled={runningId === ev.id}
                          title="Run now"
                          className="w-5 h-5 flex items-center justify-center rounded text-[#6b6b80] hover:text-[#22d3ee] hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                        >
                          {runningId === ev.id ? (
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.49 8.49l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.49-8.49l2.83-2.83" /></svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          )}
                        </button>
                        {/* Toggle */}
                        <button
                          onClick={e => { e.stopPropagation(); handleToggle(ev.id); }}
                          title={ev.enabled ? "Disable" : "Enable"}
                          className="w-5 h-5 flex items-center justify-center rounded text-[#6b6b80] hover:text-[#eab308] hover:bg-white/[0.06] transition-colors"
                        >
                          {ev.enabled ? (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="text-[12px] font-semibold text-white truncate mb-0.5">{ev.name}</div>
                    <div className="text-[10px] text-[#6b6b80] truncate">{scheduleLabel(ev)}</div>
                    {ev.enabled && ev.next_run_utc && (
                      <div className="text-[10px] text-[#22d3ee]/70 font-mono mt-0.5">
                        in {formatTimeUntil(ev.next_run_utc)}
                      </div>
                    )}
                    {ev.last_run && (
                      <div className={`text-[9px] mt-1 ${ev.last_run.status === "ok" ? "text-[#22c55e]/60" : "text-[#ef4444]/60"}`}>
                        Last: {ev.last_run.status === "ok" ? "✓" : "✗"} {new Date(ev.last_run.ts).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form or empty state */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {showForm ? (
              <SchedulerForm
                key={selectedId || "new"}
                event={editingEvent}
                onSaved={handleSaved}
                onDeleted={handleDelete}
                onCancel={() => { setShowForm(false); setSelectedId(null); }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="text-[#6b6b80] text-[12px]">Select an event to edit, or add a new one.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1
```

Expected: errors about `SchedulerForm` not defined yet (that's fine — it's next task)

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/server-config.tsx
git commit -m "feat(scheduler): add SchedulerTab with event list, toggle, run now"
```

---

## Task 8: Build the SchedulerForm component

**Files:**
- Modify: `src/components/dashboard/server-config.tsx`

- [ ] **Step 1: Add `SchedulerForm` component**

This goes just before the `SchedulerTab` function (inside `ServerConfig`):

```typescript
  function SchedulerForm({
    event,
    onSaved,
    onDeleted,
    onCancel,
  }: {
    event?: ScheduledEvent;
    onSaved: (ev: ScheduledEvent) => void;
    onDeleted: (id: string) => void;
    onCancel: () => void;
  }) {
    const isNew = !event;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const [name, setName] = useState(event?.name ?? "");
    const [action, setAction] = useState<ScheduleAction>(event?.action ?? "RESTART");
    const [schedType, setSchedType] = useState<ScheduleType>(event?.schedule.type ?? "daily");
    const [time, setTime] = useState(event?.schedule.time ?? "03:00");
    const [tz, setTz] = useState(event?.schedule.timezone ?? browserTz);
    const [days, setDays] = useState<string[]>(event?.schedule.days ?? ["mon", "wed", "fri", "sat", "sun"]);
    const [intervalHours, setIntervalHours] = useState(event?.schedule.interval_hours ?? 6);
    const [oneTimeDate, setOneTimeDate] = useState(event?.schedule.datetime_utc ? event.schedule.datetime_utc.split("T")[0] : "");
    const [oneTimeTime, setOneTimeTime] = useState(event?.schedule.datetime_utc ? event.schedule.datetime_utc.split("T")[1]?.slice(0, 5) : "12:00");

    // Action params
    const [broadcastMsg, setBroadcastMsg] = useState((event?.params?.message as string) ?? "");
    const [difficultyVal, setDifficultyVal] = useState((event?.params?.value as number) ?? 50);
    const [aiToggleEnabled, setAiToggleEnabled] = useState((event?.params?.enabled as boolean) ?? true);

    // Warnings
    const [warnEnabled, setWarnEnabled] = useState(event?.warnings.enabled ?? true);
    const [warnMsg, setWarnMsg] = useState(event?.warnings.message ?? "[Server] Restarting in {N} minutes.");

    // Player gate
    const [gateEnabled, setGateEnabled] = useState(event?.player_gate.enabled ?? false);
    const [gateMins, setGateMins] = useState(event?.player_gate.defer_minutes ?? 30);

    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const toggleDay = (d: string) => {
      setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
    };

    const buildPayload = () => {
      const params: Record<string, unknown> = {};
      if (action === "BROADCAST") params.message = broadcastMsg;
      if (action === "SET_DIFFICULTY") params.value = difficultyVal;
      if (action === "AI_TOGGLE") params.enabled = aiToggleEnabled;

      const schedule: ScheduleConfig = { type: schedType, timezone: tz };
      if (schedType === "daily" || schedType === "weekly") schedule.time = time;
      if (schedType === "weekly") schedule.days = days;
      if (schedType === "interval") schedule.interval_hours = intervalHours;
      if (schedType === "one_time") {
        // Convert local date+time to UTC ISO
        const localIso = `${oneTimeDate}T${oneTimeTime}`;
        schedule.datetime_utc = new Date(localIso).toISOString();
      }

      return {
        name: name.trim() || "Untitled Event",
        action,
        params,
        schedule,
        warnings: { enabled: warnEnabled, minutes: [15, 5, 1], message: warnMsg },
        player_gate: { enabled: gateEnabled, defer_minutes: gateMins },
        enabled: true,
      };
    };

    const handleSave = async () => {
      setErr("");
      setSaving(true);
      try {
        const payload = buildPayload();
        const url = isNew ? "/api/schedule" : `/api/schedule/${event!.id}`;
        const method = isNew ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        onSaved(isNew ? data.event : data.event);
      } catch (e) {
        setErr(String(e));
      }
      setSaving(false);
    };

    const handleDelete = async () => {
      if (!event) return;
      if (!confirm(`Delete "${event.name}"?`)) return;
      try {
        await fetch(`/api/schedule/${event.id}`, { method: "DELETE" });
        onDeleted(event.id);
      } catch (e) {
        setErr(String(e));
      }
    };

    const showWarnings = action === "RESTART" || action === "RESTART_UPDATE";
    const showGate = action === "RESTART" || action === "RESTART_UPDATE";

    return (
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-white">{isNew ? "New Event" : "Edit Event"}</h3>
          {!isNew && (
            <button onClick={handleDelete} className="text-[10px] text-[#ef4444]/60 hover:text-[#ef4444] transition-colors uppercase tracking-wider">
              Delete
            </button>
          )}
        </div>

        {/* Name */}
        <div>
          <label className="block text-[10px] font-bold text-[#6b6b80] uppercase tracking-wider mb-1.5">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Nightly Restart"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
          />
        </div>

        {/* Action */}
        <div>
          <label className="block text-[10px] font-bold text-[#6b6b80] uppercase tracking-wider mb-1.5">Action</label>
          <select
            value={action}
            onChange={e => setAction(e.target.value as ScheduleAction)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
          >
            {(Object.keys(ACTION_LABELS) as ScheduleAction[]).map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
          {/* Action-specific params */}
          {action === "BROADCAST" && (
            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="Message to broadcast to all players..."
              rows={2}
              className="mt-2 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-[#22d3ee]/40 focus:outline-none transition-colors resize-none"
            />
          )}
          {action === "SET_DIFFICULTY" && (
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={difficultyVal}
                onChange={e => setDifficultyVal(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-[#22d3ee] font-mono text-[12px] w-8 text-right">{difficultyVal}</span>
            </div>
          )}
          {action === "AI_TOGGLE" && (
            <div className="mt-2 flex gap-3">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setAiToggleEnabled(v)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-colors ${
                    aiToggleEnabled === v
                      ? "bg-[#22c55e]/[0.15] text-[#22c55e] border-[#22c55e]/30"
                      : "bg-white/[0.04] text-[#6b6b80] border-white/[0.08] hover:bg-white/[0.08]"
                  }`}
                >
                  {v ? "Enable" : "Disable"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Schedule type */}
        <div>
          <label className="block text-[10px] font-bold text-[#6b6b80] uppercase tracking-wider mb-1.5">Schedule</label>
          <div className="flex gap-1 mb-3">
            {(["daily", "weekly", "interval", "one_time"] as ScheduleType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setSchedType(t)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-colors ${
                  schedType === t
                    ? "bg-white/[0.08] text-white border-white/[0.15]"
                    : "bg-white/[0.02] text-[#6b6b80] border-white/[0.06] hover:bg-white/[0.06]"
                }`}
              >
                {t === "one_time" ? "Once" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Daily / Weekly time + timezone */}
          {(schedType === "daily" || schedType === "weekly") && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
                />
                <select
                  value={tz}
                  onChange={e => setTz(e.target.value)}
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
                >
                  {COMMON_TIMEZONES.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                  {!COMMON_TIMEZONES.includes(browserTz) && (
                    <option value={browserTz}>{browserTz} (your timezone)</option>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Weekly days */}
          {schedType === "weekly" && (
            <div className="flex gap-1 mt-2">
              {DAYS_OF_WEEK.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`w-7 h-7 rounded-full text-[10px] font-bold transition-colors ${
                    days.includes(d)
                      ? "bg-[#22d3ee]/[0.15] text-[#22d3ee] border border-[#22d3ee]/30"
                      : "bg-white/[0.04] text-[#6b6b80] border border-white/[0.08] hover:bg-white/[0.08]"
                  }`}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          )}

          {/* Interval */}
          {schedType === "interval" && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#6b6b80]">Every</span>
              <input
                type="number"
                min={1}
                max={168}
                value={intervalHours}
                onChange={e => setIntervalHours(Number(e.target.value))}
                className="w-16 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none text-center"
              />
              <span className="text-[12px] text-[#6b6b80]">hours</span>
            </div>
          )}

          {/* One-time */}
          {schedType === "one_time" && (
            <div className="flex gap-2">
              <input
                type="date"
                value={oneTimeDate}
                onChange={e => setOneTimeDate(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
              />
              <input
                type="time"
                value={oneTimeTime}
                onChange={e => setOneTimeTime(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
              />
            </div>
          )}
        </div>

        {/* Warnings */}
        {showWarnings && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWarnEnabled(v => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  warnEnabled ? "bg-[#22d3ee]/[0.15] border-[#22d3ee]/40" : "bg-white/[0.04] border-white/[0.1]"
                }`}
              >
                {warnEnabled && <svg className="w-2.5 h-2.5 text-[#22d3ee]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
              </button>
              <label className="text-[11px] text-[#c8c8d0] font-semibold">
                Countdown warnings (at 15m, 5m, 1m before restart)
              </label>
            </div>
            {warnEnabled && (
              <input
                value={warnMsg}
                onChange={e => setWarnMsg(e.target.value)}
                placeholder="[Server] Restarting in {N} minutes."
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
              />
            )}
          </div>
        )}

        {/* Player gate */}
        {showGate && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGateEnabled(v => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  gateEnabled ? "bg-[#22d3ee]/[0.15] border-[#22d3ee]/40" : "bg-white/[0.04] border-white/[0.1]"
                }`}
              >
                {gateEnabled && <svg className="w-2.5 h-2.5 text-[#22d3ee]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
              </button>
              <label className="text-[11px] text-[#c8c8d0] font-semibold">
                Player-aware: defer restart if players online
              </label>
            </div>
            {gateEnabled && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-[11px] text-[#6b6b80]">Defer up to</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={gateMins}
                  onChange={e => setGateMins(Number(e.target.value))}
                  className="w-14 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-[#c8c8d0] focus:outline-none text-center"
                />
                <span className="text-[11px] text-[#6b6b80]">minutes, then restart anyway</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {err && (
          <div className="text-[11px] text-[#ef4444] bg-[#ef4444]/[0.08] border border-[#ef4444]/20 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <ActionButton onClick={handleSave} variant="green" loading={saving}>
            {isNew ? "CREATE EVENT" : "SAVE CHANGES"}
          </ActionButton>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-[11px] font-bold text-[#6b6b80] hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all"
          >
            CANCEL
          </button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Wire `SchedulerTab` render into the main return**

Find the section in the main `ServerConfig` return that renders other tabs (look for `{activeTab === "controls" && ...}`). Add after the RCON block or before it:

```typescript
      {/* ─── Scheduler Tab ──────────────────────────────────────────── */}
      {activeTab === "scheduler" && <SchedulerTab />}
```

- [ ] **Step 3: TypeScript check — must be clean**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/server-config.tsx
git commit -m "feat(scheduler): add SchedulerForm and wire scheduler tab into ServerConfig"
```

---

## Task 9: End-to-end smoke test

**Files:** (no code changes)

- [ ] **Step 1: Start bridge and verify scheduler loads**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python bridge.py 2>&1 | head -30
```

Expected log lines:
```
INFO:     Log tail background task started
INFO:     [Scheduler] Engine started
```

- [ ] **Step 2: Create a test event via API**

```bash
curl -s -X POST http://localhost:5555/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Warmup",
    "action": "WARMUP",
    "params": {},
    "schedule": {"type": "daily", "time": "03:00", "timezone": "UTC"},
    "warnings": {"enabled": false, "minutes": [15, 5, 1], "message": ""},
    "player_gate": {"enabled": false, "defer_minutes": 30}
  }' | python3 -m json.tool
```

Expected: JSON with `id` field and `next_run_utc` set to tomorrow at 03:00 UTC

- [ ] **Step 3: Read the event back**

```bash
curl -s http://localhost:5555/api/schedule | python3 -m json.tool
```

Expected: `{"events": [...]}` with the created event

- [ ] **Step 4: Trigger Run Now**

```bash
EVENT_ID=$(curl -s http://localhost:5555/api/schedule | python3 -c "import sys,json; print(json.load(sys.stdin)['events'][0]['id'])")
curl -s -X POST http://localhost:5555/api/schedule/$EVENT_ID/run | python3 -m json.tool
```

Expected: `{"status": "ok", "message": "Model warmup triggered"}`

- [ ] **Step 5: Toggle disable**

```bash
curl -s -X POST http://localhost:5555/api/schedule/$EVENT_ID/toggle | python3 -m json.tool
```

Expected: `{"id": "...", "enabled": false}`

- [ ] **Step 6: Delete**

```bash
curl -s -X DELETE http://localhost:5555/api/schedule/$EVENT_ID | python3 -m json.tool
```

Expected: `{"status": "ok"}`

- [ ] **Step 7: Start the dev server and verify the UI**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npm run dev
```

Open `http://localhost:3000` → Server tab → Schedule tab.
Verify:
- Tab appears in the tab bar
- "No scheduled events yet" placeholder shown
- Click "+ ADD EVENT" → form appears
- Create a Daily warmup event → appears in the list with countdown
- Click event → form populates with existing values
- Toggle disable → card grays out
- Run Now → runs immediately and updates last run status

- [ ] **Step 8: Final commit**

```bash
git add bridge.py src/components/dashboard/server-config.tsx
git commit -m "feat(scheduler): complete end-to-end scheduler — engine, API, and UI"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| 4 schedule patterns (daily, weekly, interval, one_time) | Tasks 3, 8 |
| 9 action types | Tasks 3, 6, 8 |
| Local timezone entry, UTC storage | Tasks 3, 6, 8 |
| UTC offset annotation in UI | Task 6 (`scheduleLabel`, `formatUtcAsLocal`) |
| Smart pre-warning (RCON say -1) | Task 4 (`SchedulerEngine._tick`) |
| Player-aware gate with defer window | Task 4 (`SchedulerEngine._tick`) |
| Enable/disable toggle | Tasks 4 (REST), 7 (UI) |
| Run Now | Tasks 5 (REST), 7 (UI) |
| Event log (last 100) | Tasks 4, 5 |
| Last-run status on card | Task 7 |
| Next event countdown banner | Task 7 |
| `SCHEDULE_PATH` env var | Task 1 |
| `zoneinfo` stdlib (no new pip dep) | Task 1 note |
| Internal helpers (no loopback HTTP) | Tasks 2, 3 |
| `_schedule_lock` for all disk I/O | Tasks 1, 5 |
| WebSocket `scheduler_event` broadcast | Task 4 |
| 30-second polling in tab | Task 7 |
| `schedule.json` atomic write (tmp→rename) | Task 1 |
