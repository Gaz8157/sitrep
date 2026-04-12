# Server Event Scheduler — Design Spec

**Date:** 2026-04-08
**Status:** Approved

---

## Overview

A full-featured server event scheduler for the AIGameMaster dashboard. Operators define recurring or one-time scheduled events (restarts, broadcasts, AI resets, etc.) through an intuitive UI that works in local time. The backend runs an asyncio loop that fires events, chains pre-warnings via RCON, and logs outcomes. Replaces the non-existent scheduler feature entirely.

---

## User-Facing Features

### Schedule Patterns

| Pattern | Description |
|---------|-------------|
| **Daily** | Every day at a set local time |
| **Weekly** | Specific days of the week at a set local time |
| **Interval** | Every N hours, starting from server startup |
| **One-time** | Fire once at a specific date + local time, then auto-disable |

All times are entered in the user's **local timezone** (detected from the browser). Stored and compared internally in UTC. The UI always displays local time with a UTC annotation (e.g. "03:00 BST (02:00 UTC)").

### Action Types

| Action | Parameters | What It Does |
|--------|-----------|-------------|
| `RESTART` | — | Gracefully restart the game server |
| `RESTART_UPDATE` | — | SteamCMD update check, then restart |
| `BROADCAST` | `message: string` | RCON `say -1 <message>` to all players |
| `WARMUP` | — | Trigger AI model warmup endpoint |
| `CLEAR_AI` | — | Delete all AI units on the server |
| `RESET_ESCALATION` | — | Set escalation level to 0 |
| `SET_DIFFICULTY` | `value: 0–100` | Set AI GM difficulty to a specific value |
| `MISSION_RESET` | — | Clear the active mission briefing |
| `AI_TOGGLE` | `enabled: bool` | Enable or disable the AI GM |

### Smart Pre-Warning System

Any `RESTART` or `RESTART_UPDATE` event automatically chains countdown broadcasts via RCON before firing. Configurable per event:

- Warnings at: 15 minutes, 5 minutes, 1 minute before restart (default)
- Warning message template: `"[Server] Restarting in {N} minutes. Save your progress."` (customizable per event)
- Warnings are skipped if RCON is not connected (restart proceeds anyway)

### Player-Aware Gate

Optional per event: if players are currently online, defer the restart by up to N minutes (configurable, default 30) and retry. If players are still online after the defer window, proceed anyway. Gate only applies to `RESTART` and `RESTART_UPDATE`.

### Enable/Disable Toggle

Each event has an enabled flag. Disabled events are shown in the list but grayed out and skipped by the scheduler. Useful for suspending maintenance windows without deleting them.

### Run Now

Any event can be manually triggered immediately from the UI. Bypasses all schedule logic and player gates. Pre-warnings are still sent if RCON is connected.

### Event Log

Last 100 execution records per event, persisted to disk. Each record: `{ts, action, status: "ok"|"skipped"|"error", message}`. Displayed in the UI as a collapsible log per event.

---

## Architecture

### Data Model

Events are stored in `SCHEDULE_PATH` (env var, default: `/opt/arma/schedule.json`). File format:

```json
{
  "events": [
    {
      "id": "uuid4",
      "name": "Nightly Restart",
      "enabled": true,
      "action": "RESTART",
      "params": {},
      "schedule": {
        "type": "daily",
        "time": "03:00",
        "timezone": "Europe/London",
        "days": null
      },
      "warnings": {
        "enabled": true,
        "minutes": [15, 5, 1],
        "message": "[Server] Restarting in {N} minutes."
      },
      "player_gate": {
        "enabled": true,
        "defer_minutes": 30
      },
      "next_run_utc": "2026-04-09T03:00:00Z",
      "last_run": null,
      "log": []
    }
  ]
}
```

For `BROADCAST` action, `params` = `{"message": "..."}`.
For `SET_DIFFICULTY` action, `params` = `{"value": 50}`.
For `AI_TOGGLE` action, `params` = `{"enabled": true}`.
For `interval` schedule, `schedule.interval_hours` = integer, `schedule.time` and `days` are null.
For `weekly` schedule, `schedule.days` = `["mon", "wed", "fri"]`.
For `one_time` schedule, `schedule.datetime_utc` = ISO string.

### Backend (bridge.py additions)

**New module-level state:**
```python
SCHEDULE_PATH = Path(os.environ.get("SCHEDULE_PATH", "/opt/arma/schedule.json"))
_schedule_lock = asyncio.Lock()   # guards all schedule.json reads + writes
```

`zoneinfo` (stdlib, Python 3.9+) is used for timezone-aware datetime arithmetic. No new pip dependency.

**`SchedulerEngine` class** (asyncio, runs as a background task on startup):
- Wakes every 60 seconds
- Acquires `_schedule_lock`, loads events from disk (re-reads on each tick to pick up UI changes)
- For each enabled event, checks if `next_run_utc` is in the past
- Fires the event action (or pre-warning if within warning window)
- Updates `next_run_utc` for recurring events, sets `enabled=False` for one-time
- Appends to event log, saves to disk
- Broadcasts `scheduler_event` WebSocket message on fire/complete

**Next-run calculation (`compute_next_run`):**
- `daily`: next occurrence of `time` in `timezone`, tomorrow if today's already passed
- `weekly`: next matching weekday + time in `timezone`
- `interval`: `now + interval_hours * 3600` (from current time, not from midnight)
- `one_time`: the stored `datetime_utc` exactly; sets enabled=False after firing

**Action execution (`execute_action`):**
All actions call internal Python functions directly — no loopback HTTP requests to self.
- `RESTART` / `RESTART_UPDATE`: calls `_do_restart(check_updates)` — extracted shared logic from `api_server_restart`
- `BROADCAST`: calls `_rcon.send_command(f"say -1 {message}")` — no-op + logs warning if RCON disconnected
- `WARMUP`: calls `_auto_warmup()` as an asyncio task
- `CLEAR_AI`: calls the same delete-all logic used by `api_admin` (extracted helper)
- `RESET_ESCALATION`: directly updates `_servers[sid].escalation = 0` and broadcasts `config_update`
- `SET_DIFFICULTY`: directly updates `_servers[sid].difficulty = value` and broadcasts `config_update`
- `MISSION_RESET`: calls existing `clear_mission()` helper
- `AI_TOGGLE`: directly updates `_servers[sid].ai_enabled = value` and broadcasts `config_update`

**New REST endpoints:**

```
GET  /api/schedule
     → { events: [...] }  — full list with next_run and log

POST /api/schedule
     body: event object (no id — server assigns uuid4)
     → { id: "...", event: {...} }

PUT  /api/schedule/{id}
     body: partial event object (merged, not replaced)
     → { event: {...} }

DELETE /api/schedule/{id}
     → { status: "ok" }

POST /api/schedule/{id}/run
     → { status: "ok" | "error", message: "..." }  — immediate execution

POST /api/schedule/{id}/toggle
     → { id, enabled: bool }
```

### Frontend (new Scheduler tab in ServerConfig)

Added as a new tab `"scheduler"` in `server-config.tsx`. Tab label: `Schedule`.

**Tab layout:**

```
┌─────────────────────────────────────────────────────┐
│  NEXT EVENT: Nightly Restart in 3h 42m     [+ ADD]  │
├──────────────────────────┬──────────────────────────┤
│  EVENT LIST              │  CREATE / EDIT FORM      │
│                          │                          │
│  ● Nightly Restart       │  Name ________________   │
│    Daily 03:00 BST       │                          │
│    In 3h 42m    [▶][⏸]  │  Action [RESTART     ▾]  │
│                          │                          │
│  ● Warmup Hourly         │  Schedule                │
│    Every 6h              │  ◉ Daily  ○ Weekly       │
│    In 2h 11m    [▶][⏸]  │  ○ Interval  ○ One-time  │
│                          │                          │
│  ○ Old Restart           │  Time [03:00] [BST ▾]   │
│    (disabled)   [▶][⏸]  │                          │
│                          │  ☑ Warnings (15, 5, 1m) │
│                          │  ☑ Player gate (30m)     │
│                          │                          │
│                          │  [SAVE]  [CANCEL]        │
└──────────────────────────┴──────────────────────────┘
```

**Event list card** shows:
- Name, action type badge, schedule summary in local time
- Time until next fire (live countdown, updates every minute)
- Run Now button (▶) and toggle (⏸/▶) icon buttons
- Clicking a card opens it in the edit form
- Collapsible log section showing last 5 runs

**Create/Edit form:**
- Name input
- Action dropdown — selecting `BROADCAST` reveals a message textarea; `SET_DIFFICULTY` reveals a 0–100 slider; `AI_TOGGLE` reveals an enable/disable radio
- Schedule type radio: Daily / Weekly / Interval / One-time
  - Daily: time picker (HH:MM) + timezone selector (browser timezone auto-selected)
  - Weekly: day-of-week checkboxes + time picker + timezone
  - Interval: number input (hours)
  - One-time: date + time picker
- Warnings toggle (only shown for RESTART / RESTART_UPDATE actions) — customizable minutes and message template
- Player gate toggle (only shown for RESTART / RESTART_UPDATE) — defer minutes input
- Save and Cancel buttons

**Timezone handling:**
- Browser sends `Intl.DateTimeFormat().resolvedOptions().timeZone` (IANA name) with event saves
- UI displays times in that timezone with UTC offset annotation
- Server stores all times in UTC; `next_run_utc` is an ISO-8601 string

**Polling:**
- Scheduler tab polls `GET /api/schedule` every 30 seconds when visible
- WebSocket `scheduler_event` message triggers immediate refresh

---

## Files to Create / Modify

| File | Action | Change |
|------|--------|--------|
| `bridge.py` | Modify | Add `SCHEDULE_PATH`, `SchedulerEngine` class, `compute_next_run()`, `execute_action()`, 5 new REST endpoints, startup task |
| `src/components/dashboard/server-config.tsx` | Modify | Add `"scheduler"` tab, `SchedulerTab` sub-component, all UI |
| `src/hooks/use-bridge.ts` | Modify | Handle `scheduler_event` WebSocket message, broadcast to dashboard |

No new files needed. The scheduler tab is self-contained in `server-config.tsx` since it has its own polling.

---

## Spec: Pre-Warning Timing Logic

The scheduler engine checks every 60 seconds. Warning logic for an event at `next_run_utc = T`:

1. If current time `>= T` → fire the action
2. Elif current time `>= T - 15m` and 15m warning not yet sent → send 15m broadcast
3. Elif current time `>= T - 5m` and 5m warning not yet sent → send 5m broadcast
4. Elif current time `>= T - 1m` and 1m warning not yet sent → send 1m broadcast

Sent-warning tracking: in-memory dict `{event_id: set_of_minutes_sent}`, cleared after event fires. Persisted state not needed — worst case a restart after an event fires at `T` misses a warning, which is acceptable.

---

## Out of Scope

- Per-server scheduling (all events apply to the active server)
- Complex cron expressions (YAGNI — the four patterns cover all real use cases)
- Email/Discord notifications on event fire
- Drag-to-reorder event list
- Event dependencies ("run B after A completes")
