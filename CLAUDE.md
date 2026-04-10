# SITREP Panel — Claude Code Context

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
│   ├── requirements.txt     # Python deps — includes PyJWT
│   ├── data/                # Runtime data (gitignored) — users, tokens, DBs
│   └── venv/                # Python virtualenv (gitignored)
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
