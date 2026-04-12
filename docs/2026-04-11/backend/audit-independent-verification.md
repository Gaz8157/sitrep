# Backend Audit — Independent Third-Party Verification
**Date:** 2026-04-11
**Verifier:** Fresh Claude session, no prior context from audit chain
**Method:** Direct read of `/opt/panel/backend/main.py` (6,248 lines), no audit docs consulted during verification
**Purpose:** Break the chain-of-trust problem — audits-reviewing-audits accumulate drift. This is a ground-truth cross-check before any fix session acts.

---

## 1. Verification Summary

Every load-bearing claim in `BACKEND_AUDIT_FINAL_2026-04-11.md` was verified against the source code. **Every major claim holds. One minor line-number discrepancy (already flagged by the prior reviewer) is confirmed.** The audit chain is trustworthy for handoff.

## 2. Claim-by-Claim Results

| # | Claim | Status | Evidence |
|---|---|---|---|
| 1 | Cookie security fixed — `COOKIE_SECURE` derived from `PANEL_URL` scheme, used on set/delete/refresh | ✅ verified | Lines 40–48 (definition), 640, 650, 656, 657, 1655 (usage). Logic is correct: HTTPS → secure, HTTP → not secure, env override available. |
| 2 | Exactly 7 `datetime.utcnow()` calls | ✅ verified | Lines 314, 1639, 1906, 3674, 4248, 4280, 4855. No extras, no misses. |
| 3 | Blocking disk read in `auth_middleware` at line 711 | ✅ verified | `async def auth_middleware` at line 663. Line 711: `_users_data = load_panel_users(PANEL_DATA)` — synchronous file read, no `asyncio.to_thread`, runs on every authenticated request. |
| 4 | Line 784 is inside `_sudo_probe()`, not `_run_diagnostics()` | ✅ verified | `_sudo_probe` def at line 779. `_run_diagnostics` is a separate function at line 800. Session2's claim was wrong; FINAL doc is right. |
| 5 | `get_system_stats` already wrapped in `asyncio.to_thread` | ✅ verified | Line 2554: `"system": await asyncio.to_thread(get_system_stats),`. Not one of the blocking-in-async calls. |
| 6 | **Exactly 10** direct `subprocess.run()` calls inside `async def` bodies | ✅ verified | Full enumeration below. |
| 7 | `write_config()` non-atomic at line 1090 | ✅ verified (with nuance) | Line 1090: `config_path.write_text(json.dumps(data, indent=2))`. Lines 1088–1089 do copy to `.json.bak` first, so there's a recovery path — but a partial `config.json` write is still possible if interrupted. |
| 8 | `aigm_opord_load` is a stub at lines 5400–5404 | ✅ verified | Line 5400: route decorator. Line 5401: `async def aigm_opord_load`. Lines 5402–5403: permission check. Line 5404: `return {"status": "loaded"}`. No bridge call, no file loading, no logic. |
| 9 | No `import logging` anywhere in the file | ✅ verified | Zero matches for `^import logging`, `^from logging`. The codebase uses `print()` with `[WARN]`/`[INFO]` prefixes (e.g., line 716). |
| 10 | `_manage_ports` at line **2789**, not 2809 (FINAL doc error) | ✅ discrepancy confirmed | `def _manage_ports(...)` is at line 2789. Line 2809 is a `subprocess.run()` **inside** that function — the FINAL doc apparently confused a subprocess-call line with the def line. Off by 20. Not load-bearing for the fix (grep finds it instantly), but worth noting. |
| 11 | `_port_status` at line 2851 | ✅ verified | Exact match. |

## 3. Full Enumeration: `subprocess.run()` calls in `main.py`

All 17 `subprocess.run()` instances in the file, classified by enclosing function:

| Line | Enclosing function (def line) | Kind | Blocking in async? |
|---|---|---|---|
| 784 | `_sudo_probe` (779) | sync def | no |
| 947 | `systemctl` (945) | sync def | no |
| 957 | `is_server_running` (955) | sync def | no |
| 967 | `get_server_pid` (965) | sync def | no |
| 1008 | `get_system_stats` (994) | sync def | no* |
| **2044** | **`provision_server` (1921)** | **async def** | **YES** |
| **2053** | **`provision_server`** | **async def** | **YES** |
| **2056** | **`provision_server`** | **async def** | **YES** |
| **2110** | **`delete_server` (2091)** | **async def** | **YES** |
| **2114** | **`delete_server`** | **async def** | **YES** |
| **2117** | **`delete_server`** | **async def** | **YES** |
| 2809 | `_manage_ports` (2789) | sync def | no |
| 2861 | `_port_status` (2851) | sync def | no |
| **4213** | **`set_startup_params` (4161)** | **async def** | **YES** |
| **4220** | **`set_startup_params`** | **async def** | **YES** |
| **5139** | **`aigm_start` (5134)** | **async def** | **YES** |
| **5179** | **`aigm_stop` (5163)** | **async def** | **YES** |

**Total: 10 direct blocking calls in async bodies. 7 in sync functions.**

\* `get_system_stats` is called via `await asyncio.to_thread(...)` at line 2554, so its internal `subprocess.run` is not blocking the event loop.

## 4. Additional Findings (not in the audit chain)

### 4.1 Indirect blocking from sync-def subprocess helpers

Of the 7 "safe" sync-def `subprocess.run()` calls, only `get_system_stats` has a confirmed `asyncio.to_thread` wrap at the async call site. The others (`_sudo_probe`, `systemctl`, `is_server_running`, `get_server_pid`, `_manage_ports`, `_port_status`) are **helpers** — if any async endpoint calls them directly without wrapping, it reintroduces the same event-loop-stall bug that the "10 in async" list is tracking.

**Example hot path:** `async def status` (line 2533) calls `is_server_running(service)` at line 2536 — unwrapped. That's a blocking call in the most-hit endpoint in the backend.

**Example hot path:** `async def delete_server` (line 2091) calls `_manage_ports(...)` at line 2121 — unwrapped — in addition to its three direct blocking calls.

The audit's "10" is correct as stated, but the *real* blocking surface is larger once you trace sync helpers called from async endpoints. A thorough fix should grep every async def for calls into the 6 unwrapped sync helpers.

### 4.2 `write_config()` atomicity nuance

The FINAL doc's characterization is correct but incomplete. The function:

```python
def write_config(data, config_path: Path = CONFIG_PATH):
    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        if config_path.exists():
            shutil.copy2(config_path, config_path.with_suffix('.json.bak'))  # 1088-1089
        config_path.write_text(json.dumps(data, indent=2))                   # 1090
        return {"message": "Config saved"}
    except Exception as e: return {"error": str(e)}
```

The backup-first approach means the failure mode is "half-written `config.json`, intact `.json.bak`" — better than naked `write_text`, but still not atomic. The canonical fix (`write → fsync → rename`) gives true atomicity. The existing `.bak` step can stay as belt-and-suspenders or be removed; either is defensible.

### 4.3 `delete_server` is the worst-case blocking endpoint

`async def delete_server` (line 2091) has:
- 3 direct `subprocess.run()` calls (2110, 2114, 2117)
- 1 indirect blocking call via `_manage_ports` (2121)
- Synchronous on-disk tree removal after that (lines ~2125+)

Fixing this one endpoint alone is non-trivial — it's the largest single concentration of event-loop stalls in the file.

### 4.4 `aigm_opord_load` stub — missing context

The stub (lines 5400–5404) sits in a cluster of real bridge-calling endpoints (e.g., `aigm_opord_parse` at line ~5385 makes a real `httpx.AsyncClient` POST to `{BRIDGE}/api/aigm/opord/parse`). The stub likely needs to make a matching POST to `{BRIDGE}/api/aigm/opord/load` with some payload — but what that payload should be is an AI-GM bridge API question, not a backend question. A fix session needs to either consult the bridge or be told what to pass.

## 5. Risk Assessment for Fix Work

### The monolithic-file problem

Every issue identified is in **the same file**: `/opt/panel/backend/main.py`. This is the central constraint for planning fix work.

Per project memory (`project_parallel_session_wipe_incident.md`), concurrent Claude sessions have already clobbered `/opt/panel` work on this codebase. The wipe incident is exactly the risk pattern that "delegate fixes to multiple sessions working the same file" triggers. **This is a strong argument against parallel delegation.**

### Fix complexity ranking (smallest → largest)

1. **Trivial mechanical** — `datetime.utcnow()` → `datetime.now(timezone.utc)` × 7 lines; add `import timezone`. Pure find/replace.
2. **Small, localized** — `auth_middleware` line 711 wrap in `asyncio.to_thread`.
3. **Small, localized** — `write_config()` atomic rename pattern.
4. **Small, localized** — `COOKIE_SECURE` (already done, no work).
5. **Medium, scattered** — 10 direct `subprocess.run()` in async bodies. Mechanical but in 5 different functions.
6. **Medium, requires audit** — 6 sync subprocess helpers called from async endpoints. Needs tracing every caller.
7. **Medium, architectural** — Add `import logging`, replace `print()` calls, set up logger. Touches many lines but individually simple.
8. **Unknown scope** — `aigm_opord_load` stub. Needs bridge API context first.

## 6. Delegation Recommendation

### **Primary recommendation: ONE session, sequential phases.**

**Why:**
1. **All work is in one 6,248-line file.** Concurrent edits to the same file on this exact codebase has already caused lost work.
2. **Scope is bounded.** Total fix work is well within one session's capacity — maybe 60–90 minutes of focused editing, not days of effort.
3. **Dependency coupling.** Adding `import logging` affects every function that currently uses `print()`. A session doing subprocess fixes will want access to the logger. Sequencing matters.
4. **Verification is cleaner with one committer.** One session can run tests, check git status, and commit in logical chunks without worrying about rebasing against another session's WIP.
5. **The two-session audit chain already cost us a reviewer pass to reconcile conflicting claims.** Don't repeat the pattern on the fix side.

### **If you insist on splitting: use git worktrees, not parallel sessions on the same tree.**

The `superpowers:using-git-worktrees` skill exists for exactly this. Each delegated session gets its own worktree on its own branch, and you merge sequentially afterward. **Never run two sessions against `/opt/panel` directly at the same time** — that is the wipe scenario.

### Fix phasing (single session — my recommendation)

**Phase 1 — Mechanical correctness (low risk, high value, fast)**
- All 7 `datetime.utcnow()` → `datetime.now(timezone.utc)`
- `write_config()` atomic write via `tempfile + os.replace`
- `auth_middleware` line 711 → wrap in `asyncio.to_thread`
- Verify, commit as one "fix(backend): correctness pass" commit.

**Phase 2 — Async blocking (the big one)**
- Wrap all 10 direct `subprocess.run()` in `asyncio.to_thread` (or switch to `asyncio.create_subprocess_exec` where streaming output matters)
- Audit the 6 sync subprocess helpers for async callers; wrap at call sites or convert helpers
- Verify `delete_server` and `provision_server` still work end-to-end (these are destructive, worth manual smoke-test)
- Commit as "fix(backend): unblock event loop on subprocess calls"

**Phase 3 — Logging architecture**
- Add `import logging`, configure root logger
- Replace `print("[WARN] …")` / `print("[INFO] …")` with `logger.warning` / `logger.info`
- Commit as "refactor(backend): structured logging"

**Phase 4 — `aigm_opord_load` stub (only if AI-GM bridge API is known)**
- Defer unless the bridge contract is documented. Otherwise this becomes a rabbit hole.

### If splitting is non-negotiable — 2 worktree sessions

**Session A worktree** — Phases 1 + 2 (correctness + async unblocking). Owns all the `subprocess.run` and `datetime.utcnow` work. Single logical theme.

**Session B worktree** — Phase 3 (logging refactor). Completely orthogonal to A: A never touches a `print()` call, B never touches a `subprocess.run`. Minimal merge conflict surface.

Phase 4 (stub) stays deferred until someone can answer the bridge API question.

**Do not attempt 3 sessions.** The third cut would have to slice inside Phase 2 (e.g., "you do provision_server, I'll do delete_server"), and that puts two editors in the same file region — too close to the wipe pattern.

---

## 7. Verdict

- **Audit chain is trustworthy.** FINAL doc claims verified; the one flagged line-number error (`_manage_ports`) is confirmed and minor.
- **Scope is correct** (10 direct blocking calls, 7 `datetime.utcnow`, 1 middleware blocking read, 1 non-atomic write, 1 stub, logging gap) but **scope is also incomplete** — the 6 sync subprocess helpers with async callers are not yet on the fix list and should be.
- **One session, sequential, is the right delegation choice.** Parallel sessions on `/opt/panel/backend/main.py` has a documented history of clobbering work; the fix surface isn't large enough to justify the risk.
