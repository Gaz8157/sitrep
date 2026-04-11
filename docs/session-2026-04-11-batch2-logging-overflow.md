# Session 2026-04-11 — Batch 2: Logging Refactor + Dashboard Overflow Fix

## Work done this session

### Commit 3bd8d2c — Structured logging (backend)

**File:** `backend/main.py`

Added stdlib logging infrastructure after the `.env` load block (so `LOG_LEVEL` from `.env` is honored at import time) and before `PANEL_URL` is read:

```python
import logging
logger = logging.getLogger("sitrep")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(_h)
    logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
    logger.propagate = False
```

The `if not logger.handlers` guard prevents duplicate handlers when the module is reimported (tests do this).

Replaced 10 `print()` calls with lazy-formatted logger equivalents:

| Original | Replacement |
|---|---|
| `print(f"[WARN] Token revocation check failed: {e}")` | `logger.warning("Token revocation check failed: %s", e)` |
| `print(f"[SITREP] diagnostics failed to run: {e}", ...)` | `logger.error("Diagnostics failed to run: %s", e)` |
| `print(f"[SITREP] diagnostics OK — {len(result['checks'])} checks passed", ...)` | `logger.info("Diagnostics OK — %d checks passed", len(result['checks']))` |
| `print(f"[SITREP] diagnostics {sev}: {result['fails']} fail, ...")` (multi-line) | `logger.warning("Diagnostics %s: %d fail, %d warn, %d total", sev, ...)` |
| `print(f"[SITREP] {c['status'].upper():4s} {c['id']}: ...")` | `_lvl = logger.warning if c['status'] == 'fail' else logger.info; _lvl("%-4s %s: %s — %s", ...)` |
| `print(f"[SITREP]      fix: {c['fix']}", ...)` | `logger.warning("     fix: %s", c['fix'])` |
| `print(f"[SITREP] SMTP send failed: {e}")` | `logger.error("SMTP send failed: %s", e)` |
| `print(f"[SITREP] Owner account created via setup wizard: {username}")` | `logger.info("Owner account created via setup wizard: %s", username)` |
| `print(f"[TRACKER] /track parse error: {e!r}  content-type={ct!r}  raw_head={raw[:200]!r}")` | `logger.warning("[tracker] /track parse error: %r  content-type=%r  raw_head=%r", e, ct, raw[:200])` |
| `print(f"[TRACKER] /event parse error: {e!r}  content-type={ct!r}  raw_head={raw[:200]!r}")` | `logger.warning("[tracker] /event parse error: %r  content-type=%r  raw_head=%r", e, ct, raw[:200])` |

**Verification:** 53/53 backend tests pass. `import main; print('OK')` prints OK.

---

### Commit 77845ef — Dashboard overflow fix (frontend)

**File:** `frontend/src/tabs/Dashboard.jsx`, line 93

**Problem:** The stat box row used `flex-nowrap`. With 5 boxes at `min-w-[120px]` each plus 4 gaps at 10px, the row requires at least 640px. The App sidebar is 210px + 40px padding = 250px overhead. Any browser viewport narrower than ~890px caused horizontal overflow. The `overflow-auto` content area showed a horizontal scrollbar and the right column (Players/Console panels) was pushed off-screen.

**Fix:** `flex-nowrap` → `flex-wrap`. Stat boxes now reflow to a second row instead of overflowing. Each `StatBox` has `flex-1 min-w-[120px]` so boxes on each row grow to fill the available width.

**Build:** `npm run build` clean.

---

## Backup

`/home/mark/backups/sitrep-panel-2026-04-11-post-batch2.tar.gz` — commit `77845ef`, branch `dev`

---

## What's NOT done (deferred)

- `aigm_opord_load` stub — needs AI-GM bridge API contract (what payload to POST to `/api/aigm/opord/load`)
- 6 sync subprocess helpers called from async endpoints without `asyncio.to_thread` — see BACKEND_AUDIT independent verification §4.1 for the list. Batch 1 fixed the 10 direct calls; indirect calls via helpers remain
