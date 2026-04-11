# SITREP Panel — Claude Code Context

## Branch policy — read this before doing anything

**Never commit to `main`. Never push to `main`. Never merge to `main`.**

All work — Claude Code sessions, scripted edits, anything automated — goes on the `dev` branch. The user is the only one who promotes `dev` to `main`, and only after manually verifying the changes.

The flow:
1. `git checkout dev` (or `git checkout -b dev origin/dev` if it doesn't exist locally)
2. Make changes, commit on `dev`
3. `git push origin dev`
4. Stop. Tell the user the work is ready on `dev` for review.
5. The user (not Claude) decides when and how to merge `dev` into `main`.

If `main` is currently checked out when a session starts, switch to `dev` before making any edits.

## Live system safety

This repo lives at `/opt/panel/` and **is the running production panel**. The systemd service `sitrep-api.service` serves directly from this directory.

- The backend Python venv at `/opt/panel/backend/.venv/` is **load-bearing** and is managed by `uv` from `backend/pyproject.toml` + `backend/uv.lock`. Rebuild with `cd /opt/panel/backend && uv sync --frozen`. Do not `rm -rf` it without stopping `sitrep-api` first — a previous session wiped the env and left the service running as a zombie process holding deleted file handles.
- The systemd unit at `/etc/systemd/system/sitrep-api.service` hardcodes `/opt/panel/backend/.venv/bin/uvicorn`. If you migrate to a different venv layout the unit file MUST be updated in the same change.
- `httpx` calls in `backend/main.py` rely on `certifi` being present in the venv. If certifi is missing, SSL verification fails with `unable to get local issuer certificate` even though the system CA store is fine.
- When testing commands, use `/tmp/` — never `mkdir`/`touch` placeholder files inside `/opt/panel/`. If a plan template has example paths like `bin/`, `python`, `.env_new`, `data_new/`, **substitute the real paths before running** rather than creating literal stubs in the repo.

## Stack
- Frontend: React 19 + Tailwind 4 + Recharts (Vite 8, single file `frontend/src/App.jsx` ~5100 lines)
- Backend: FastAPI + Uvicorn (port 8000) — also serves built frontend static files
- Auth: HttpOnly cookies (24h JWT access + opaque refresh token), PBKDF2-SHA256 password hashing
- Systemd: single service `sitrep-api` on port 8000

## File Layout
```
/opt/panel/
├── backend/
│   ├── main.py              # FastAPI backend (~4800 lines, single file)
│   ├── pyproject.toml       # uv project — source of truth for Python deps
│   ├── uv.lock              # uv lockfile (committed)
│   ├── requirements.txt     # Legacy mirror of deps (kept for reference only)
│   ├── data/                # Runtime data (gitignored) — users, tokens, DBs
│   └── .venv/               # Python virtualenv (gitignored, managed by uv)
├── frontend/
│   ├── src/App.jsx          # Entire frontend (~5100 lines, single file)
│   ├── package.json
│   └── dist/                # Built output (gitignored) — served by backend
├── servers/                 # Per-server config + runtime data (data/ gitignored)
├── install.sh               # One-liner installer for new users
├── .env                     # Local config (gitignored) — use .env.example
├── .env.example             # Config template (committed)
└── README.md                # User documentation
```

## Build & Deploy
```bash
# Build frontend
cd /opt/panel/frontend && npm run build

# Restart backend (also re-serves new frontend build)
sudo systemctl restart sitrep-api

# View logs
journalctl -u sitrep-api -f

# Run backend tests
cd /opt/panel/backend && venv/bin/pytest tests/ -v
```

## Key Architecture Notes
- App.jsx is a single dense file — use targeted find/replace, not rewrites
- Backend install path: `/opt/panel`, game server at `/opt/arma-server`
- ARMA server expected at `/opt/arma-server/` with systemd service `arma-reforger`
- SteamCMD expected at `/usr/games/steamcmd`
- PANEL_URL set in `/opt/panel/.env` — drives CORS and Discord OAuth

## Auth System
- Access token: `sitrep-access` cookie — 24h JWT, HttpOnly, SameSite=Strict
- Refresh token: `sitrep-refresh` cookie — opaque hex ID, 30d (Remember Me) or session
- Token revocation: `tokens_valid_after` field per user, checked on every request
- Password hashing: PBKDF2-SHA256 with per-user salt, 100k iterations

## Code Style
- Python: FastAPI routes, async where beneficial
- React: functional components, hooks, no external state library
- Use Recharts for all data visualization
- All UI theme-aware via `useT()` hook → `{C, sz}` (colors + font sizes)
- No emoji in code unless user explicitly requests it
