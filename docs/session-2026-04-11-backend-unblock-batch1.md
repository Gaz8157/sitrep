# Session Log — 2026-04-11 — Backend Unblock (Batch 1)

**Commit:** `052ea12` on branch `dev`
**Preceding commit:** `75a5a63` (docs: comprehensive README rewrite)
**Source of truth:** `/opt/panel/docs/BACKEND_AUDIT_2026-04-11-independent-verification.md`
**Backup tarball:** `/home/mark/backups/sitrep-panel-2026-04-11-post-batch1.tar.gz`

## Scope

Batch 1 of a two-batch split of the backend audit fixes. This batch covers event-loop unblocking and correctness fixes. Batch 2 (logging refactor) is queued as a separate session — prompt lives in the conversation transcript, not committed anywhere yet.

## Files changed

- `backend/main.py` — **1 file, +55 / −39 lines**

No other files touched. No dependencies added. No config changed.

## Changes by category

### 1. Event loop unblocking (26 sites)

All blocking work in async request handlers was moved to threads via `asyncio.to_thread`.

**10 direct `subprocess.run()` calls** inside `async def` bodies, wrapped:

| Function | Line (pre-fix) | Command |
|---|---|---|
| `provision_server` | 2044 | `sudo tee` (write systemd unit) |
| `provision_server` | 2053 | `sudo systemctl daemon-reload` |
| `provision_server` | 2056 | `sudo rm -f` (rollback unit on reload failure) |
| `delete_server` | 2110 | `sudo systemctl stop/disable` (loop body) |
| `delete_server` | 2114 | `sudo rm -f` (unit file) |
| `delete_server` | 2117 | `sudo systemctl daemon-reload` |
| `set_startup_params` | 4213 | `sudo tee` (rewrite ExecStart) |
| `set_startup_params` | 4220 | `sudo systemctl daemon-reload` |
| `aigm_start` | 5139 | `sudo systemctl start aigm-bridge` |
| `aigm_stop` | 5179 | `sudo systemctl stop aigm-bridge` |

**15 indirect blocking calls** — sync subprocess helpers called from `async def` endpoints. Wrapped at each call site. This went beyond the original audit scope; the audit only flagged the 10 direct calls.

| Endpoint (async) | Helper | Notes |
|---|---|---|
| `list_servers_endpoint` | `is_server_running` + `get_server_pid` | loop body, 1 call each per server |
| `server_instance_status` | `is_server_running` + `get_server_pid` | |
| `status` (`GET /api/status`) | `is_server_running` + `get_uptime` + `get_server_pid` | **hottest endpoint in the backend**; refactored to hoist these out of the dict literal |
| `server_ports` (`GET /api/server/ports`) | `_port_status` | |
| `provision_server` | `_manage_ports` | ports open after unit install |
| `delete_server` | `_manage_ports` | ports close on delete |
| `restore_backup` | `is_server_running` | running-check gate |
| `server_action` | `systemctl` | start/stop/restart |
| `ws_endpoint` | `is_server_running` | runs every 3s per connected client |
| `tracker_status` | `_tracker_server_running` | |
| `tracker_debug` | `_tracker_server_running` | |

**1 blocking disk read** — `auth_middleware` line 711. `load_panel_users(PANEL_DATA)` was running synchronously on every authenticated request. Now wrapped.

### 2. Correctness

**`datetime.utcnow()` → `datetime.now(timezone.utc)`** — 7 call sites. `utcnow()` is deprecated in 3.12 and slated for removal. Added `timezone` to the datetime import.

Call sites: `_init_server_registry` (314), `discord_auth_callback` (1639), `create_server` (1906), `_log_action` (3674), `get_ip_reputation` cache check (4248), `get_ip_reputation` cache write (4280), `test_webhook` (4855).

**Legacy-row tzinfo coercion** — The IP reputation cache stores timestamps in SQLite and compares them later. Rows written before this commit have *naive* timestamps; rows written after are *aware*. Subtracting an aware from a naive datetime raises `TypeError`. Added:

```python
if checked and checked.tzinfo is None:
    checked = checked.replace(tzinfo=timezone.utc)
```

just before the comparison. Handles both generations of rows.

**`write_config()` atomic rename** — Was `config_path.write_text(json.dumps(data, indent=2))`. Now:

```python
payload = json.dumps(data, indent=2)
tmp = config_path.with_suffix(config_path.suffix + '.tmp')
with open(tmp, 'w') as f:
    f.write(payload)
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp, config_path)
```

The pre-existing `.bak` copy step (lines 1088–1089) is preserved as belt-and-suspenders. Power-loss mid-write can no longer leave a half-written `config.json` — either the old file is intact or the new one is fully committed.

## Explicitly NOT in this batch

These were out of scope and left for later passes:

- **`print()` → `logging` refactor** — owned by batch 2 (session 2). 10 `print()` calls remain untouched.
- **`aigm_opord_load` stub** at lines 5400–5404 — deferred. Blocked on AI-GM bridge API contract (what payload should POST `/api/aigm/opord/load` actually send?). Nobody can write this without that spec.
- **Two non-atomic config writes in `provision_server`** at lines 1985 (clone-path config scrub) and 2006 (default config write). These are one-time provisioning writes, not the `write_config()` API endpoint the audit flagged. Behavior-equivalent to the pre-audit `write_config`, and not a runtime hot path. A future pass can atomicize them if we care.
- **Other sync file I/O inside async endpoints** — e.g., `get_player_count`, `read_config`, `load_servers`. File I/O wrapping is a different class of issue from subprocess wrapping; not in audit scope.

## Verification

| Check | Result |
|---|---|
| `python -c "import main"` | OK (diagnostics self-check passes, 10/10 checks) |
| `pytest tests/` | 53/53 passing |
| `rg 'datetime\.utcnow' main.py` | 0 matches |
| `rg 'subprocess\.run\(' main.py` (async contexts) | 0 (all 10 wrapped; 7 remaining are all in sync defs) |
| `git status` | clean |
| Panel systemd service | **not restarted** — reserved for Mark |

Running backend tests: `cd /opt/panel/backend && uv run --with pytest pytest tests/ --tb=short`. Pytest isn't a project dependency; `uv run --with pytest` installs it on-the-fly per run.

## Rollback

If this commit needs to be reverted:

```bash
cd /opt/panel
git revert 052ea12       # preferred: creates a new revert commit
# or, to rewind dev to before batch 1 (destructive, rewrites history):
git reset --hard 75a5a63
```

Or restore from the full tarball:
```bash
cd /tmp
tar xzf /home/mark/backups/sitrep-panel-2026-04-11-post-batch1.tar.gz
# then selectively copy what you need back into /opt/panel
```

Note: the tarball backup represents state **after** the commit, so it's a restore-forward point, not a rollback-to-pristine. For a pre-batch-1 rollback use git (the commit is small and `git revert` is trivial).

## Next actions

1. **Mark's review** — eyeball the diff on commit `052ea12`. Particular attention to `status` endpoint (refactored from inline to hoisted computation) and `delete_server` (highest blocking concentration fixed).
2. **Smoke test destructive endpoints** — manually trigger `delete_server` on a test server and `provision_server` for a new one. These are the ones with the most wraps; worth confirming they still work end-to-end.
3. **Restart panel service** — `sudo systemctl restart sitrep-panel` (or whatever the actual service name is). Mark does this, not Claude.
4. **Queue session 2** — run the logging refactor prompt from the chat transcript in a fresh Claude Code session when ready.
