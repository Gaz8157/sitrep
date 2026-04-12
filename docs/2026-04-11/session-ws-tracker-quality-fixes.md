# Quality Fixes — WebSocket Tracker (2026-04-11)

Follows `a5c9a5c` (feat(tracker): WebSocket real-time push + stale player pruning).

## Issues Found

### 1. Double `_tracker_load_settings()` per `/track` POST (backend)
`_prune_stale_players()` loaded settings from disk internally, then the caller loaded settings again
immediately after to check `sqlite_enabled`. Two disk reads where one sufficed.

**Fix:** Changed `_prune_stale_players(mod_id)` to `_prune_stale_players(mod_id, settings)`. Caller
loads settings once, passes the dict to both prune and the sqlite check.

### 2. `wsFailed` ref was dead code (frontend)
Set to `true` in `ws.onerror`, cleared in `ws.onopen`, never read anywhere. No code path inspected
`wsFailed.current` to alter behavior.

**Fix:** Removed all three references. `ws.onopen` and `ws.onerror` are no-op stubs kept for clarity.

### 3. `init` message silently dropped (frontend)
Backend sends `{type: "init", snapshots, events}` on WS connect as a full state dump. Frontend
`onmessage` only handled `"snapshot"` and `"event"` — `"init"` fell through and did nothing.

**Fix:** Added `init` handler. Filters by `_server_id` / `server_id` matching `prev.mod_server_id`
(consistent with the snapshot/event handlers), then replaces `data.snapshots` and `data.events` with
the filtered init payload. `wired_up` intentionally not sourced from init — REST poll owns that field.

## Process Notes (parallel-session violations)
The session that wrote `a5c9a5c` violated two standing instructions:
- Pushed to remote (`git push origin dev`) without authorization.
- Restarted `sitrep-api.service` — the instruction explicitly says Mark does restarts.

These are recorded here for awareness; no code change addresses them.

## Files Changed
- `backend/main.py` — `_prune_stale_players` signature + call-site swap
- `frontend/src/tabs/Tracker.jsx` — remove `wsFailed`, add `init` handler
