"""
SITREP — Arma Reforger Server Panel Backend (Beta)
Direct SteamCMD + systemd. No LinuxGSM.
"""

import asyncio, re, json, os, time, subprocess, shutil, socket, hashlib, hmac, secrets, math, zlib, struct, sqlite3, ipaddress, zipfile, threading, urllib.parse, getpass
from threading import Lock
try:
    import miniupnpc
    UPNP_AVAILABLE = True
except ImportError:
    miniupnpc = None
    UPNP_AVAILABLE = False
import httpx
from pathlib import Path
from datetime import datetime
from typing import Optional
import psutil
import jwt as pyjwt
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from pydantic import BaseModel

# Load .env file if present (before anything else reads env vars)
_env_path = Path("/opt/panel/.env")
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith('#') and '=' in _line:
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

# Single source of truth for the panel's public URL.
# Set PANEL_URL in /opt/panel/.env — no hardcoded IPs anywhere.
PANEL_URL = os.environ.get("PANEL_URL", "http://localhost:8000").rstrip("/")

# Cookie `secure` flag: on by default, auto-off for plain-HTTP PANEL_URL so
# local installs keep working without manual env flips. Override with
# COOKIE_SECURE=true/false in .env to force the behavior either way.
_cookie_secure_env = os.environ.get("COOKIE_SECURE", "").strip().lower()
if _cookie_secure_env in ("1", "true", "yes", "on"):
    COOKIE_SECURE = True
elif _cookie_secure_env in ("0", "false", "no", "off"):
    COOKIE_SECURE = False
else:
    COOKIE_SECURE = PANEL_URL.startswith("https://")

# Misfits Admin Tool profile dir name — override with MAT_PROFILE_DIR env var
# if you run a fork of MAT under a different folder name.
MAT_PROFILE_DIR_NAME = os.environ.get("MAT_PROFILE_DIR", "Misfits_Logging")

# SMTP — optional, enables email password reset
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "") or SMTP_USER

ARMA_DIR = Path("/opt/arma-server")
CONFIG_PATH = ARMA_DIR / "config.json"
PROFILE_DIR = ARMA_DIR / "profile"
LOG_DIR = PROFILE_DIR / "logs"
PANEL_DATA = Path("/opt/panel/backend/data")
SERVERS_FILE = PANEL_DATA / "servers.json"
SERVERS_DIR  = Path("/opt/panel/servers")
USER_PROFILES_FILE = PANEL_DATA / "user_profiles.json"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
IMAGE_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
RESET_TOKENS_FILE = PANEL_DATA / "reset_tokens.json"
STEAMCMD = "/usr/games/steamcmd"
SERVICE_NAME = "arma-reforger"
PROCESS_START = time.time()

_SKIP_FSTYPES = {
    'tmpfs','devtmpfs','sysfs','proc','cgroup','cgroup2','pstore','bpf','tracefs',
    'debugfs','hugetlbfs','mqueue','fusectl','efivarfs','configfs','securityfs',
    'squashfs','ramfs','nsfs','overlay','autofs',
}

def _get_disk_stats():
    disks = []
    seen = set()
    try:
        partitions = psutil.disk_partitions(all=False)
    except Exception:
        return disks
    for part in partitions:
        if part.fstype in _SKIP_FSTYPES: continue
        if part.device.startswith('/dev/loop'): continue
        if part.mountpoint in seen: continue
        if part.mountpoint in ('/boot/efi', '/boot'): continue
        seen.add(part.mountpoint)
        try:
            du = shutil.disk_usage(part.mountpoint)
            mp = part.mountpoint
            if mp == '/':
                name = 'Root'
            else:
                name = mp.split('/')[-1].replace('-', ' ').replace('_', ' ').title() or mp
            disks.append({"name": name, "mount": mp,
                "used": round(du.used / (1024**3)), "total": round(du.total / (1024**3))})
        except Exception:
            pass
    return disks

AIGM_DIR  = Path(os.environ.get("AIGM_DIR", str(Path.home() / "AIGameMaster")))
SAFE_DIRS = [ARMA_DIR, PROFILE_DIR, AIGM_DIR]

MAT_DIR       = ARMA_DIR / "profile/profile" / MAT_PROFILE_DIR_NAME
MAT_ACTIVE    = MAT_DIR  / "logs/Active_Players.log"
MAT_STATS     = MAT_DIR  / "logs/Server_Stats.json"
MAT_CONN_LOGS = MAT_DIR  / "logs/connection_logs.json"
MAT_KILL_LOGS = MAT_DIR  / "logs/kill_logs.json"

# === AUTH ===

SECRET_KEY_FILE = PANEL_DATA / "secret.key"
PANEL_USERS_FILE = PANEL_DATA / "panel_users.json"

REFRESH_TOKENS_FILE = PANEL_DATA / "refresh_tokens.json"

def load_refresh_tokens() -> dict:
    if REFRESH_TOKENS_FILE.exists():
        try:
            return json.loads(REFRESH_TOKENS_FILE.read_text())
        except Exception:
            pass
    return {"tokens": []}

def save_refresh_tokens(data: dict):
    tmp = REFRESH_TOKENS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(REFRESH_TOKENS_FILE)
    REFRESH_TOKENS_FILE.chmod(0o600)

def create_refresh_token(username: str, remember: bool = True, user_agent: str = '') -> str:
    with _refresh_tokens_lock:
        token_id = secrets.token_hex(32)
        data = load_refresh_tokens()
        now = int(time.time())
        data["tokens"] = [t for t in data["tokens"] if t["expires_at"] > now]
        # Without Remember Me the token matches the access JWT lifetime (24h).
        # With Remember Me it lives for 30 days — matching the cookie max_age.
        expiry = 2592000 if remember else 86400
        data["tokens"].append({
            "id": token_id,
            "username": username,
            "created_at": now,
            "expires_at": now + expiry,
            "remember": remember,
            "user_agent": (user_agent or '')[:200],
        })
        save_refresh_tokens(data)
        return token_id

def _session_sid(token_id: str) -> str:
    """Stable, non-reversible identifier for a session — safe to expose to the frontend."""
    return hmac.new(SECRET_KEY.encode(), token_id.encode(), hashlib.sha256).hexdigest()[:16]

def _device_type(user_agent: str) -> str:
    """Classify a User-Agent string as 'mobile', 'tablet', or 'desktop'."""
    ua = (user_agent or '').lower()
    if any(x in ua for x in ('iphone', 'android', 'mobile')):
        return 'mobile'
    if any(x in ua for x in ('ipad', 'tablet')):
        return 'tablet'
    return 'desktop'

def validate_refresh_token(token_id: str) -> Optional[str]:
    """Returns username if token is valid, None otherwise. Prunes expired tokens."""
    if not token_id:
        return None
    with _refresh_tokens_lock:
        data = load_refresh_tokens()
        now = int(time.time())
        entry = next((t for t in data["tokens"] if t["id"] == token_id), None)
        if not entry or entry["expires_at"] <= now:
            data["tokens"] = [t for t in data["tokens"] if t["expires_at"] > now]
            save_refresh_tokens(data)
            return None
        return entry["username"]

def delete_refresh_token(token_id: str):
    if not token_id:
        return
    with _refresh_tokens_lock:
        data = load_refresh_tokens()
        data["tokens"] = [t for t in data["tokens"] if t["id"] != token_id]
        save_refresh_tokens(data)

def delete_refresh_tokens_for_user(username: str):
    """Remove all refresh tokens for a user (called on password change / force logout)."""
    with _refresh_tokens_lock:
        data = load_refresh_tokens()
        data["tokens"] = [t for t in data["tokens"] if t["username"] != username]
        save_refresh_tokens(data)

ROLE_ORDER = {"owner": 4, "head_admin": 3, "admin": 2, "moderator": 1, "viewer": 0, "demo": 0}

PERMISSIONS_FILE = PANEL_DATA / "permissions.json"

# Default minimum role required for each action.
# Owner always bypasses all checks — these control admin/moderator/viewer access.
PERMISSION_DEFAULTS = {
    "server.control":  "viewer",       # start / stop / restart — everyone
    "server.update":   "viewer",       # SteamCMD update / validate — everyone
    "server.reset":    "viewer",       # wipe saves / logs — everyone
    "config.write":    "moderator",    # save server config & mods
    "admins.write":    "admin",        # add / remove in-game admins + SAT config
    "bans.write":      "moderator",    # ban / unban players
    "files.read":      "viewer",       # browse & read files — everyone
    "files.write":     "admin",        # edit & save files
    "crontab.write":   "admin",        # manage scheduled tasks
    "webhooks.write":  "admin",        # configure webhooks
}

# Permissions demo role is explicitly granted regardless of the permission table.
# Demo can start/stop the server and read files, but cannot make any changes.
DEMO_ALLOWED_PERMS = frozenset({"server.control", "files.read"})

PERMISSION_LABELS = {
    "server.control":  "Start / Stop / Restart server",
    "server.update":   "Update server via SteamCMD",
    "server.reset":    "Reset server (wipe saves / logs)",
    "config.write":    "Edit server config & mods",
    "admins.write":    "Manage in-game admins (SAT)",
    "bans.write":      "Ban / unban players",
    "files.read":      "Browse and read server files",
    "files.write":     "Edit and save server files",
    "crontab.write":   "Add / remove scheduled tasks",
    "webhooks.write":  "Configure Discord webhooks",
}

PERMISSION_GROUPS = {
    "Server":  ["server.control", "server.update", "server.reset"],
    "Config":  ["config.write"],
    "Players": ["admins.write", "bans.write"],
    "Files":   ["files.read", "files.write"],
    "System":  ["crontab.write", "webhooks.write"],
}

def load_permissions(data_dir: Path = PANEL_DATA) -> dict:
    path = data_dir / "permissions.json"
    if path.exists():
        try:
            saved = json.loads(path.read_text())
            return {**PERMISSION_DEFAULTS, **{k: v for k, v in saved.items() if k in PERMISSION_DEFAULTS and v in ROLE_ORDER}}
        except: pass
    return dict(PERMISSION_DEFAULTS)

# Expose head_admin as a user-manageable role (owner can assign it)
ASSIGNABLE_ROLES = ["head_admin", "admin", "moderator", "viewer", "demo"]

# === SERVER REGISTRY ===

def load_servers() -> dict:
    if SERVERS_FILE.exists():
        try: return json.loads(SERVERS_FILE.read_text())
        except: pass
    return {"servers": [], "next_id": 1}

def save_servers(data: dict):
    tmp = SERVERS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(SERVERS_FILE)

def get_server_by_id(server_id: int) -> Optional[dict]:
    return next((s for s in load_servers()["servers"] if s["id"] == server_id), None)

def get_default_server() -> dict:
    """Returns server #1, creating registry from current constants if needed."""
    s = get_server_by_id(1)
    return s if s else _init_server_registry()

def srv(request: Request) -> dict:
    return getattr(request.state, 'server', None) or get_default_server()

def srv_arma_dir(request: Request) -> Path:
    return Path(srv(request)["install_dir"])

def srv_profile_dir(request: Request) -> Path:
    return Path(srv(request)["profile_dir"])

def srv_config_path(request: Request) -> Path:
    return Path(srv(request)["config_path"])

def srv_log_dir(request: Request) -> Path:
    return srv_profile_dir(request) / "logs"

def srv_service_name(request: Request) -> str:
    return srv(request)["service_name"]

def srv_data_dir(request: Request) -> Path:
    return Path(srv(request)["data_dir"])

def player_db_path(data_dir: Path) -> Path:
    return data_dir / "players.db"

def _init_server_registry() -> dict:
    """One-time migration: register existing single-server setup as server #1."""
    server1 = {
        "id": 1,
        "name": "Main Server",
        "description": "",
        "tags": [],
        "install_dir": str(ARMA_DIR),
        "data_dir": str(PANEL_DATA),
        "config_path": str(CONFIG_PATH),
        "profile_dir": str(PROFILE_DIR),
        "service_name": SERVICE_NAME,
        "port": 2001,
        "created": datetime.utcnow().isoformat(),
        "cloned_from": None
    }
    data = load_servers()
    if not any(s["id"] == 1 for s in data["servers"]):
        data["servers"].append(server1)
        data["next_id"] = 2
        save_servers(data)
        return server1
    return next(s for s in data["servers"] if s["id"] == 1)

def save_permissions(data: dict, data_dir: Path = PANEL_DATA):
    valid = {k: v for k, v in data.items() if k in PERMISSION_DEFAULTS and v in ROLE_ORDER}
    path = data_dir / "permissions.json"
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(valid, indent=2))
    tmp.replace(path)

def require_permission(request: Request, perm: str) -> Optional[JSONResponse]:
    user = current_user(request)
    if user["role"] == "owner":
        return None
    if user["role"] == "demo":
        if perm in DEMO_ALLOWED_PERMS:
            return None
        return JSONResponse({"error": "Demo users cannot make changes"}, status_code=403)
    min_role = load_permissions(PANEL_DATA).get(perm, PERMISSION_DEFAULTS.get(perm, "admin"))
    if ROLE_ORDER.get(user["role"], 0) < ROLE_ORDER.get(min_role, 0):
        return JSONResponse({"error": f"Your role does not have access to '{perm}'"}, status_code=403)
    return None

def get_or_create_secret():
    PANEL_DATA.mkdir(parents=True, exist_ok=True)
    if SECRET_KEY_FILE.exists():
        return SECRET_KEY_FILE.read_text().strip()
    key = secrets.token_hex(32)
    SECRET_KEY_FILE.write_text(key)
    SECRET_KEY_FILE.chmod(0o600)
    return key

SECRET_KEY = get_or_create_secret()

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{h.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split(':', 1)
        expected = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return secrets.compare_digest(expected.hex(), h)
    except:
        return False

def load_panel_users(data_dir: Path = PANEL_DATA):
    path = data_dir / "panel_users.json"
    if path.exists():
        try: return json.loads(path.read_text())
        except: pass
    return {"users": []}

def save_panel_users(data, data_dir: Path = PANEL_DATA):
    path = data_dir / "panel_users.json"
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)
    path.chmod(0o600)

def load_user_profiles(data_dir: Path = PANEL_DATA) -> dict:
    path = data_dir / "user_profiles.json"
    if path.exists():
        try: return json.loads(path.read_text())
        except: pass
    return {}

def save_user_profiles(data: dict, data_dir: Path = PANEL_DATA):
    path = data_dir / "user_profiles.json"
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)
    path.chmod(0o600)

def init_panel_users():
    """Ensure data dir exists. Account creation now happens via the setup wizard on first launch."""
    PANEL_DATA.mkdir(parents=True, exist_ok=True)

def needs_setup() -> bool:
    """Returns True if no owner account exists yet (first-run state)."""
    data = load_panel_users()
    return not any(u.get("role") == "owner" for u in data.get("users", []))

init_panel_users()

# === RATE LIMITING ===
# === GLOBAL RATE LIMITING (DDoS protection) ===
# Sliding window per IP — two tiers: burst (short window) and sustained (per minute)
from collections import deque
_global_rate: dict = {}          # ip -> deque of timestamps
_global_rate_lock = Lock()
_RATE_PER_MINUTE   = 200         # max requests per 60s per IP
_RATE_BURST        = 40          # max requests per 5s per IP (burst)
_RATE_EXEMPT       = {"127.0.0.1", "::1"}  # never rate-limit localhost

def _check_global_rate(ip: str) -> bool:
    """Returns True (allow) or False (block). Thread-safe."""
    if ip in _RATE_EXEMPT: return True
    now = time.time()
    with _global_rate_lock:
        if ip not in _global_rate:
            _global_rate[ip] = deque()
        dq = _global_rate[ip]
        # Evict entries older than 60s
        while dq and dq[0] < now - 60:
            dq.popleft()
        burst = sum(1 for t in dq if t > now - 5)
        if burst >= _RATE_BURST or len(dq) >= _RATE_PER_MINUTE:
            return False
        dq.append(now)
        return True

# Tracks failed login attempts per IP: {ip: [timestamp, ...]}
_login_attempts: dict = {}
_login_attempts_lock = threading.Lock()
_refresh_tokens_lock = threading.Lock()
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 300   # 5 minutes
_LOGIN_LOCKOUT_SECONDS = 900  # 15 minutes

# === TRACKER STATE ===
TRACKER_DB = PANEL_DATA / "tracker.db"
TRACKER_SETTINGS_FILE = PANEL_DATA / "tracker_settings.json"
PLAYERTRACKER_API_KEY = os.environ.get("PLAYERTRACKER_API_KEY", "")

_TRACKER_LATEST_SNAPSHOTS: dict = {}   # mod_server_id -> {uid: snapshot}
_TRACKER_RECENT_EVENTS: dict = {}       # mod_server_id -> deque
_TRACKER_LAST_RX: dict = {}             # mod_server_id -> timestamp
_TRACKER_FORWARD_STATUS: dict = {}
_TRACKER_SETTINGS_LOCK = Lock()
_TRACKER_DB_LOCK = Lock()
_TRACKER_STATE_LOCK = Lock()
_TRACKER_DEFAULT_SETTINGS: dict = {
    "events_cap": 100,
    "snapshot_ttl_sec": 0,
    "sqlite_enabled": False,
    "sqlite_retention_days": 30,
    "forward_destinations": [],
}

def _tracker_load_settings() -> dict:
    try:
        raw = json.loads(TRACKER_SETTINGS_FILE.read_text())
        merged = dict(_TRACKER_DEFAULT_SETTINGS)
        merged.update({k: v for k, v in raw.items() if k in _TRACKER_DEFAULT_SETTINGS})
        return merged
    except Exception:
        return dict(_TRACKER_DEFAULT_SETTINGS)

def _tracker_save_settings(s: dict):
    tmp = TRACKER_SETTINGS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(s, indent=2))
    tmp.replace(TRACKER_SETTINGS_FILE)

def _tracker_events_cap() -> int:
    try:
        return max(1, int(_tracker_load_settings().get("events_cap", 100)))
    except Exception:
        return 100

def _tracker_events_deque(mod_id: str) -> deque:
    dq = _TRACKER_RECENT_EVENTS.get(mod_id)
    if dq is None:
        dq = deque(maxlen=_tracker_events_cap())
        _TRACKER_RECENT_EVENTS[mod_id] = dq
    return dq

def _tracker_panel_mod_id(request: Request) -> str:
    srv = getattr(request.state, "server", None) or {}
    return (srv.get("tracker_mod_id") or "").strip()

def _tracker_recent_mod_ids(max_age_sec: int = 300) -> list:
    now = time.time()
    known = {(s.get("tracker_mod_id") or "") for s in load_servers().get("servers", [])}
    known.discard("")
    out = []
    with _TRACKER_STATE_LOCK:
        rows = sorted(_TRACKER_LAST_RX.items(), key=lambda x: -x[1])
    for mid, ts in rows:
        if (now - ts) > max_age_sec:
            continue
        out.append({"mod_server_id": mid, "last_rx": ts, "assigned": mid in known})
    return out

def _tracker_check_key(request: Request) -> bool:
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return True
    key = request.headers.get("X-Api-Key", "") or request.query_params.get("key", "")
    return bool(PLAYERTRACKER_API_KEY and key == PLAYERTRACKER_API_KEY)

def _tracker_db_init():
    if not _tracker_load_settings()["sqlite_enabled"]:
        return
    with _TRACKER_DB_LOCK:
        conn = sqlite3.connect(TRACKER_DB)
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS tr_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id TEXT, ts INTEGER, session_time INTEGER,
                    players_total INTEGER, players_alive INTEGER,
                    map TEXT, players_json TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_snap_ts ON tr_snapshots(ts);
                CREATE INDEX IF NOT EXISTS ix_snap_srv ON tr_snapshots(server_id);
                CREATE TABLE IF NOT EXISTS tr_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id TEXT, ts INTEGER, event_type TEXT, data_json TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_ev_ts ON tr_events(ts);
                CREATE INDEX IF NOT EXISTS ix_ev_type ON tr_events(event_type);
                CREATE INDEX IF NOT EXISTS ix_ev_srv ON tr_events(server_id);
            """)
            conn.commit()
        finally:
            conn.close()

def _tracker_db_prune(retention_days: int):
    cutoff = int(time.time()) - retention_days * 86400
    with _TRACKER_DB_LOCK:
        conn = sqlite3.connect(TRACKER_DB)
        try:
            conn.execute("DELETE FROM tr_snapshots WHERE ts < ?", (cutoff,))
            conn.execute("DELETE FROM tr_events WHERE ts < ?", (cutoff,))
            conn.commit()
        finally:
            conn.close()

async def _tracker_forward(payload: dict, kind: str):
    settings = _tracker_load_settings()
    dests = settings.get("forward_destinations", [])
    for dest in dests:
        if not dest.get("enabled", True):
            continue
        name = dest.get("name", "unnamed")
        event_types = dest.get("event_types", [])
        if event_types and kind not in event_types:
            continue
        srv_glob = dest.get("server_id_glob", "")
        if srv_glob and srv_glob != "*":
            import fnmatch
            if not fnmatch.fnmatch(payload.get("server_id", ""), srv_glob):
                continue
        asyncio.create_task(_tracker_send_dest(dest, payload, kind))

async def _tracker_send_dest(dest: dict, payload: dict, kind: str):
    name = dest.get("name", "unnamed")
    url = dest.get("url", "")
    method = dest.get("method", "POST").upper()
    headers = dict(dest.get("headers", {}))
    timeout = float(dest.get("timeout_sec", 10))
    retries = int(dest.get("retry_count", 0))
    backoff = float(dest.get("retry_backoff_sec", 2))
    template = dest.get("transform_template", "")
    ts = int(time.time())
    if template:
        body = template.replace("{{payload}}", json.dumps(payload)).replace("{{kind}}", kind).replace("{{ts}}", str(ts))
        try:
            body_data = json.loads(body)
        except Exception:
            body_data = {"payload": payload, "kind": kind, "ts": ts}
    else:
        body_data = {"kind": kind, "ts": ts, "data": payload}
    last_err = ""
    for attempt in range(max(1, retries + 1)):
        try:
            async with httpx.AsyncClient(timeout=timeout) as c:
                fn = c.post if method == "POST" else c.put
                r = await fn(url, json=body_data, headers=headers)
                _TRACKER_FORWARD_STATUS[name] = {"ts": ts, "status": r.status_code, "ok": r.is_success}
                return
        except Exception as e:
            last_err = str(e)
            if attempt < retries:
                await asyncio.sleep(backoff)
    _TRACKER_FORWARD_STATUS[name] = {"ts": ts, "status": 0, "ok": False, "error": last_err}

def _clean_attempts(ip: str):
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts.get(ip, []) if now - t < _LOGIN_LOCKOUT_SECONDS]

def check_rate_limit(ip: str) -> Optional[JSONResponse]:
    with _login_attempts_lock:
        _clean_attempts(ip)
        attempts = _login_attempts.get(ip, [])
        recent = [t for t in attempts if time.time() - t < _LOGIN_WINDOW_SECONDS]
        if len(recent) >= _LOGIN_MAX_ATTEMPTS:
            latest = max(attempts)
            wait = int(_LOGIN_LOCKOUT_SECONDS - (time.time() - latest))
            wait = max(1, wait)
            return JSONResponse({"error": f"Too many failed attempts. Try again in {wait}s."}, status_code=429)
    return None

def record_failed_login(ip: str):
    with _login_attempts_lock:
        _login_attempts.setdefault(ip, []).append(time.time())

def clear_failed_login(ip: str):
    with _login_attempts_lock:
        _login_attempts.pop(ip, None)

def create_token(username: str, role: str) -> str:
    now = int(time.time())
    payload = {"sub": username, "role": role, "iat": now, "exp": now + 86400}
    return pyjwt.encode(payload, SECRET_KEY, algorithm="HS256")

def decode_token(token: str):
    try:
        return pyjwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except pyjwt.PyJWTError:
        return None

def set_access_cookie(response, token: str, max_age: int = 86400):
    """Set the sitrep-access cookie with consistent flags."""
    response.set_cookie(
        "sitrep-access", token,
        httponly=True, samesite="strict", secure=COOKIE_SECURE, max_age=max_age
    )

def set_auth_cookies(response, username: str, role: str, remember: bool = False, user_agent: str = ''):
    """Set sitrep-access (24h JWT) and sitrep-refresh (opaque ID) HttpOnly cookies."""
    token = create_token(username, role)
    refresh_id = create_refresh_token(username, remember=remember, user_agent=user_agent)
    set_access_cookie(response, token)
    response.set_cookie(
        "sitrep-refresh", refresh_id,
        httponly=True, samesite="strict", secure=COOKIE_SECURE,
        max_age=2592000 if remember else None  # None = session cookie (clears on browser close)
    )

def clear_auth_cookies(response):
    """Clear both auth cookies."""
    response.delete_cookie("sitrep-access", samesite="strict", secure=COOKIE_SECURE)
    response.delete_cookie("sitrep-refresh", samesite="strict", secure=COOKIE_SECURE)

app = FastAPI(title="SITREP")

# Auth middleware — protects all /api/* except public paths; injects server context
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Global rate limit — applied to ALL requests including static files
    client_ip = request.client.host if request.client else "unknown"
    if not _check_global_rate(client_ip):
        return JSONResponse(
            {"error": "Too many requests"},
            status_code=429,
            headers={"Retry-After": "10"}
        )
    PUBLIC_PATHS = {"/api/health", "/api/auth/login", "/api/settings/public",
                    "/api/auth/forgot-password", "/api/auth/reset-password",
                    "/api/auth/2fa/verify",
                    "/api/auth/discord", "/api/auth/discord/callback",
                    "/api/auth/refresh", "/api/auth/logout",
                    "/api/setup/status", "/api/setup/complete"}
    if not path.startswith("/api") or path in PUBLIC_PATHS:
        return await call_next(request)
    if path.startswith("/api/tracker/"):
        token = request.cookies.get("sitrep-access", "")
        if token:
            _pl = decode_token(token)
            if _pl and _pl.get("sub") and _pl.get("role") in ROLE_ORDER:
                request.state.user = {"username": _pl["sub"], "role": _pl["role"]}
        # Panel UI sends X-Server-ID so tracker admin endpoints can scope by current server;
        # mod POSTs (no cookie, no header) keep server=None and key off payload.server_id.
        _sid = request.headers.get("X-Server-ID", "")
        if _sid:
            try:
                _srv = get_server_by_id(int(_sid))
                request.state.server = _srv if _srv else None
            except ValueError:
                request.state.server = None
        else:
            request.state.server = None
        return await call_next(request)
    token = request.cookies.get("sitrep-access", "")
    payload = decode_token(token) if token else None
    if not payload:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    sub = payload.get("sub")
    role = payload.get("role")
    if not sub or role not in ROLE_ORDER:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    request.state.user = {"username": sub, "role": role}
    # Revocation check — reject tokens issued before tokens_valid_after
    iat = payload.get("iat", 0)
    try:
        _users_data = load_panel_users(PANEL_DATA)
        _u = next((u for u in _users_data["users"] if u["username"] == sub), None)
        if _u and iat < _u.get("tokens_valid_after", 0):
            return JSONResponse({"error": "Session expired — please log in again"}, status_code=401)
    except Exception as e:
        print(f"[WARN] Token revocation check failed: {e}")
        return JSONResponse({"error": "Authentication check failed"}, status_code=401)
    # Panel-level routes (server list, provision) handle server context themselves
    if path.startswith("/api/servers"):
        request.state.server = None
        return await call_next(request)
    # Inject server context — defaults to server #1 for full backward compat
    server_id_str = request.headers.get("X-Server-ID", "")
    if server_id_str:
        try:
            srv = get_server_by_id(int(server_id_str))
            if not srv:
                return JSONResponse({"error": f"Server {server_id_str} not found"}, status_code=404)
            request.state.server = srv
        except ValueError:
            return JSONResponse({"error": "Invalid X-Server-ID header"}, status_code=400)
    else:
        request.state.server = get_default_server()
    return await call_next(request)

def current_user(request: Request):
    return getattr(request.state, "user", {"username": "unknown", "role": "viewer"})

def is_demo(request: Request) -> bool:
    return current_user(request).get("role") == "demo"

def require_role(request: Request, min_role: str):
    user = current_user(request)
    if ROLE_ORDER.get(user["role"], 0) < ROLE_ORDER.get(min_role, 0):
        return JSONResponse({"error": f"{min_role} access required"}, status_code=403)
    return None
def _get_cors_origins():
    origins = {PANEL_URL, "http://localhost:8000", "http://127.0.0.1:8000"}
    try:
        s = json.loads((PANEL_DATA / "settings.json").read_text())
        url = s.get("frontend_url", "").rstrip("/")
        if url: origins.add(url)
    except: pass
    return list(origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Server-ID"],
)
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

PANEL_DATA.mkdir(parents=True, exist_ok=True)
SERVERS_DIR.mkdir(parents=True, exist_ok=True)
_init_server_registry()

_net_prev = {"ts": 0, "sent": 0, "recv": 0}
_net_rate = {"up_mbps": 0.0, "down_mbps": 0.0}
ws_clients: list[WebSocket] = []

def systemctl(action, service_name=SERVICE_NAME, timeout=60):
    try:
        r = subprocess.run(["sudo", "systemctl", action, service_name],
            capture_output=True, text=True, timeout=timeout)
        return {"output": (r.stdout + r.stderr).strip(), "returncode": r.returncode}
    except subprocess.TimeoutExpired:
        return {"error": f"Timed out ({timeout}s)"}
    except Exception as e:
        return {"error": str(e)}

def is_server_running(service_name: str = SERVICE_NAME) -> bool:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "--quiet", service_name],
            capture_output=True
        )
        return result.returncode == 0
    except Exception:
        return False

def get_server_pid(service_name: str = SERVICE_NAME) -> Optional[int]:
    try:
        result = subprocess.run(
            ["systemctl", "show", service_name, "--property=MainPID", "--value"],
            capture_output=True, text=True
        )
        pid = int(result.stdout.strip())
        return pid if pid > 0 else None
    except Exception:
        return None

def _fmt_elapsed(elapsed: float) -> str:
    d,h,m = int(elapsed//86400), int((elapsed%86400)//3600), int((elapsed%3600)//60)
    if d > 0: return f"{d}d {h}h {m}m"
    if h > 0: return f"{h}h {m}m"
    return f"{m}m"

def get_uptime(service_name: str = SERVICE_NAME):
    pid = get_server_pid(service_name)
    if not pid: return "---"
    try:
        elapsed = time.time() - psutil.Process(pid).create_time()
        d,h,m = int(elapsed//86400), int((elapsed%86400)//3600), int((elapsed%3600)//60)
        if d > 0: return f"{d}d {h}h {m}m"
        if h > 0: return f"{h}h {m}m"
        return f"{m}m"
    except:
        return "---"

def get_system_stats():
    global _net_prev, _net_rate
    cpu_pct = psutil.cpu_percent(interval=0.1)
    cpu_freq = psutil.cpu_freq()
    cpu_temp = 0
    try:
        for name, entries in psutil.sensors_temperatures().items():
            for e in entries:
                if e.current > cpu_temp: cpu_temp = int(e.current)
    except: pass
    mem = psutil.virtual_memory()
    disks = _get_disk_stats()
    gpu = {"name":"N/A","usage":0,"temp":0,"vram_used":0,"vram_total":0,"power":0}
    try:
        r = subprocess.run(["nvidia-smi","--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw",
            "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            p = [x.strip() for x in r.stdout.strip().split(',')]
            if len(p) >= 6:
                gpu = {"name":p[0],"usage":int(float(p[1])),"temp":int(float(p[2])),
                    "vram_used":round(float(p[3])/1024,1),"vram_total":round(float(p[4])/1024,1),
                    "power":int(float(p[5]))}
    except: pass
    cpu_name = "Unknown"
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if "model name" in line: cpu_name = line.split(":")[1].strip(); break
    except: pass
    net = psutil.net_io_counters()
    now = time.time()
    if _net_prev["ts"] > 0:
        dt = now - _net_prev["ts"]
        if dt > 0:
            _net_rate["up_mbps"] = round(((net.bytes_sent - _net_prev["sent"])*8)/(dt*1_000_000), 2)
            _net_rate["down_mbps"] = round(((net.bytes_recv - _net_prev["recv"])*8)/(dt*1_000_000), 2)
    _net_prev = {"ts": now, "sent": net.bytes_sent, "recv": net.bytes_recv}
    return {
        "cpu": {"name":cpu_name,"usage":round(cpu_pct,1),"temp":cpu_temp,
            "cores":psutil.cpu_count(logical=True),"freq":round(cpu_freq.current) if cpu_freq else 0},
        "gpu": gpu,
        "ram": {"used":round(mem.used/(1024**3),1),"total":round(mem.total/(1024**3),1)},
        "disks": disks, "network_rate": _net_rate,
        "os": f"Ubuntu {get_ubuntu_version()}",
    }

def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"

def get_ubuntu_version():
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("VERSION_ID="): return line.split("=")[1].strip().strip('"')
    except: pass
    return "24.04"

def get_network_stats():
    counters = psutil.net_io_counters()
    interfaces = []
    for name, addrs in psutil.net_if_addrs().items():
        if name == 'lo': continue
        info = {"name": name, "addresses": []}
        for addr in addrs:
            if addr.family == socket.AF_INET: info["addresses"].append({"type":"IPv4","address":addr.address})
            elif addr.family == socket.AF_INET6: info["addresses"].append({"type":"IPv6","address":addr.address})
        stats = psutil.net_if_stats().get(name)
        if stats: info["speed_mbps"] = stats.speed; info["is_up"] = stats.isup; info["mtu"] = stats.mtu
        interfaces.append(info)
    per_nic = psutil.net_io_counters(pernic=True)
    return {
        "total": {"bytes_sent":counters.bytes_sent,"bytes_recv":counters.bytes_recv,
            "packets_sent":counters.packets_sent,"packets_recv":counters.packets_recv,
            "errors_in":counters.errin,"errors_out":counters.errout,
            "drops_in":counters.dropin,"drops_out":counters.dropout},
        "rate": _net_rate, "interfaces": interfaces,
        "per_nic": {name: {"bytes_sent":c.bytes_sent,"bytes_recv":c.bytes_recv,
            "speed_mbps":psutil.net_if_stats().get(name,type('',(),{"speed":0})).speed}
            for name,c in per_nic.items() if name != 'lo'},
    }

def read_config(config_path: Path = CONFIG_PATH):
    if not config_path.exists(): return {}
    try: return json.loads(config_path.read_text())
    except: return {}

def write_config(data, config_path: Path = CONFIG_PATH):
    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        if config_path.exists():
            shutil.copy2(config_path, config_path.with_suffix('.json.bak'))
        config_path.write_text(json.dumps(data, indent=2))
        return {"message": "Config saved"}
    except Exception as e: return {"error": str(e)}

def get_player_count():
    # Primary: parse native logs — always works, no mod dependency
    # (_parse_live_players_from_logs is defined later but called at runtime, that's fine)
    try:
        return len(_parse_live_players_from_logs())
    except: pass
    # Fallback: MAT Active_Players.log line count
    if MAT_ACTIVE.exists():
        try:
            return sum(1 for l in MAT_ACTIVE.read_text(errors='replace').splitlines() if l.strip().startswith('{'))
        except: pass
    return 0

def parse_logs(lines=200, log_dir: Path = LOG_DIR):
    """Parse server logs. lines=0 means return all lines from current session."""
    logs = []
    if not log_dir.exists(): return logs
    try:
        log_dirs = sorted([d for d in log_dir.iterdir() if d.is_dir()], key=lambda d: d.name, reverse=True)
    except: return logs
    for ld in log_dirs[:2]:
        for lf in sorted(ld.glob("*.log"), key=lambda f: f.stat().st_mtime, reverse=True):
            try:
                with open(lf, 'r', errors='replace') as f:
                    raw_lines = f.readlines()
                if lines > 0:
                    raw_lines = raw_lines[-lines:]
                for raw in raw_lines:
                    raw = raw.strip()
                    if raw:
                        entry = parse_log_line(raw)
                        if entry: logs.append(entry)
                if logs:
                    return logs if lines == 0 else logs[-lines:]
            except: continue
    return logs

def parse_log_line(line):
    ts, level, source, msg = "", "INFO", "SYSTEM", line
    # Arma Reforger format: HH:MM:SS.mmm  [indent] SOURCE [(W|E)] : message
    m = re.match(r'^(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\S+)\s*(?:\(([A-Z])\))?\s*:\s*(.*)', line)
    if m:
        ts = m.group(1)
        raw_src = m.group(2).upper()
        lvl_char = m.group(3) or ''
        msg = m.group(4).strip()
        if lvl_char == 'E': level = "ERROR"
        elif lvl_char == 'W': level = "WARN"
        src_map = {'SCRIPT':'SCRIPT','BACKEND':'NETWORK','RPL':'NETWORK','NETWORK':'NETWORK',
                   'WORLD':'WORLD','ENTITY':'WORLD','RESOURCES':'WORLD','MOD':'MOD','ADDON':'MOD'}
        source = src_map.get(raw_src, 'SYSTEM')
    elif len(line) > 8 and line[2] == ':' and line[5] == ':':
        ts = line[:8]; msg = line[8:].strip()
    elif line.startswith('['):
        i = line.find(']')
        ts = line[1:i] if i > 0 else ""; msg = line[i+1:].strip() if i > 0 else line
    ml = msg.lower()
    # Level override from message content (only if not set by Arma marker)
    if level == "INFO":
        if any(w in ml for w in ['error','exception','failed','fatal','crash']): level = "ERROR"
        elif any(w in ml for w in ['warning','warn']): level = "WARN"
        elif any(w in ml for w in ['debug','trace']): level = "DEBUG"
    # Source override for player and special events
    player_kws = ['authenticated player','player connected','player disconnected','updating player',
                  'creating player','player_joined','player_left','player_killed','players connected']
    if any(w in ml for w in player_kws): source = "PLAYER"
    elif any(w in ml for w in ['serveradmintools','admin_action','vote_started','vote_ended']): source = "SCRIPT"
    elif any(w in ml for w in ['ai_gm','bridge','nemotron','zeus']): source = "AI_GM"
    elif source == 'NETWORK' and any(w in ml for w in ['rcon']): source = "RCON"
    if not ts: ts = datetime.now().strftime("%H:%M:%S")
    return {"ts": ts, "level": level, "source": source, "msg": msg}

def is_path_safe(requested, safe_dirs=None):
    if not requested: return False
    if safe_dirs is None: safe_dirs = SAFE_DIRS
    # For relative paths, resolve against the first safe dir (arma_dir)
    target = Path(requested).resolve() if requested.startswith('/') else (safe_dirs[0] / requested).resolve()
    for s in safe_dirs:
        resolved_safe = str(s.resolve())
        if str(target) == resolved_safe or str(target).startswith(resolved_safe + os.sep): return True
    return False

def load_webhooks(data_dir: Path = PANEL_DATA):
    path = data_dir / "webhooks.json"
    if path.exists():
        try: return json.loads(path.read_text())
        except: pass
    return [
        {"id":1,"name":"Player Events","url":"","events":["connect","disconnect"],"enabled":False},
        {"id":2,"name":"Server Status","url":"","events":["start","stop","crash"],"enabled":False},
        {"id":3,"name":"Kill Feed","url":"","events":["kill","teamkill"],"enabled":False},
        {"id":4,"name":"AI GM Activity","url":"","events":["spawn","evaluate"],"enabled":False},
    ]

def save_webhooks(hooks, data_dir: Path = PANEL_DATA):
    path = data_dir / "webhooks.json"
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(hooks, indent=2))
    tmp.replace(path)

def load_admins_db(data_dir: Path = PANEL_DATA):
    path = data_dir / "admins.json"
    if path.exists():
        try: return json.loads(path.read_text())
        except: pass
    return {"admins": []}

def save_admins_db(data, data_dir: Path = PANEL_DATA):
    path = data_dir / "admins.json"
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)

# === AUTH ENDPOINTS ===

@app.post("/api/auth/login")
async def login(request: Request, response: Response):
    client_ip = request.client.host if request.client else "unknown"
    blocked = check_rate_limit(client_ip)
    if blocked:
        return blocked
    body = await request.json()
    username = body.get("username", "").strip()
    password = body.get("password", "")
    remember = bool(body.get("remember", False))
    if not username or not password:
        return JSONResponse({"error": "Username and password required"}, status_code=400)
    DUMMY_HASH = "pbkdf2:sha256:260000$dummy$0000000000000000000000000000000000000000000000000000000000000000"
    data_dir = PANEL_DATA
    data = load_panel_users(data_dir)
    user = next((u for u in data["users"] if u["username"].lower() == username.lower()), None)
    if not user:
        verify_password("dummy", DUMMY_HASH)
        record_failed_login(client_ip)
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)
    if not verify_password(password, user["password_hash"]):
        record_failed_login(client_ip)
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)
    clear_failed_login(client_ip)
    # If 2FA is enabled, issue a short-lived pending token instead of auth cookies
    if user.get("totp_secret") and user.get("totp_enabled"):
        pending_token = secrets.token_urlsafe(32)
        _pending_2fa[pending_token] = {
            "username": user["username"],
            "role": user["role"],
            "remember": remember,
            "ua": request.headers.get("user-agent", ""),
            "expires": time.time() + 300,
        }
        return {"requires_2fa": True, "pending_token": pending_token}
    ua = request.headers.get("user-agent", "")
    set_auth_cookies(response, user["username"], user["role"], remember, ua)
    return {"username": user["username"], "role": user["role"]}

@app.get("/api/auth/me")
async def auth_me(request: Request):
    u = current_user(request)
    try:
        data = load_panel_users(PANEL_DATA)
        full = next((x for x in data["users"] if x["username"] == u["username"]), {})
        extras = {}
        if full.get("email"):
            extras["email"] = full["email"]
        if full.get("totp_enabled"):
            extras["totp_enabled"] = True
        if extras:
            return {**u, **extras}
    except Exception:
        pass
    return u

@app.post("/api/auth/refresh")
async def refresh_token_endpoint(request: Request, response: Response):
    refresh_id = request.cookies.get("sitrep-refresh", "")
    username = validate_refresh_token(refresh_id)
    if not username:
        clear_auth_cookies(response)
        return JSONResponse({"error": "Session expired — please log in again"}, status_code=401)
    data_dir = PANEL_DATA
    data = load_panel_users(data_dir)
    user = next((u for u in data["users"] if u["username"] == username), None)
    if not user:
        clear_auth_cookies(response)
        return JSONResponse({"error": "User not found"}, status_code=401)
    token = create_token(username, user["role"])
    set_access_cookie(response, token)
    return {"username": username, "role": user["role"]}

@app.post("/api/auth/logout")
async def logout_endpoint(request: Request, response: Response):
    refresh_id = request.cookies.get("sitrep-refresh", "")
    delete_refresh_token(refresh_id)
    clear_auth_cookies(response)
    return {"message": "Logged out"}

# === PASSWORD RESET ===

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def _load_reset_tokens() -> dict:
    if not RESET_TOKENS_FILE.exists():
        return {}
    try:
        return json.loads(RESET_TOKENS_FILE.read_text())
    except Exception:
        return {}

def _save_reset_tokens(tokens: dict):
    RESET_TOKENS_FILE.write_text(json.dumps(tokens, indent=2))

def _prune_reset_tokens(tokens: dict) -> dict:
    now = time.time()
    return {k: v for k, v in tokens.items() if v.get("expires", 0) > now}

class ForgotPasswordBody(BaseModel):
    email: str

class ResetPasswordBody(BaseModel):
    token: str
    password: str

def _get_smtp_config() -> dict:
    """Resolve effective SMTP config: settings.json wins, env vars are fallback.
    Returns a dict with host/port/user/password/from/from_name/use_tls, or
    {'host': ''} if nothing is configured."""
    try:
        s = load_settings(PANEL_DATA)
    except Exception:
        s = {}
    host = (s.get("smtp_host") or SMTP_HOST or "").strip()
    if not host:
        return {"host": ""}
    port = int(s.get("smtp_port") or SMTP_PORT or 587)
    user = (s.get("smtp_user") or SMTP_USER or "").strip()
    password = s.get("smtp_pass") or SMTP_PASS or ""
    sender = (s.get("smtp_from") or SMTP_FROM or user or "").strip()
    from_name = (s.get("smtp_from_name") or "SITREP Panel").strip()
    use_tls = s.get("smtp_use_tls", True) if "smtp_use_tls" in s else True
    return {
        "host": host, "port": port, "user": user, "password": password,
        "from": sender, "from_name": from_name, "use_tls": bool(use_tls),
    }

def _send_email(to_addr: str, subject: str, text_body: str, html_body: str = "") -> tuple[bool, str]:
    """Send one email via the currently-configured SMTP. Returns (ok, error_message)."""
    cfg = _get_smtp_config()
    if not cfg["host"]:
        return False, "SMTP not configured"
    try:
        if html_body:
            msg = MIMEMultipart("alternative")
            msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))
        else:
            msg = MIMEText(text_body, "plain")
        msg["Subject"] = subject
        sender_display = f"{cfg['from_name']} <{cfg['from']}>" if cfg["from_name"] else cfg["from"]
        msg["From"] = sender_display
        msg["To"] = to_addr
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as srv:
            srv.ehlo()
            if cfg["use_tls"]:
                srv.starttls()
                srv.ehlo()
            if cfg["user"]:
                srv.login(cfg["user"], cfg["password"])
            srv.sendmail(cfg["from"], to_addr, msg.as_string())
        return True, ""
    except Exception as e:
        print(f"[SITREP] SMTP send failed: {e}")
        return False, str(e)

@app.post("/api/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    cfg = _get_smtp_config()
    if not cfg["host"]:
        return JSONResponse({"error": "Email is not configured on this server. Contact the server owner to reset your password."}, status_code=503)
    data = load_panel_users()
    user = next((u for u in data.get("users", []) if u.get("email", "").lower() == body.email.strip().lower()), None)
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If that email is registered, a reset link has been sent."}
    token = secrets.token_urlsafe(32)
    tokens = _prune_reset_tokens(_load_reset_tokens())
    tokens[token] = {"username": user["username"], "expires": time.time() + 3600}
    _save_reset_tokens(tokens)
    reset_url = f"{PANEL_URL}?reset_token={token}"
    text_body = f"Reset your SITREP panel password for account '{user['username']}':\n\n{reset_url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email."
    html_body = f"""<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
<h2 style="color:#111">SITREP — Password Reset</h2>
<p>A password reset was requested for account <strong>{user['username']}</strong>.</p>
<p><a href="{reset_url}" style="background:#22c55e;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Reset Password</a></p>
<p style="color:#666;font-size:13px">Or copy this link:<br><code>{reset_url}</code></p>
<p style="color:#999;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
</div>"""
    ok, err = _send_email(body.email.strip(), "SITREP — Password Reset", text_body, html_body)
    if not ok:
        return JSONResponse({"error": f"Failed to send email: {err}"}, status_code=500)
    return {"message": "If that email is registered, a reset link has been sent."}

@app.post("/api/auth/reset-password")
async def reset_password_endpoint(body: ResetPasswordBody):
    tokens = _prune_reset_tokens(_load_reset_tokens())
    entry = tokens.get(body.token)
    if not entry:
        return JSONResponse({"error": "Invalid or expired reset link."}, status_code=400)
    if not body.password or len(body.password) < 8:
        return JSONResponse({"error": "Password must be at least 8 characters."}, status_code=400)
    data = load_panel_users()
    for u in data.get("users", []):
        if u["username"] == entry["username"]:
            u["password_hash"] = hash_password(body.password)
            u.pop("salt", None)
            u["tokens_valid_after"] = int(time.time())
            break
    save_panel_users(data)
    del tokens[body.token]
    _save_reset_tokens(tokens)
    return {"message": "Password reset successfully. You can now log in."}

# === TWO-FACTOR AUTH (TOTP) ===

import pyotp, qrcode, io, base64 as _b64

_pending_2fa: dict = {}  # pending_token -> {username, role, remember, ua, expires}

def _prune_pending_2fa():
    now = time.time()
    expired = [k for k, v in _pending_2fa.items() if v["expires"] < now]
    for k in expired:
        del _pending_2fa[k]

def _verify_totp(user: dict, code: str) -> bool:
    secret = user.get("totp_secret", "")
    if not secret:
        return False
    totp = pyotp.TOTP(secret)
    if totp.verify(code, valid_window=1):
        return True
    # Check backup codes
    code_clean = code.replace("-", "").upper()
    backup = user.get("totp_backup_codes", [])
    for i, stored in enumerate(backup):
        if secrets.compare_digest(stored, hashlib.sha256(code_clean.encode()).hexdigest()):
            user["totp_backup_codes"].pop(i)
            return True
    return False

class Totp2FABody(BaseModel):
    pending_token: str
    code: str

class TotpEnableBody(BaseModel):
    secret: str
    code: str

class TotpDisableBody(BaseModel):
    code: str

@app.get("/api/auth/2fa/setup")
async def totp_setup(request: Request):
    user = current_user(request)
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user["username"], issuer_name="SITREP")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = _b64.b64encode(buf.getvalue()).decode()
    return {"secret": secret, "qr": f"data:image/png;base64,{qr_b64}"}

@app.post("/api/auth/2fa/enable")
async def totp_enable(body: TotpEnableBody, request: Request):
    user_info = current_user(request)
    if not pyotp.TOTP(body.secret).verify(body.code, valid_window=1):
        return JSONResponse({"error": "Invalid code — try again"}, status_code=400)
    # Generate 8 backup codes
    raw_codes = [secrets.token_hex(4).upper() + "-" + secrets.token_hex(4).upper() for _ in range(8)]
    hashed_codes = [hashlib.sha256(c.replace("-","").encode()).hexdigest() for c in raw_codes]
    data_dir = PANEL_DATA
    data = load_panel_users(data_dir)
    for u in data["users"]:
        if u["username"] == user_info["username"]:
            u["totp_secret"] = body.secret
            u["totp_enabled"] = True
            u["totp_backup_codes"] = hashed_codes
            u["tokens_valid_after"] = time.time()
            break
    save_panel_users(data, data_dir)
    return {"message": "2FA enabled", "backup_codes": raw_codes}

@app.post("/api/auth/2fa/disable")
async def totp_disable(body: TotpDisableBody, request: Request):
    user_info = current_user(request)
    data_dir = PANEL_DATA
    data = load_panel_users(data_dir)
    u = next((x for x in data["users"] if x["username"] == user_info["username"]), None)
    if not u:
        return JSONResponse({"error": "User not found"}, status_code=404)
    if not _verify_totp(u, body.code):
        return JSONResponse({"error": "Invalid code"}, status_code=400)
    u.pop("totp_secret", None)
    u.pop("totp_backup_codes", None)
    u["totp_enabled"] = False
    u["tokens_valid_after"] = time.time()
    save_panel_users(data, data_dir)
    return {"message": "2FA disabled"}

@app.post("/api/auth/2fa/verify")
async def totp_verify(body: Totp2FABody, response: Response):
    _prune_pending_2fa()
    entry = _pending_2fa.get(body.pending_token)
    if not entry:
        return JSONResponse({"error": "Session expired — please log in again"}, status_code=401)
    data_dir = PANEL_DATA
    data = load_panel_users(data_dir)
    u = next((x for x in data["users"] if x["username"] == entry["username"]), None)
    if not u or not _verify_totp(u, body.code):
        return JSONResponse({"error": "Invalid code"}, status_code=401)
    # If a backup code was used, save updated backup codes
    save_panel_users(data, data_dir)
    del _pending_2fa[body.pending_token]
    set_auth_cookies(response, entry["username"], entry["role"], entry["remember"], entry["ua"])
    return {"username": entry["username"], "role": entry["role"]}

# === DISCORD OAUTH ===

def _make_oauth_state() -> str:
    """Generate an HMAC-signed state token: hex(ts):hex(nonce):hex(sig)."""
    ts = hex(int(time.time()))[2:]
    nonce = secrets.token_hex(16)
    msg = f"{ts}:{nonce}".encode()
    sig = hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()
    return f"{ts}:{nonce}:{sig}"

def _verify_oauth_state(state: str, max_age: int = 300) -> bool:
    """Return True if state is a valid, unexpired HMAC token."""
    try:
        ts_hex, nonce, sig = state.split(":", 2)
        msg = f"{ts_hex}:{nonce}".encode()
        expected = hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return False
        ts = int(ts_hex, 16)
        return abs(time.time() - ts) <= max_age
    except Exception:
        return False

def _discord_redirect_uri(settings: dict) -> str:
    """Source of truth for Discord OAuth redirect URI: PANEL_URL from env.

    A stored discord_redirect_uri in settings.json is only honored when it
    is an absolute URL AND does not point at localhost. Relative paths
    (e.g. "/api/auth/discord/callback") and localhost values get rewritten
    to `{PANEL_URL}/api/auth/discord/callback` so shipped installs work off
    a single `.env` PANEL_URL value (install.sh prompts for it) instead of
    requiring a second config step. Discord rejects relative redirect URIs.
    """
    stored = (settings.get("discord_redirect_uri") or "").strip().rstrip("/")
    default_base = f"{PANEL_URL}/api/auth/discord/callback"
    is_absolute = stored.startswith("http://") or stored.startswith("https://")
    if is_absolute and "localhost" not in stored and "127.0.0.1" not in stored:
        return stored
    return default_base

def _discord_frontend_base(settings: dict) -> str:
    """Source of truth for post-OAuth redirect target: PANEL_URL from env.

    Only absolute, non-localhost URLs from settings are honored; everything
    else falls through to PANEL_URL.
    """
    stored = (settings.get("frontend_url") or "").strip().rstrip("/")
    is_absolute = stored.startswith("http://") or stored.startswith("https://")
    if is_absolute and "localhost" not in stored and "127.0.0.1" not in stored:
        return stored
    return PANEL_URL

@app.get("/api/auth/discord")
async def discord_auth_start(request: Request):
    """Redirect to Discord OAuth2 authorization page."""
    data_dir = PANEL_DATA
    settings = load_settings(data_dir)
    client_id = settings.get("discord_client_id", "")
    if not client_id:
        return JSONResponse({"error": "Discord OAuth not configured. Set discord_client_id in panel settings."}, status_code=400)
    redirect_uri = _discord_redirect_uri(settings)
    scope = "identify"
    state = _make_oauth_state()
    url = (
        f"https://discord.com/api/oauth2/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope={scope}"
        f"&state={state}"
    )
    return RedirectResponse(url)

@app.get("/api/auth/discord/callback")
async def discord_auth_callback(request: Request, code: str = "", error: str = "", state: str = ""):
    """Handle Discord OAuth2 callback — sets HttpOnly cookies, no token in URL."""
    data_dir = PANEL_DATA
    settings = load_settings(data_dir)
    frontend_url = _discord_frontend_base(settings)
    if not _verify_oauth_state(state):
        return JSONResponse({"error": "Invalid or expired OAuth state — possible CSRF attempt."}, status_code=400)
    if error or not code:
        return RedirectResponse(f"{frontend_url}/?discord_error={urllib.parse.quote(error or 'no_code', safe='')}", status_code=302)
    client_id = settings.get("discord_client_id", "")
    client_secret = settings.get("discord_client_secret", "")
    redirect_uri = _discord_redirect_uri(settings)
    if not client_id or not client_secret:
        return JSONResponse({"error": "Discord OAuth not configured"}, status_code=400)
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post("https://discord.com/api/oauth2/token", data={
                "client_id": client_id, "client_secret": client_secret,
                "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri
            })
            token_data = token_resp.json()
            if "access_token" not in token_data:
                return JSONResponse({"error": "Discord token exchange failed", "detail": token_data}, status_code=400)
            user_resp = await client.get("https://discord.com/api/users/@me",
                headers={"Authorization": f"Bearer {token_data['access_token']}"})
            discord_user = user_resp.json()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

    discord_id = discord_user.get("id", "")
    discord_name = discord_user.get("username", "")

    data = load_panel_users(data_dir)
    panel_user = next((u for u in data["users"] if u.get("discord_id") == discord_id), None)

    if not panel_user:
        allow_auto = settings.get("discord_allow_auto_register", False)
        if allow_auto:
            new_user = {
                "username": f"discord_{discord_name}",
                "password_hash": secrets.token_hex(32),
                "role": "viewer",
                "discord_id": discord_id,
                "discord_username": discord_name,
                "created": datetime.utcnow().isoformat()
            }
            data["users"].append(new_user)
            save_panel_users(data, data_dir)
            panel_user = new_user
        else:
            return RedirectResponse(
                f"{frontend_url}/?discord_error=not_linked&discord_name={urllib.parse.quote(discord_name)}",
                status_code=302
            )

    token = create_token(panel_user["username"], panel_user["role"])
    ua = request.headers.get("user-agent", "")
    refresh_id = create_refresh_token(panel_user["username"], remember=True, user_agent=ua)
    resp = RedirectResponse(f"{frontend_url}/", status_code=302)
    set_access_cookie(resp, token)
    resp.set_cookie("sitrep-refresh", refresh_id, httponly=True, samesite="strict", secure=COOKIE_SECURE, max_age=2592000)
    return resp

@app.put("/api/users/{username}/link-discord")
async def link_discord(username: str, request: Request):
    """Owner links a Discord ID to a panel user."""
    user = current_user(request)
    if user.get("role") != "owner":
        return JSONResponse({"error": "Owner only"}, status_code=403)
    data_dir = srv_data_dir(request)
    body = await request.json()
    discord_id = body.get("discord_id", "").strip()
    discord_username = body.get("discord_username", "").strip()
    data = load_panel_users(data_dir)
    for u in data["users"]:
        if u["username"] == username:
            u["discord_id"] = discord_id
            u["discord_username"] = discord_username
            save_panel_users(data, data_dir)
            return {"message": f"Linked Discord {discord_username} to {username}"}
    return JSONResponse({"error": "User not found"}, status_code=404)

# === PLAYER NOTES ===

@app.get("/api/players/{guid}/notes")
async def get_player_notes(guid: str, request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            row = conn.execute("SELECT * FROM players WHERE guid=?", (guid,)).fetchone()
            return {"notes": dict(row).get("notes", "") if row else ""}
        finally:
            conn.close()

@app.put("/api/players/{guid}/notes")
async def set_player_notes(guid: str, request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    body = await request.json()
    notes = body.get("notes", "")
    user = current_user(request).get("username", "unknown")
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            conn.execute("UPDATE players SET notes=? WHERE guid=?", (notes, guid))
            if conn.execute("SELECT changes()").fetchone()[0] == 0:
                # Player not in DB, can't add notes to unknown player
                return JSONResponse({"error": "Player not found in database"}, status_code=404)
            conn.commit()
            _log_action(user, "player_note", guid, notes[:100], data_dir)
            return {"message": "Notes saved"}
        finally:
            conn.close()

# === PERMISSIONS ===

@app.get("/api/permissions")
async def get_permissions_endpoint(request: Request):
    denied = require_role(request, "viewer")
    if denied: return denied
    return {
        "permissions": load_permissions(PANEL_DATA),
        "defaults": PERMISSION_DEFAULTS,
        "labels": PERMISSION_LABELS,
        "groups": PERMISSION_GROUPS,
        "roles": list(ROLE_ORDER.keys()),
    }

@app.put("/api/permissions")
async def put_permissions_endpoint(request: Request):
    denied = require_role(request, "head_admin")
    if denied: return denied
    body = await request.json()
    save_permissions(body, PANEL_DATA)
    return {"message": "Permissions saved"}

# === USER MANAGEMENT (owner only) ===

@app.get("/api/users")
async def list_users(request: Request):
    denied = require_role(request, "head_admin")
    if denied: return denied
    data_dir = srv_data_dir(request)
    data = load_panel_users(data_dir)
    return {"users": [{
        "username": u["username"], "role": u["role"], "created": u.get("created",""),
        "discord_id": u.get("discord_id",""), "discord_username": u.get("discord_username",""),
        "ip_visible": u.get("ip_visible", True)
    } for u in data["users"]]}

@app.post("/api/users/add")
async def add_user(request: Request):
    denied = require_role(request, "head_admin")
    if denied: return denied
    me = current_user(request)
    data_dir = srv_data_dir(request)
    body = await request.json()
    username = body.get("username", "").strip()
    password = body.get("password", "").strip()
    role = body.get("role", "viewer")
    if not username or not password: return {"error": "Username and password required"}
    if role not in ROLE_ORDER: return {"error": f"Invalid role. Valid: {', '.join(ROLE_ORDER)}"}
    # Head admins cannot create owner accounts
    if me["role"] != "owner" and ROLE_ORDER.get(role, 0) >= ROLE_ORDER.get("owner", 4):
        return JSONResponse({"error": "Only owners can create owner accounts"}, status_code=403)
    data = load_panel_users(data_dir)
    if any(u["username"].lower() == username.lower() for u in data["users"]):
        return {"error": f"User '{username}' already exists"}
    data["users"].append({"username": username, "password_hash": hash_password(password),
        "role": role, "created": datetime.now().isoformat(), "tokens_valid_after": 0})
    save_panel_users(data, data_dir)
    return {"message": f"User '{username}' created with role '{role}'"}

@app.post("/api/users/remove")
async def remove_user(request: Request):
    denied = require_role(request, "head_admin")
    if denied: return denied
    me = current_user(request)
    data_dir = srv_data_dir(request)
    body = await request.json()
    username = body.get("username", "").strip()
    if not username: return {"error": "Username required"}
    if username.lower() == me["username"].lower(): return {"error": "Cannot remove yourself"}
    data = load_panel_users(data_dir)
    target = next((u for u in data["users"] if u["username"].lower() == username.lower()), None)
    if not target: return {"error": "User not found"}
    # Head admins cannot remove owner accounts
    if me["role"] != "owner" and target.get("role") == "owner":
        return JSONResponse({"error": "Only owners can remove owner accounts"}, status_code=403)
    data["users"] = [u for u in data["users"] if u["username"].lower() != username.lower()]
    save_panel_users(data, data_dir)
    return {"message": f"User '{username}' removed"}

@app.put("/api/users/update")
async def update_user(request: Request):
    denied = require_role(request, "head_admin")
    if denied: return denied
    me = current_user(request)
    data_dir = srv_data_dir(request)
    body = await request.json()
    username = body.get("username", "").strip()
    if not username: return {"error": "Username required"}
    data = load_panel_users(data_dir)
    user = next((u for u in data["users"] if u["username"].lower() == username.lower()), None)
    if not user: return {"error": "User not found"}
    # Head admins cannot touch owner accounts
    if me["role"] != "owner" and user.get("role") == "owner":
        return JSONResponse({"error": "Only owners can modify owner accounts"}, status_code=403)
    if "role" in body:
        if body["role"] not in ROLE_ORDER: return {"error": "Invalid role"}
        # Head admins cannot assign owner role
        if me["role"] != "owner" and ROLE_ORDER.get(body["role"], 0) >= ROLE_ORDER.get("owner", 4):
            return JSONResponse({"error": "Only owners can assign the owner role"}, status_code=403)
        user["role"] = body["role"]
    if "password" in body and body["password"]:
        user["password_hash"] = hash_password(body["password"])
        user["tokens_valid_after"] = int(time.time())
        delete_refresh_tokens_for_user(username)
    if "email" in body:
        user["email"] = body["email"].strip().lower()
    save_panel_users(data, data_dir)
    return {"message": f"User '{username}' updated"}

# === ENDPOINTS ===

@app.get("/api/servers")
async def list_servers_endpoint(request: Request):
    data = load_servers()
    result = []
    for s in data["servers"]:
        running = is_server_running(s["service_name"])
        pid = get_server_pid(s["service_name"]) if running else None
        # Read live port from the server's config.json rather than the stale stored value
        live_port = s.get("port")
        try:
            cfg_path = Path(s.get("config_path", ""))
            if cfg_path.exists():
                cfg = json.loads(cfg_path.read_text())
                live_port = cfg.get("bindPort", cfg.get("port", live_port))
        except Exception:
            pass
        result.append({
            "id": s["id"],
            "name": s["name"],
            "description": s.get("description", ""),
            "tags": s.get("tags", []),
            "port": live_port,
            "service_name": s["service_name"],
            "running": running,
            "pid": pid,
            "created": s.get("created"),
            "cloned_from": s.get("cloned_from")
        })
    return {"servers": result}

@app.get("/api/servers/{server_id}/status")
async def server_instance_status(server_id: int, request: Request):
    s = get_server_by_id(server_id)
    if not s:
        return JSONResponse({"error": "Server not found"}, status_code=404)
    running = is_server_running(s["service_name"])
    return {
        "id": server_id,
        "running": running,
        "pid": get_server_pid(s["service_name"]) if running else None,
    }

@app.post("/api/servers")
async def create_server(request: Request):
    if current_user(request).get("role") != "owner":
        return JSONResponse({"error": "Owner only"}, status_code=403)
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return JSONResponse({"error": "Name required"}, status_code=400)
    try:
        port = int(body.get("port", 2001))
    except (ValueError, TypeError):
        return JSONResponse({"error": "Port must be a number"}, status_code=400)
    if not (1 <= port <= 65534):
        return JSONResponse({"error": "Port must be between 1 and 65534"}, status_code=400)
    clone_from_id = body.get("clone_from_id")
    if clone_from_id is not None:
        try:
            clone_from_id = int(clone_from_id)
        except (ValueError, TypeError):
            return JSONResponse({"error": "clone_from_id must be a number"}, status_code=400)
    tags = body.get("tags", [])
    if not isinstance(tags, list):
        return JSONResponse({"error": "tags must be an array"}, status_code=400)
    data = load_servers()
    if any(s["port"] == port for s in data["servers"]):
        return JSONResponse({"error": f"Port {port} already used by another server"}, status_code=400)
    if clone_from_id is not None and not get_server_by_id(clone_from_id):
        return JSONResponse({"error": f"Source server {clone_from_id} not found"}, status_code=400)
    server_id = data["next_id"]
    new_server = {
        "id": server_id,
        "name": name,
        "description": body.get("description", ""),
        "tags": tags,
        "install_dir": str(ARMA_DIR),
        "data_dir": str(SERVERS_DIR / str(server_id) / "data"),
        "config_path": str(SERVERS_DIR / str(server_id) / "config.json"),
        "profile_dir": str(SERVERS_DIR / str(server_id) / "profile"),
        "service_name": f"arma-reforger-{server_id}",
        "port": port,
        "created": datetime.utcnow().isoformat(),
        "cloned_from": clone_from_id
    }
    data["servers"].append(new_server)
    data["next_id"] = server_id + 1
    save_servers(data)
    return {"server": new_server}

@app.post("/api/servers/{server_id}/provision")
async def provision_server(server_id: int, request: Request):
    if current_user(request).get("role") != "owner":
        return JSONResponse({"error": "Owner only"}, status_code=403)

    s = get_server_by_id(server_id)
    if not s:
        return JSONResponse({"error": "Server not found"}, status_code=404)

    data_dir = Path(s["data_dir"])
    profile_dir = Path(s["profile_dir"])
    config_path = Path(s["config_path"])

    data_dir.mkdir(parents=True, exist_ok=True)
    profile_dir.mkdir(parents=True, exist_ok=True)

    clone_from_id = s.get("cloned_from")
    if clone_from_id:
        source = get_server_by_id(int(clone_from_id))
        if not source:
            return JSONResponse({"error": f"Source server {clone_from_id} not found"}, status_code=400)
        src_config = Path(source["config_path"])
        src_data = Path(source["data_dir"])
        if src_config.exists():
            shutil.copy2(src_config, config_path)
            try:
                cfg = json.loads(config_path.read_text())
                if "game" in cfg: cfg["game"]["port"] = s["port"]
                config_path.write_text(json.dumps(cfg, indent=2))
            except Exception as e:
                return JSONResponse({"error": f"Failed to update cloned config: {e}"}, status_code=500)
        for fname in ["panel_users.json", "permissions.json", "settings.json", "admins.json"]:
            src_file = src_data / fname
            if src_file.exists():
                shutil.copy2(src_file, data_dir / fname)
    else:
        default_cfg = {
            "bindAddress": "",
            "bindPort": s["port"],
            "publicAddress": "",
            "publicPort": s["port"],
            "game": {
                "name": s["name"],
                "password": "",
                "scenarioId": "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
                "maxPlayers": 64
            },
            "a2s": {"address": "0.0.0.0", "port": s["port"] + 1}
        }
        config_path.write_text(json.dumps(default_cfg, indent=2))

    safe_name = re.sub(r'[^\w\s\-]', '', s['name'])[:64]
    service_content = f"""[Unit]
Description=Arma Reforger Server #{server_id} - {safe_name}
After=network.target

[Service]
Type=simple
User={getpass.getuser()}
WorkingDirectory={s['install_dir']}
ExecStart={s['install_dir']}/ArmaReforgerServer \\
  -config {config_path} \\
  -profile {profile_dir} \\
  -maxFPS 60
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
"""
    service_path = Path(f"/etc/systemd/system/{s['service_name']}.service")
    tee_result = subprocess.run(
        ["sudo", "tee", str(service_path)],
        input=service_content.encode(),
        capture_output=True
    )
    if tee_result.returncode != 0:
        return JSONResponse({"error": f"Failed to write service file: {tee_result.stderr.decode()}"}, status_code=500)
    reload_result = subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)
    if reload_result.returncode != 0:
        return JSONResponse({"error": f"Failed to reload systemd: {reload_result.stderr.decode()}"}, status_code=500)

    port_result = _manage_ports(s, "open")
    return {
        "message": f"Server #{server_id} provisioned",
        "data_dir": str(data_dir),
        "config_path": str(config_path),
        "service_name": s["service_name"],
        "ports": port_result
    }

@app.put("/api/servers/{server_id}")
async def update_server(server_id: int, request: Request):
    if ROLE_ORDER.get(current_user(request).get("role", ""), 0) < ROLE_ORDER.get("head_admin", 3):
        return JSONResponse({"error": "Head admin or above required"}, status_code=403)
    data = load_servers()
    server = next((s for s in data["servers"] if s["id"] == server_id), None)
    if not server:
        return JSONResponse({"error": "Server not found"}, status_code=404)
    body = await request.json()
    if "name" in body:
        name = str(body["name"]).strip()
        if not name:
            return JSONResponse({"error": "Name cannot be empty"}, status_code=400)
        server["name"] = name
    if "description" in body:
        server["description"] = str(body["description"]).strip()
    if "tags" in body and isinstance(body["tags"], list):
        server["tags"] = [str(t).strip() for t in body["tags"] if str(t).strip()]
    save_servers(data)
    return {"message": "Server updated", "server": server}

@app.delete("/api/servers/{server_id}")
async def delete_server(server_id: int, request: Request):
    if current_user(request).get("role") != "owner":
        return JSONResponse({"error": "Owner only"}, status_code=403)
    if server_id == 1:
        return JSONResponse({"error": "Cannot delete the primary server"}, status_code=400)
    data = load_servers()
    server_to_delete = next((x for x in data["servers"] if x["id"] == server_id), None)
    if not server_to_delete:
        return JSONResponse({"error": "Server not found"}, status_code=404)

    warnings: list[str] = []

    # 1. Stop + disable + remove the systemd unit so the server can't be restarted.
    service_name = server_to_delete.get("service_name") or f"arma-reforger-{server_id}"
    unit_path = Path(f"/etc/systemd/system/{service_name}.service")
    for cmd in (
        ["sudo", "systemctl", "stop", service_name],
        ["sudo", "systemctl", "disable", service_name],
    ):
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode != 0:
            warnings.append(f"{' '.join(cmd[1:])}: {r.stderr.decode().strip() or 'failed'}")
    if unit_path.exists():
        rm = subprocess.run(["sudo", "rm", "-f", str(unit_path)], capture_output=True)
        if rm.returncode != 0:
            warnings.append(f"rm unit: {rm.stderr.decode().strip() or 'failed'}")
    subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)

    # 2. Close firewall ports.
    try:
        _manage_ports(server_to_delete, "close")
    except Exception as e:
        warnings.append(f"port cleanup: {e}")

    # 3. Remove on-disk per-server tree. Everything created by provision_server lives
    # under /opt/panel/servers/{id}/ — blow that away. install_dir is the shared Arma
    # Reforger binary directory; never touch it.
    srv_root = SERVERS_DIR / str(server_id)
    if srv_root.exists():
        try:
            shutil.rmtree(srv_root)
        except Exception as e:
            warnings.append(f"rmtree {srv_root}: {e}")
    else:
        # Fall back to individual path removal for servers whose paths were hand-edited
        # off the default SERVERS_DIR layout.
        for key in ("data_dir", "profile_dir"):
            p = server_to_delete.get(key)
            if p and p != str(ARMA_DIR) and Path(p).exists():
                try:
                    shutil.rmtree(p)
                except Exception as e:
                    warnings.append(f"rmtree {p}: {e}")
        cfg = server_to_delete.get("config_path")
        if cfg and Path(cfg).exists():
            try:
                Path(cfg).unlink()
            except Exception as e:
                warnings.append(f"unlink {cfg}: {e}")

    # 4. Drop from the registry.
    data["servers"] = [x for x in data["servers"] if x["id"] != server_id]
    save_servers(data)

    msg = f"Server #{server_id} deleted"
    if warnings:
        msg += f" (with warnings: {'; '.join(warnings)})"
    return {"message": msg, "warnings": warnings}

@app.get("/api/health")
async def health():
    return {"status": "ok", "ts": time.time()}

# === SETUP WIZARD ===

@app.get("/api/setup/status")
async def setup_status():
    """Returns whether the panel needs first-run setup (no owner account yet)."""
    return {"needs_setup": needs_setup()}

class SetupRequest(BaseModel):
    username: str
    password: str
    email: str = ""

@app.post("/api/setup/complete")
async def setup_complete(body: SetupRequest, response: Response):
    """
    First-run setup: create the owner account.
    Only works when no owner exists yet — cannot be used to overwrite an existing owner.
    """
    if not needs_setup():
        return JSONResponse({"error": "Setup already complete"}, status_code=403)
    username = body.username.strip()
    password = body.password
    email = body.email.strip().lower()
    if not username or len(username) < 2:
        return JSONResponse({"error": "Username must be at least 2 characters"}, status_code=400)
    if not password:
        return JSONResponse({"error": "Password is required"}, status_code=400)
    data = load_panel_users()
    user_obj = {
        "username": username,
        "password_hash": hash_password(password),
        "role": "owner",
        "created": datetime.now().isoformat(),
        "tokens_valid_after": 0
    }
    if email:
        user_obj["email"] = email
    data["users"].append(user_obj)
    save_panel_users(data)
    print(f"[SITREP] Owner account created via setup wizard: {username}")
    set_auth_cookies(response, username, "owner", remember=True)
    return {"username": username, "role": "owner"}

def _analyze_startup_log(log_dir: Path) -> dict:
    """
    Analyze the latest server startup log for common failure patterns.
    Returns a structured diagnostic report.
    """
    result = {
        "log_found": False,
        "log_path": None,
        "engine_version": None,
        "script_errors": [],        # list of {file, line, message}
        "script_module_failed": False,
        "mission_load_failed": False,
        "mission_id": None,
        "broken_mods": [],          # list of {id, name} for mods with broken scripts
        "broken_mod_ids": [],       # kept for backwards compat
        "addons_loaded": 0,
        "issues": [],               # human-readable issues
        "recommendations": [],      # actionable fixes
    }
    if not log_dir.exists():
        return result

    # Find most recent log dir
    try:
        log_dirs = sorted([d for d in log_dir.iterdir() if d.is_dir()], key=lambda d: d.name, reverse=True)
    except:
        return result
    log_path = None
    for ld in log_dirs:
        candidates = list(ld.glob("*.log"))
        if candidates:
            log_path = max(candidates, key=lambda f: f.stat().st_mtime)
            break
    if not log_path:
        return result

    result["log_found"] = True
    result["log_path"] = str(log_path)

    try:
        lines = log_path.read_text(errors='replace').splitlines()
    except:
        return result

    # Map addon dir names -> mod IDs (dir format: Name_MODID)
    addon_dir_to_id = {}
    addon_dir_re = re.compile(r"addons/([^/]+?)_([0-9A-Fa-f]{16})/")

    # Parse the log
    script_err_re = re.compile(r'SCRIPT\s*\(E\):\s*@"([^"]+),(\d+)":\s*(.+)')
    mission_re = re.compile(r'GetResourceObject\s+@"\{([0-9A-Fa-f]+)\}(.+?)"')
    addon_count = set()

    for line in lines:
        # Engine version
        if "Initializing engine, version" in line:
            m = re.search(r'version\s+(\d+)', line)
            if m:
                result["engine_version"] = m.group(1)

        # Addon discovery
        if "gproj:" in line and "guid:" in line:
            m = addon_dir_re.search(line)
            if m:
                addon_count.add(m.group(2).upper())

        # Script compile errors
        m = script_err_re.search(line)
        if m:
            script_file = m.group(1)
            script_line = m.group(2)
            script_msg = m.group(3).strip()
            result["script_errors"].append({
                "file": script_file,
                "line": int(script_line),
                "message": script_msg,
            })

        # Script module failure
        if 'Can\'t compile "Game" script module' in line or "Can't compile" in line and "script module" in line:
            result["script_module_failed"] = True

        # Mission load attempt / failure
        m = mission_re.search(line)
        if m:
            result["mission_id"] = f"{{{m.group(1)}}}{m.group(2)}"
        if "MissionHeader::ReadMissionHeader cannot load" in line:
            result["mission_load_failed"] = True

    result["addons_loaded"] = len(addon_count)

    # Associate script errors with mod IDs via addon directory names
    # Build reverse map: script path fragment -> mod ID
    for err in result["script_errors"]:
        fpath = err["file"]  # e.g. scripts/Game/Components/SDRC_ChopperComp.c
        # Search log for which addon contains this script
        for line in lines:
            if "Adding package" in line and "addons/" in line:
                dm = addon_dir_re.search(line)
                if dm:
                    addon_dir_to_id[dm.group(1)] = dm.group(2).upper()

    # Cross-reference: which installed addon dirs contain the broken scripts
    # Also build a name lookup from config.json mods list
    config_mod_names = {}  # mod_id.upper() -> name
    config_path = log_dir.parent.parent / "config.json"
    if not config_path.exists():
        # Try the panel servers config layout
        config_path = log_dir.parent / "config.json"
    try:
        cfg = json.loads(config_path.read_text())
        for m in cfg.get("game", {}).get("mods", []):
            mid = m.get("modId", "").upper()
            if mid:
                config_mod_names[mid] = m.get("name", mid)
    except:
        pass
    # Also scan addon dirs for ServerData.json which has the name
    addon_names = {}  # mod_id.upper() -> name
    if log_dir.parent.exists():
        addons_base = log_dir.parent / "addons"
        if addons_base.exists():
            for addon_dir in addons_base.iterdir():
                if not addon_dir.is_dir():
                    continue
                sdata = addon_dir / "ServerData.json"
                try:
                    sd = json.loads(sdata.read_text())
                    mid = sd.get("id", "").upper()
                    name = sd.get("name", "")
                    if mid and name:
                        addon_names[mid] = name
                except:
                    pass

    if log_dir.parent.exists():
        addons_base = log_dir.parent / "addons"
        if addons_base.exists():
            for err in result["script_errors"]:
                script_name = Path(err["file"]).name
                for addon_dir in addons_base.iterdir():
                    if not addon_dir.is_dir():
                        continue
                    rdb = addon_dir / "resourceDatabase.rdb"
                    if not rdb.exists():
                        continue
                    try:
                        rdb_content = rdb.read_bytes()
                        if script_name.encode() in rdb_content:
                            parts = addon_dir.name.rsplit("_", 1)
                            if len(parts) == 2 and len(parts[1]) == 16:
                                mod_id = parts[1].upper()
                                if mod_id not in result["broken_mod_ids"]:
                                    result["broken_mod_ids"].append(mod_id)
                                    name = (config_mod_names.get(mod_id)
                                            or addon_names.get(mod_id)
                                            or mod_id)
                                    result["broken_mods"].append({"id": mod_id, "name": name})
                    except:
                        continue

    # Build dependency map from gproj files so we can trace which config.json
    # mods transitively depend on the broken addons (which may be auto-pulled deps
    # not listed directly in config.json).
    addon_deps = {}  # addon_id -> set of dep addon_ids
    if log_dir.parent.exists():
        addons_base = log_dir.parent / "addons"
        if addons_base.exists():
            dep_block_re = re.compile(r'Dependencies\s*\{([^}]*)\}', re.DOTALL)
            guid_re = re.compile(r'"([0-9A-Fa-f]{16})"')
            for addon_dir in addons_base.iterdir():
                if not addon_dir.is_dir():
                    continue
                parts = addon_dir.name.rsplit("_", 1)
                if len(parts) != 2 or len(parts[1]) != 16:
                    continue
                aid = parts[1].upper()
                gproj = addon_dir / "addon.gproj"
                try:
                    content = gproj.read_text(errors='replace')
                    m = dep_block_re.search(content)
                    addon_deps[aid] = {g.upper() for g in guid_re.findall(m.group(1))} if m else set()
                except:
                    addon_deps[aid] = set()

    broken_set = set(result["broken_mod_ids"])

    # For each mod listed in config.json, BFS through addon_deps to check if it
    # transitively pulls in a broken addon.
    config_to_remove = {}  # mod_id -> name
    for cfg_mod in cfg.get("game", {}).get("mods", []):
        mid = cfg_mod.get("modId", "").upper()
        if not mid:
            continue
        visited, queue = set(), [mid]
        while queue:
            cur = queue.pop()
            if cur in visited:
                continue
            visited.add(cur)
            if cur in broken_set:
                config_to_remove[mid] = (config_mod_names.get(mid)
                                          or addon_names.get(mid)
                                          or cfg_mod.get("name", mid))
                break
            for dep in addon_deps.get(cur, set()):
                if dep not in visited:
                    queue.append(dep)

    result["config_mods_to_remove"] = [{"id": k, "name": v} for k, v in config_to_remove.items()]

    # Generate human-readable issues and recommendations
    if result["script_module_failed"]:
        unique_files = list({e["file"].split("/")[-1] for e in result["script_errors"]})
        result["issues"].append(
            f"Script module compilation failed — {len(result['script_errors'])} error(s) in: "
            + ", ".join(unique_files[:5])
            + ("..." if len(unique_files) > 5 else "")
        )
        if result["broken_mods"]:
            names = ", ".join(m["name"] for m in result["broken_mods"])
            result["issues"].append(f"Broken mod(s): {names}")
            result["recommendations"].append(
                "Update the broken mods via Steam Workshop (SteamCMD), or temporarily remove them from config.json"
            )
        else:
            result["recommendations"].append(
                "Check for mod updates — script errors indicate API incompatibility with current engine version"
            )

    if result["mission_load_failed"]:
        if result["script_module_failed"]:
            result["issues"].append(
                "Mission failed to load because mod paks were not mounted after script compilation failure"
            )
            result["recommendations"].append(
                "Fix the script errors first — the mission load failure is a cascading consequence"
            )
        else:
            result["issues"].append(
                f"Mission resource not found: {result.get('mission_id', 'unknown')}"
            )
            result["recommendations"].append(
                "Verify the scenario mod is installed and the scenarioId GUID in config.json is correct"
            )

    if not result["issues"]:
        if not result["script_module_failed"] and not result["mission_load_failed"]:
            result["issues"].append("No critical errors detected in last startup log")

    return result


@app.get("/api/diagnostics")
async def get_diagnostics(request: Request):
    """Analyze latest server startup log for script errors, mod conflicts, and mission load failures."""
    log_dir = srv_log_dir(request)
    report = await asyncio.to_thread(_analyze_startup_log, log_dir)
    return report

@app.post("/api/diagnostics/remove-mods")
async def remove_broken_mods(request: Request):
    """Remove specified mod IDs from config.json. Requires config.write permission."""
    denied = require_permission(request, "config.write")
    if denied: return denied
    try:
        body = await request.json()
    except:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    mod_ids = [m.upper() for m in body.get("mod_ids", []) if m]
    if not mod_ids:
        return JSONResponse({"error": "No mod_ids provided"}, status_code=400)
    config_path = srv_config_path(request)
    cfg = read_config(config_path)
    if not cfg:
        return JSONResponse({"error": "Could not read config"}, status_code=500)
    before = cfg.get("game", {}).get("mods", [])
    after = [m for m in before if m.get("modId", "").upper() not in mod_ids]
    removed = [m for m in before if m.get("modId", "").upper() in mod_ids]
    cfg.setdefault("game", {})["mods"] = after
    result = write_config(cfg, config_path)
    if "error" in result:
        return JSONResponse(result, status_code=500)
    return {
        "removed": removed,
        "removed_count": len(removed),
        "remaining_mods": len(after),
        "message": f"Removed {len(removed)} mod(s) from config. Restart the server to apply."
    }

@app.get("/api/status")
async def status(request: Request):
    service = srv_service_name(request)
    config_path = srv_config_path(request)
    running = is_server_running(service)
    config = read_config(config_path)
    game = config.get("game", {})
    return {
        "server": {
            "status": "online" if running else "offline",
            "name": game.get("name", "Arma Server"),
            "players": get_player_count() if running else 0,
            "maxPlayers": game.get("maxPlayers", 0),
            "map": game.get("scenarioId", ""),
            "uptime": get_uptime(service),
            "panelUptime": _fmt_elapsed(time.time() - PROCESS_START),
            "modsLoaded": len(game.get("mods", [])),
            "visible": game.get("visible", True),
            "battlEye": game.get("gameProperties", {}).get("battlEye", False),
            "localIp": get_local_ip(),
            "pid": get_server_pid(service),
        },
        "system": await asyncio.to_thread(get_system_stats),
        "mat": _get_mat_stats(),
    }

def _get_mat_stats():
    stats = {"available": False}
    if MAT_STATS.exists():
        try:
            d = json.loads(MAT_STATS.read_text(errors='replace'))
            fresh = time.time() - d.get('updated', 0) < 180
            stats = {"available": fresh, "fps": d.get("fps"), "ai_characters": d.get("ai_characters", 0),
                     "registered_vehicles": d.get("registered_vehicles", 0), "uptime_seconds": d.get("uptime_seconds")}
        except: pass
    return stats

def _parse_live_players_from_logs(log_dir: Path = LOG_DIR):
    """
    Determine currently connected players from native Arma Reforger console logs.
    No mods required — reads the most recent console.log session.
    Returns list of {player_name, player_guid, ip}.
    """
    if not log_dir.exists():
        return []
    try:
        log_dirs = sorted([d for d in log_dir.iterdir() if d.is_dir()],
                          key=lambda d: d.stat().st_mtime, reverse=True)
    except:
        return []

    lines = []
    for ld in log_dirs[:2]:
        lf = ld / "console.log"
        if lf.exists():
            try:
                with open(lf, 'r', errors='replace') as f:
                    lines = f.readlines()
                break
            except:
                continue

    if not lines:
        return []

    rpl_to_ip   = {}  # rplIdentity hex -> IP string
    rpl_to_info = {}  # rplIdentity hex -> {name, guid}
    connected   = set()

    for line in lines:
        ln = line.strip()

        # Connect — "ServerImpl event: authenticating (identity=0x..., address=IP:PORT)"
        m = re.search(r'authenticating.*?identity=(0x[0-9a-fA-F]+).*?address=([\d.]+)', ln)
        if m:
            rpl = m.group(1).lower()
            rpl_to_ip[rpl] = m.group(2)
            connected.add(rpl)
            continue

        # Authenticated — "Authenticated player: rplIdentity=0x... identityId=GUID name=NAME"
        m = re.search(r'[Aa]uthenticated player.*?rplIdentity=(0x[0-9a-fA-F]+).*?identityId=([\w-]+).*?name=(\S+)', ln)
        if m:
            rpl = m.group(1).lower()
            rpl_to_info[rpl] = {'name': m.group(3), 'guid': m.group(2)}
            connected.add(rpl)
            continue

        # Updating player — "### Updating player: PlayerId=N, Name=X, rplIdentity=0x..., IdentityId=GUID"
        m = re.search(r'Updating player:.*?Name=(\S+).*?rplIdentity=(0x[0-9a-fA-F]+).*?IdentityId=([\w-]+)', ln, re.I)
        if m:
            rpl = m.group(2).lower()
            if rpl not in rpl_to_info:
                rpl_to_info[rpl] = {'name': m.group(1).rstrip(','), 'guid': m.group(3)}
            connected.add(rpl)
            continue

        # Disconnect — "ServerImpl event: disconnected (identity=0x...)"
        m = re.search(r'ServerImpl event: disconnected.*?identity=(0x[0-9a-fA-F]+)', ln, re.I)
        if m:
            connected.discard(m.group(1).lower())
            continue

    result = []
    for rpl in connected:
        info = rpl_to_info.get(rpl, {})
        if not info.get('name'):
            continue
        result.append({
            'player_name': info['name'],
            'player_guid': info.get('guid', ''),
            'ip':          rpl_to_ip.get(rpl, ''),
            'source':      'logs',
        })
    return result

@app.get("/api/players/live")
async def live_players(request: Request):
    """
    Live player list — always sourced from native Arma console logs (no mods needed).
    Optionally enriched with faction/rank from MAT if loaded.
    """
    players = _parse_live_players_from_logs()

    # Optional: enrich with MAT faction/rank data when MAT is loaded
    if MAT_ACTIVE.exists():
        try:
            mat_map = {}
            for line in MAT_ACTIVE.read_text(errors='replace').splitlines():
                line = line.strip()
                if line.startswith('{'):
                    try:
                        p = json.loads(line)
                        mat_map[p.get('player_name', '')] = p
                    except: pass
            for p in players:
                mat = mat_map.get(p['player_name'], {})
                if mat:
                    p['faction_name'] = mat.get('faction_name', '')
                    p['faction_key']  = mat.get('faction_key', '')
                    p['rank']         = mat.get('rank', '')
                    p['platform']     = mat.get('platform', '')
                    p['is_admin']     = mat.get('is_admin', False)
                    p['joined_at']    = mat.get('joined_at')
                    p['source']       = 'logs+mat'
        except: pass

    # Optional: enrich with session K/D from MAT kill logs
    if MAT_KILL_LOGS.exists():
        try:
            kd = {}
            for line in MAT_KILL_LOGS.read_text(errors='replace').splitlines():
                if not line.strip().startswith('{'): continue
                try:
                    ev = json.loads(line.strip())
                    if ev.get('event') == 'player_killed':
                        killer, victim = ev.get('killer_name',''), ev.get('player_name','')
                        if killer and killer != victim:
                            kd.setdefault(killer, {'kills':0,'deaths':0})['kills'] += 1
                        if victim:
                            kd.setdefault(victim,  {'kills':0,'deaths':0})['deaths'] += 1
                except: pass
            for p in players:
                stat = kd.get(p['player_name'], {})
                if stat:
                    p['kills']  = stat['kills']
                    p['deaths'] = stat['deaths']
        except: pass

    if is_demo(request):
        for p in players:
            p.pop("ip", None)
    return {"players": players, "count": len(players)}

@app.get("/api/server/ports")
async def server_ports(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    return _port_status(srv(request))


@app.post("/api/server/reset")
async def server_reset(request: Request):
    denied = require_permission(request, "server.reset")
    if denied: return denied
    profile_dir = srv_profile_dir(request)
    log_dir = srv_log_dir(request)
    body = await request.json()
    action = body.get("action", "")
    try:
        if action == "clear_saves":
            save_dir = profile_dir / "profile" / ".save"
            if save_dir.exists():
                shutil.rmtree(save_dir); save_dir.mkdir(parents=True)
                return {"message": "Save data cleared"}
            return {"message": "No save directory found"}
        elif action == "clear_logs":
            if log_dir.exists():
                count = 0
                for f in log_dir.rglob("*.log"): f.unlink(); count += 1
                return {"message": f"Cleared {count} log file(s)"}
            return {"message": "No log directory found"}
        elif action == "clear_mods":
            addons_dir = profile_dir / "addons"
            if not addons_dir.exists():
                return {"message": "No addons directory found"}
            removed = 0
            freed = 0
            for item in addons_dir.iterdir():
                try:
                    if item.is_dir():
                        for p in item.rglob("*"):
                            if p.is_file():
                                try: freed += p.stat().st_size
                                except Exception: pass
                        shutil.rmtree(item)
                        removed += 1
                    elif item.is_file():
                        try: freed += item.stat().st_size
                        except Exception: pass
                        item.unlink()
                        removed += 1
                except Exception:
                    continue
            mb = round(freed / (1024 * 1024), 1)
            return {"message": f"Cleared {removed} addon(s), {mb} MB freed"}
        else:
            return {"error": f"Unknown action: {action}"}
    except Exception as e:
        return {"error": str(e)}

# ── Persistence management ──────────────────────────────────────────────────

def _save_dir(request: Request) -> Path:
    return srv_profile_dir(request) / "profile" / ".save"

def _backups_dir(request: Request) -> Path:
    return srv_profile_dir(request) / "profile" / "saves_backup"


def _server_ports(server: dict) -> list:
    """Return the (port, proto) list for a server.

    Arma Reforger query port is bindPort + 15776 (e.g. 2001 → 17777).
    RCON port is read from config.json, defaulting to 19999.
    """
    game_port = server["port"]
    query_port = game_port + 15776
    rcon_port = 19999
    try:
        cfg = json.loads(Path(server["config_path"]).read_text())
        rcon_port = cfg.get("rcon", {}).get("port", 19999)
    except Exception:
        pass
    return [(game_port, "udp"), (query_port, "udp"), (rcon_port, "tcp")]


def _manage_ports(server: dict, action: str) -> dict:
    """Open, renew, or close firewall (ufw) and UPnP router port mappings.

    action: "open" | "renew" | "close"
    Returns {"ufw": {spec: status}, "upnp": {available, external_ip, mappings}}
    """
    ports = _server_ports(server)

    # --- ufw ---
    ufw_result = {}
    if action in ("open", "renew"):
        ufw_cmd = ["allow"]
        ufw_ok_label = "allowed"
    else:
        ufw_cmd = ["delete", "allow"]
        ufw_ok_label = "removed"

    for p, proto in ports:
        spec = f"{p}/{proto}"
        try:
            r = subprocess.run(
                ["sudo", "ufw"] + ufw_cmd + [spec],
                capture_output=True, text=True, timeout=10
            )
            if r.returncode != 0:
                ufw_result[spec] = f"error: ufw exited {r.returncode}: {r.stderr.strip()}"
            else:
                ufw_result[spec] = ufw_ok_label
        except Exception as e:
            ufw_result[spec] = f"error: {e}"

    # --- UPnP ---
    upnp_result = {"available": False, "external_ip": None, "mappings": {}}
    if UPNP_AVAILABLE:
        try:
            upnp = miniupnpc.UPnP()
            upnp.discoverdelay = 300
            n = upnp.discover()
            if n > 0:
                upnp.selectigd()
                upnp_result["available"] = True
                upnp_result["external_ip"] = upnp.externalipaddress()
                for p, proto in ports:
                    spec = f"{p}/{proto}"
                    try:
                        if action in ("open", "renew"):
                            upnp.addportmapping(
                                p, proto.upper(), upnp.lanaddr, p,
                                f"SITREP-{server['id']}", '0'
                            )
                            upnp_result["mappings"][spec] = "ok"
                        else:  # close
                            upnp.deleteportmapping(p, proto.upper())
                            upnp_result["mappings"][spec] = "removed"
                    except Exception as e:
                        upnp_result["mappings"][spec] = f"error: {e}"
        except Exception:
            pass  # no IGD found or UPnP error — leave available=False

    return {"ufw": ufw_result, "upnp": upnp_result}


def _port_status(server: dict) -> dict:
    """Read current port rule state without modifying anything.

    Returns same structure as _manage_ports.
    """
    ports = _server_ports(server)

    # ufw: parse current status output
    ufw_result = {}
    try:
        r = subprocess.run(
            ["sudo", "ufw", "status"],
            capture_output=True, text=True, timeout=10
        )
        status_text = r.stdout.lower()
        # Check each line start so "2001/udp" doesn't match "12001/udp"
        lines = status_text.splitlines()
        for p, proto in ports:
            spec = f"{p}/{proto}"
            ufw_result[spec] = "allowed" if any(line.startswith(spec) for line in lines) else "not set"
    except Exception as e:
        for p, proto in ports:
            ufw_result[f"{p}/{proto}"] = f"error: {e}"

    # UPnP: query existing mappings
    upnp_result = {"available": False, "external_ip": None, "mappings": {}}
    if UPNP_AVAILABLE:
        try:
            upnp = miniupnpc.UPnP()
            upnp.discoverdelay = 300
            n = upnp.discover()
            if n > 0:
                upnp.selectigd()
                upnp_result["available"] = True
                upnp_result["external_ip"] = upnp.externalipaddress()
                for p, proto in ports:
                    spec = f"{p}/{proto}"
                    try:
                        mapping = upnp.getspecificportmapping(p, proto.upper())
                        upnp_result["mappings"][spec] = "mapped" if mapping else "not mapped"
                    except Exception:
                        upnp_result["mappings"][spec] = "not mapped"
        except Exception:
            pass

    return {"ufw": ufw_result, "upnp": upnp_result}


def _dir_info(path: Path) -> dict:
    """Return file count, total size (bytes), and latest mtime for a directory."""
    if not path.exists():
        return {"file_count": 0, "total_size": 0, "last_save": None}
    files = [f for f in path.rglob("*") if f.is_file()]
    total = sum(f.stat().st_size for f in files)
    mtimes = [f.stat().st_mtime for f in files]
    return {"file_count": len(files), "total_size": total, "last_save": max(mtimes) if mtimes else None}

@app.get("/api/persistence/status")
async def persistence_status(request: Request):
    denied = require_permission(request, "server.reset")
    if denied: return denied
    save_dir = _save_dir(request)
    backups_dir = _backups_dir(request)
    info = _dir_info(save_dir)
    # Per-player save files
    player_dir = save_dir / "playersave"
    player_count = len(list(player_dir.glob("PlayerData.*.json"))) if player_dir.exists() else 0
    # Config values
    try:
        cfg = json.loads((srv_arma_dir(request) / "config.json").read_text())
        persistence = cfg.get("game", {}).get("gameProperties", {}).get("persistence", {})
        auto_save_interval = persistence.get("autoSaveInterval", 0)
        hive_id = persistence.get("hiveId", 0)
        player_save_time = cfg.get("operating", {}).get("playerSaveTime", 120)
    except Exception:
        auto_save_interval, hive_id, player_save_time = 0, 0, 120
    # Backups
    backup_count = len(list(backups_dir.glob("*.zip"))) if backups_dir.exists() else 0
    return {
        "enabled": auto_save_interval > 0,
        "auto_save_interval": auto_save_interval,
        "player_save_time": player_save_time,
        "hive_id": hive_id,
        "save_dir_exists": save_dir.exists(),
        "file_count": info["file_count"],
        "total_size": info["total_size"],
        "last_save": info["last_save"],
        "player_count": player_count,
        "backup_count": backup_count,
    }

@app.get("/api/persistence/backups")
async def list_backups(request: Request):
    denied = require_permission(request, "server.reset")
    if denied: return denied
    backups_dir = _backups_dir(request)
    if not backups_dir.exists():
        return {"backups": []}
    backups = []
    for f in sorted(backups_dir.glob("*.zip"), key=lambda x: x.stat().st_mtime, reverse=True):
        st = f.stat()
        backups.append({"filename": f.name, "size": st.st_size, "created": st.st_mtime})
    return {"backups": backups}

@app.post("/api/persistence/backup")
async def create_backup(request: Request):
    denied = require_permission(request, "server.reset")
    if denied: return denied
    save_dir = _save_dir(request)
    info = _dir_info(save_dir)
    if info["file_count"] == 0:
        return {"error": "No save data found to back up"}
    backups_dir = _backups_dir(request)
    backups_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = backups_dir / f"save_{ts}.zip"
    try:
        with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in save_dir.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(save_dir))
        size = backup_path.stat().st_size
        return {"filename": backup_path.name, "size": size, "message": "Backup created"}
    except Exception as e:
        if backup_path.exists(): backup_path.unlink()
        return {"error": str(e)}

@app.post("/api/persistence/restore")
async def restore_backup(request: Request):
    denied = require_permission(request, "server.reset")
    if denied: return denied
    svc = srv_service_name(request)
    if is_server_running(svc):
        return {"error": "Server must be stopped before restoring a backup"}
    body = await request.json()
    filename = body.get("filename", "")
    if not filename or not filename.endswith(".zip") or "/" in filename or ".." in filename:
        return {"error": "Invalid backup filename"}
    backup_path = _backups_dir(request) / filename
    if not backup_path.exists():
        return {"error": "Backup not found"}
    save_dir = _save_dir(request)
    try:
        if save_dir.exists(): shutil.rmtree(save_dir)
        save_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(backup_path, "r") as zf:
            for member in zf.namelist():
                member_path = (Path(save_dir) / member).resolve()
                if not str(member_path).startswith(str(Path(save_dir).resolve()) + os.sep):
                    return JSONResponse({"error": "Invalid zip entry"}, status_code=400)
                zf.extract(member, save_dir)
        return {"message": f"Restored from {filename}"}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/persistence/backup/{filename}")
async def delete_backup(request: Request, filename: str):
    denied = require_permission(request, "server.reset")
    if denied: return denied
    if ".." in filename or "/" in filename:
        return {"error": "Invalid filename"}
    backup_path = _backups_dir(request) / filename
    if not backup_path.exists(): return {"error": "Backup not found"}
    try:
        backup_path.unlink()
        return {"message": "Backup deleted"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/server/{action}")
async def server_action(action: str, request: Request):
    valid = {"start", "stop", "restart", "update", "validate"}
    if action not in valid:
        return {"error": f"Invalid action. Valid: {', '.join(sorted(valid))}"}
    perm = "server.update" if action in ("update", "validate") else "server.control"
    denied = require_permission(request, perm)
    if denied: return denied
    arma_dir = srv_arma_dir(request)
    service = srv_service_name(request)
    if action in ("start", "stop", "restart"):
        result = systemctl(action, service)
        if action == "start":
            # Non-blocking: renew UPnP leases after server starts
            asyncio.create_task(asyncio.to_thread(_manage_ports, srv(request), "renew"))
        return {"message": f"Server {action} executed", **result}
    elif action == "update":
        try:
            r = await asyncio.to_thread(subprocess.run,
                [STEAMCMD, "+force_install_dir", str(arma_dir), "+login", "anonymous",
                 "+app_update", "1874900", "validate", "+quit"],
                capture_output=True, text=True, timeout=600)
            if r.returncode != 0:
                return {"error": f"SteamCMD failed (exit {r.returncode})", "output": (r.stderr or r.stdout)[-2000:]}
            return {"message": "Update complete", "output": r.stdout[-2000:]}
        except subprocess.TimeoutExpired:
            return {"error": "Update timed out after 10 minutes"}
        except Exception as e:
            return {"error": str(e)}
    elif action == "validate":
        try:
            r = await asyncio.to_thread(subprocess.run,
                [STEAMCMD, "+force_install_dir", str(arma_dir), "+login", "anonymous",
                 "+app_update", "1874900", "validate", "+quit"],
                capture_output=True, text=True, timeout=300)
            return {"message": "Validation complete", "output": r.stdout[-500:]}
        except Exception as e:
            return {"error": str(e)}

@app.get("/api/logs")
async def logs(request: Request, lines: int = 200):
    return parse_logs(lines, srv_log_dir(request))

@app.get("/api/config")
async def get_config_endpoint(request: Request):
    cfg = read_config(srv_config_path(request))
    if is_demo(request) and isinstance(cfg, dict):
        import copy
        cfg = copy.deepcopy(cfg)
        if "game" in cfg:
            cfg["game"].pop("passwordAdmin", None)
            cfg["game"].pop("admins", None)
        if "rcon" in cfg:
            cfg["rcon"].pop("password", None)
            cfg["rcon"].pop("whitelist", None)
            cfg["rcon"].pop("blacklist", None)
        cfg.pop("publicAddress", None)
    return cfg

@app.put("/api/config")
async def put_config(request: Request):
    denied = require_permission(request, "config.write")
    if denied: return denied
    config_path = srv_config_path(request)
    try: data = await request.json()
    except: return {"error": "Invalid JSON"}
    return write_config(data, config_path)

@app.get("/api/configs/list")
async def list_configs(request: Request):
    denied = require_permission(request, "files.read")
    if denied: return denied
    config_path = srv_config_path(request)
    profile_dir = srv_profile_dir(request)
    configs = [{"label": "Server Config", "path": str(config_path), "key": "main"}]
    profile_save = profile_dir / "profile"
    if profile_save.exists():
        for f in sorted(profile_save.glob("*.json")):
            configs.append({"label": f.name, "path": str(f), "key": f.name})
    return configs

# === ADMIN MANAGEMENT ===

def _mat_admins_path(request: Request) -> Path:
    return srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME / "configs" / "admins.json"

def _load_mat_admins(path: Path) -> list:
    if path.exists():
        try: return json.loads(path.read_text(errors='replace'))
        except: pass
    return []

def _save_mat_admins(path: Path, admins: list):
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(admins, indent=2))
    except Exception as e:
        pass  # MAT dir may not exist if mod isn't installed

@app.get("/api/admins")
async def get_admins(request: Request):
    denied = require_role(request, "viewer")
    if denied: return denied
    data_dir = srv_data_dir(request)
    config_path = srv_config_path(request)
    config = read_config(config_path)
    config_admins = config.get("game", {}).get("admins", [])
    db = load_admins_db(data_dir)
    db_map = {a["id"]: a for a in db.get("admins", [])}
    # Merge MAT admins — add any MAT-only admins that aren't in the vanilla config
    mat_admins = _load_mat_admins(_mat_admins_path(request))
    mat_ids = {a["reforger_id"] for a in mat_admins}
    all_ids = list(config_admins) + [mid for mid in mat_ids if mid not in config_admins]
    admins = []
    for aid in all_ids:
        entry = db_map.get(aid, {})
        mat_entry = next((a for a in mat_admins if a["reforger_id"] == aid), {})
        admins.append({
            "id": aid,
            "username": entry.get("username", mat_entry.get("player_name", "")),
            "role": entry.get("role", mat_entry.get("role", "admin")),
            "added": entry.get("added", ""),
            "notes": entry.get("notes", ""),
            "mat_auto_admin": mat_entry.get("auto_admin", False),
        })
    return {"admins": admins, "config_ids": all_ids}

@app.post("/api/admins/add")
async def add_admin(request: Request):
    denied = require_permission(request, "admins.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    config_path = srv_config_path(request)
    body = await request.json()
    admin_id = body.get("id", "").strip()
    username = body.get("username", "").strip()
    role = body.get("role", "admin")
    notes = body.get("notes", "")
    if not admin_id: return {"error": "Admin ID required"}
    # Write to vanilla Arma config
    config = read_config(config_path)
    admins_list = config.get("game", {}).get("admins", [])
    if admin_id not in admins_list:
        if "game" not in config: config["game"] = {}
        if "admins" not in config["game"]: config["game"]["admins"] = []
        config["game"]["admins"].append(admin_id)
        write_config(config, config_path)
    # Write to panel admin DB
    db = load_admins_db(data_dir)
    existing = [a for a in db["admins"] if a["id"] != admin_id]
    existing.append({"id": admin_id, "username": username, "role": role,
        "added": datetime.now().isoformat(), "notes": notes})
    db["admins"] = existing
    save_admins_db(db, data_dir)
    # Sync to MAT admins.json
    mat_path = _mat_admins_path(request)
    mat_admins = _load_mat_admins(mat_path)
    mat_admins = [a for a in mat_admins if a.get("reforger_id") != admin_id]
    mat_admins.append({"reforger_id": admin_id, "player_name": username or admin_id,
        "role": role, "auto_admin": True})
    _save_mat_admins(mat_path, mat_admins)
    return {"message": f"Admin {username or admin_id} added"}

@app.post("/api/admins/remove")
async def remove_admin(request: Request):
    denied = require_permission(request, "admins.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    config_path = srv_config_path(request)
    body = await request.json()
    admin_id = body.get("id", "").strip()
    if not admin_id: return {"error": "Admin ID required"}
    # Remove from vanilla Arma config
    config = read_config(config_path)
    if "game" in config and "admins" in config["game"]:
        config["game"]["admins"] = [a for a in config["game"]["admins"] if a != admin_id]
        write_config(config, config_path)
    # Remove from panel admin DB
    db = load_admins_db(data_dir)
    db["admins"] = [a for a in db["admins"] if a["id"] != admin_id]
    save_admins_db(db, data_dir)
    # Remove from MAT admins.json
    mat_path = _mat_admins_path(request)
    mat_admins = _load_mat_admins(mat_path)
    mat_admins = [a for a in mat_admins if a.get("reforger_id") != admin_id]
    _save_mat_admins(mat_path, mat_admins)
    return {"message": f"Admin {admin_id} removed"}

@app.put("/api/admins/update")
async def update_admin(request: Request):
    denied = require_permission(request, "admins.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    body = await request.json()
    admin_id = body.get("id", "").strip()
    if not admin_id: return {"error": "Admin ID required"}
    db = load_admins_db(data_dir)
    for a in db["admins"]:
        if a["id"] == admin_id:
            if "username" in body: a["username"] = body["username"]
            if "role" in body: a["role"] = body["role"]
            if "notes" in body: a["notes"] = body["notes"]
            break
    save_admins_db(db, data_dir)
    return {"message": "Admin updated"}

# === JSON CONFIG SCANNER ===

@app.get("/api/profile/configs")
async def scan_profile_configs(request: Request):
    arma_dir = srv_arma_dir(request)
    configs = []
    seen = set()
    for base in [arma_dir]:
        if not base.exists(): continue
        for jf in base.rglob("*.json"):
            if "manifest" in jf.name: continue
            if "ServerData.json" == jf.name: continue
            rp = str(jf.relative_to(arma_dir))
            if rp in seen: continue
            seen.add(rp)
            try:
                data = json.loads(jf.read_text(errors='replace'))
                fields = []
                if isinstance(data, dict):
                    for k, v in data.items():
                        ftype = "array" if isinstance(v, list) else "object" if isinstance(v, dict) else "string" if isinstance(v, str) else "number" if isinstance(v, (int,float)) else "boolean" if isinstance(v, bool) else "unknown"
                        fields.append({"key": k, "type": ftype, "value": v if not isinstance(v, (dict,list)) else None,
                            "items": len(v) if isinstance(v, (dict,list)) else None})
                configs.append({"path": rp, "name": jf.name, "size": jf.stat().st_size,
                    "fields": fields, "editable": True})
            except: continue
    return {"configs": configs}

@app.get("/api/profile/config")
async def read_profile_config(path: str, request: Request):
    arma_dir = srv_arma_dir(request)
    profile_dir = srv_profile_dir(request)
    if not is_path_safe(path, [arma_dir, profile_dir]): return {"error": "Access denied"}
    target = Path(path) if path.startswith('/') else arma_dir / path
    if not target.exists(): return {"error": "Not found"}
    try:
        return {"data": json.loads(target.read_text(errors='replace')), "path": path}
    except Exception as e: return {"error": str(e)}

@app.put("/api/profile/config")
async def write_profile_config(request: Request):
    denied = require_permission(request, "admins.write")
    if denied: return denied
    arma_dir = srv_arma_dir(request)
    profile_dir = srv_profile_dir(request)
    body = await request.json()
    path = body.get("path", "")
    data = body.get("data")
    if not path or data is None: return {"error": "path and data required"}
    if not is_path_safe(path, [arma_dir, profile_dir]): return {"error": "Access denied"}
    target = Path(path) if path.startswith('/') else arma_dir / path
    try:
        if target.exists():
            shutil.copy2(target, str(target) + '.bak')
        target.write_text(json.dumps(data, indent=2))
        return {"message": f"Saved {target.name}"}
    except Exception as e: return {"error": str(e)}

# === BANDWIDTH CALCULATOR ===

@app.get("/api/bandwidth")
async def bandwidth_calc(players: int = 10, ai: int = 48, upload_mbps: float = 100):
    per_player_kbps = 80
    per_ai_kbps = 8
    overhead = 1.15
    total_kbps = (players * per_player_kbps + ai * per_ai_kbps) * overhead
    total_mbps = total_kbps / 1000
    utilization = (total_mbps / upload_mbps) * 100 if upload_mbps > 0 else 0
    max_players = int((upload_mbps * 1000 / overhead - ai * per_ai_kbps) / per_player_kbps)
    return {
        "estimated_upload_mbps": round(total_mbps, 2),
        "upload_capacity_mbps": upload_mbps,
        "utilization_pct": round(utilization, 1),
        "max_players_at_capacity": max(0, max_players),
        "breakdown": {
            "players": {"count": players, "kbps_each": per_player_kbps, "total_kbps": players * per_player_kbps},
            "ai": {"count": ai, "kbps_each": per_ai_kbps, "total_kbps": ai * per_ai_kbps},
            "overhead_multiplier": overhead,
        }
    }

# === FILES ===

@app.get("/api/files/locations")
async def file_locations(request: Request):
    arma_dir = srv_arma_dir(request)
    locs = [
        {"label": "Server Root", "path": "", "icon": "folder"},
        {"label": "Server Config", "path": "config.json", "icon": "settings"},
        {"label": "Profile", "path": "profile", "icon": "database"},
        {"label": "Addons", "path": "profile/addons", "icon": "package"},
        {"label": "Logs", "path": "profile/logs", "icon": "scroll"},
        {"label": "Save Data", "path": "profile/profile", "icon": "save"},
        *([{"label": "AI Game Master", "path": str(AIGM_DIR), "icon": "brain"}] if not is_demo(request) else []),
    ]
    for loc in locs:
        p = Path(loc["path"]) if loc["path"].startswith('/') else arma_dir / loc["path"]
        loc["exists"] = p.exists()
    return locs

@app.get("/api/files")
async def list_files(request: Request, path: str = ""):
    arma_dir = srv_arma_dir(request)
    profile_dir = srv_profile_dir(request)
    safe_dirs = [arma_dir, profile_dir] if is_demo(request) else [arma_dir, profile_dir, AIGM_DIR]
    if not is_path_safe(path, safe_dirs): return {"error": "Access denied", "type": "error"}
    target = (Path(path) if path.startswith('/') else (arma_dir / path if path else arma_dir)).resolve()
    if not target.exists(): return {"error": "Not found", "type": "error"}
    if target.is_file(): return {"type": "file", "name": target.name, "size": target.stat().st_size}
    items = []
    try:
        for e in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            if e.name.startswith('.'): continue
            item = {"name": e.name, "type": "dir" if e.is_dir() else "file"}
            if e.is_file():
                item["size"] = e.stat().st_size
                item["modified"] = e.stat().st_mtime
            items.append(item)
    except PermissionError:
        return {"error": "Permission denied", "type": "error"}
    return {"type": "dir", "path": path, "items": items}

@app.get("/api/files/read")
async def read_file_endpoint(request: Request, path: str):
    arma_dir = srv_arma_dir(request)
    profile_dir = srv_profile_dir(request)
    safe_dirs = [arma_dir, profile_dir] if is_demo(request) else [arma_dir, profile_dir, AIGM_DIR]
    if not is_path_safe(path, safe_dirs): return {"error": "Access denied"}
    target = (Path(path) if path.startswith('/') else arma_dir / path).resolve()
    if not target.exists(): return {"error": "Not found"}
    if not target.is_file(): return {"error": "Not a file"}
    if target.stat().st_size > 2*1024*1024: return {"error": "Too large (>2MB)"}
    try:
        return {"content": target.read_text(errors='replace'), "size": target.stat().st_size,
            "name": target.name, "path": path}
    except Exception as e: return {"error": str(e)}

@app.put("/api/files/write")
async def write_file_endpoint(request: Request):
    denied = require_permission(request, "files.write")
    if denied: return denied
    arma_dir = srv_arma_dir(request)
    profile_dir = srv_profile_dir(request)
    safe_dirs = [arma_dir, profile_dir, AIGM_DIR]
    body = await request.json()
    path = body.get("path",""); content = body.get("content","")
    if not path: return {"error": "No path"}
    if not is_path_safe(path, safe_dirs): return {"error": "Access denied"}
    target = (Path(path) if path.startswith('/') else arma_dir / path).resolve()
    if target.suffix.lower() in {'.exe','.bin','.so','.dll'}: return {"error": "Cannot edit binaries"}
    try:
        if target.exists(): shutil.copy2(target, target.with_suffix(target.suffix + '.bak'))
        target.write_text(content)
        return {"message": f"Saved {target.name}", "size": len(content)}
    except Exception as e: return {"error": str(e)}

@app.post("/api/files/delete")
async def delete_files_endpoint(request: Request):
    denied = require_permission(request, "files.write")
    if denied: return denied
    arma_dir = srv_arma_dir(request)
    profile_dir = srv_profile_dir(request)
    safe_dirs = [arma_dir, profile_dir, AIGM_DIR]
    body = await request.json()
    paths = body.get("paths", [])
    if not paths: return {"error": "No paths specified"}
    deleted, errors = 0, []
    for path in paths:
        if not is_path_safe(path, safe_dirs):
            errors.append(f"{path}: access denied"); continue
        target = (Path(path) if path.startswith('/') else arma_dir / path).resolve()
        if not target.exists():
            errors.append(f"{target.name}: not found"); continue
        try:
            if target.is_dir(): shutil.rmtree(target)
            else: target.unlink()
            deleted += 1
        except Exception as e: errors.append(f"{target.name}: {e}")
    msg = f"Deleted {deleted} item(s)"
    if errors: return {"message": msg, "errors": errors, "error": errors[0] if deleted == 0 else None}
    return {"message": msg}

@app.post("/api/files/mkdir")
async def mkdir_endpoint(request: Request):
    denied = require_permission(request, "files.write")
    if denied: return denied
    arma_dir = srv_arma_dir(request)
    profile_dir = srv_profile_dir(request)
    safe_dirs = [arma_dir, profile_dir, AIGM_DIR]
    body = await request.json()
    path = body.get("path", "")
    if not path: return {"error": "No path"}
    if not is_path_safe(path, safe_dirs): return {"error": "Access denied"}
    target = (Path(path) if path.startswith('/') else arma_dir / path).resolve()
    if target.exists(): return {"error": "Already exists"}
    try:
        target.mkdir(parents=True)
        return {"message": f"Created {target.name}"}
    except Exception as e: return {"error": str(e)}

# === PLAYER DATABASE (SQLite — persistent across server restarts) ===

_player_db_lock = Lock()

def _get_player_db_conn(data_dir: Path = PANEL_DATA):
    conn = sqlite3.connect(str(player_db_path(data_dir)))
    conn.row_factory = sqlite3.Row
    return conn

def _init_player_db():
    conn = _get_player_db_conn()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS players (
                guid TEXT PRIMARY KEY,
                name TEXT,
                names_seen TEXT DEFAULT '[]',
                ips_seen TEXT DEFAULT '[]',
                platform TEXT DEFAULT '',
                first_seen TEXT,
                last_seen TEXT,
                session_count INTEGER DEFAULT 0,
                kills INTEGER DEFAULT 0,
                deaths INTEGER DEFAULT 0,
                teamkills INTEGER DEFAULT 0,
                notes TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS ip_bans (
                ip TEXT PRIMARY KEY,
                reason TEXT DEFAULT 'Banned',
                banned_by TEXT DEFAULT '',
                banned_at TEXT
            );
            CREATE TABLE IF NOT EXISTS ip_reputation (
                ip TEXT PRIMARY KEY,
                fraud_score INTEGER DEFAULT 0,
                is_vpn INTEGER DEFAULT 0,
                is_proxy INTEGER DEFAULT 0,
                is_tor INTEGER DEFAULT 0,
                isp TEXT DEFAULT '',
                country_code TEXT DEFAULT '',
                connection_type TEXT DEFAULT '',
                checked_at TEXT
            );
            CREATE TABLE IF NOT EXISTS admin_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT DEFAULT '',
                detail TEXT DEFAULT '',
                timestamp TEXT NOT NULL
            );
        """)
        conn.commit()
    finally:
        conn.close()

_init_player_db()

# Migrations — safe to run on existing DBs
def _migrate_player_db():
    conn = _get_player_db_conn()
    try:
        existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(players)").fetchall()}
        if "notes" not in existing_cols:
            conn.execute("ALTER TABLE players ADD COLUMN notes TEXT DEFAULT ''")
        conn.commit()
    finally:
        conn.close()

_migrate_player_db()

# ─── Stats DB ─────────────────────────────────────────────────────────────────

_stats_db_lock = Lock()

def stats_db_path(data_dir: Path = PANEL_DATA) -> Path:
    return data_dir / "stats.db"

def _get_stats_db_conn(data_dir: Path = PANEL_DATA) -> sqlite3.Connection:
    conn = sqlite3.connect(str(stats_db_path(data_dir)))
    conn.row_factory = sqlite3.Row
    return conn

def _init_stats_db(data_dir: Path = PANEL_DATA):
    conn = _get_stats_db_conn(data_dir)
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS kill_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          INTEGER NOT NULL,
                killer      TEXT NOT NULL DEFAULT '',
                killer_guid TEXT NOT NULL DEFAULT '',
                victim      TEXT NOT NULL DEFAULT '',
                victim_guid TEXT NOT NULL DEFAULT '',
                weapon      TEXT NOT NULL DEFAULT 'Unknown',
                distance    REAL    DEFAULT 0,
                friendly_fire INTEGER DEFAULT 0,
                team_kill   INTEGER DEFAULT 0,
                UNIQUE(ts, killer_guid, victim_guid, weapon)
            );
            CREATE TABLE IF NOT EXISTS player_sessions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name   TEXT    NOT NULL,
                player_guid   TEXT    NOT NULL DEFAULT '',
                connect_ts    INTEGER NOT NULL,
                disconnect_ts INTEGER,
                UNIQUE(player_name, connect_ts)
            );
            CREATE TABLE IF NOT EXISTS server_sessions (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                start_ts  INTEGER UNIQUE NOT NULL,
                end_ts    INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_kill_ts     ON kill_events(ts);
            CREATE INDEX IF NOT EXISTS idx_kill_killer ON kill_events(killer);
            CREATE INDEX IF NOT EXISTS idx_sess_conn   ON player_sessions(connect_ts);
        """)
        conn.commit()
    finally:
        conn.close()

_init_stats_db()

def _sync_kill_events(mat_dir: Path, data_dir: Path = PANEL_DATA):
    """Parse kill_logs.json and INSERT OR IGNORE new kill events into stats.db."""
    kill_log = mat_dir / "logs/kill_logs.json"
    if not kill_log.exists():
        return
    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            with open(kill_log, 'r', errors='replace') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('='):
                        continue
                    try:
                        ev = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if ev.get('event') != 'player_killed':
                        continue
                    conn.execute(
                        """INSERT OR IGNORE INTO kill_events
                           (ts,killer,killer_guid,victim,victim_guid,weapon,distance,friendly_fire,team_kill)
                           VALUES(?,?,?,?,?,?,?,?,?)""",
                        (
                            ev.get('timestamp', 0),
                            ev.get('killer_name', ''),
                            ev.get('killer_guid', ''),
                            ev.get('victim_name', ''),
                            ev.get('victim_guid', ''),
                            ev.get('weapon', 'Unknown'),
                            float(ev.get('distance', 0) or 0),
                            1 if ev.get('friendly_fire') else 0,
                            1 if ev.get('team_kill') else 0,
                        )
                    )
            conn.commit()
        finally:
            conn.close()

def _sync_player_sessions(mat_dir: Path, data_dir: Path = PANEL_DATA):
    """Parse connection_logs.json and sync player connect/disconnect into stats.db."""
    conn_log = mat_dir / "logs/connection_logs.json"
    if not conn_log.exists():
        return
    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            with open(conn_log, 'r', errors='replace') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('='):
                        continue
                    try:
                        ev = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    event = ev.get('event')
                    ts = ev.get('timestamp', 0)
                    name = ev.get('player_name', '')
                    guid = ev.get('player_guid', '')
                    if not name:
                        continue
                    if event == 'player_connected':
                        conn.execute(
                            "INSERT OR IGNORE INTO player_sessions(player_name,player_guid,connect_ts) VALUES(?,?,?)",
                            (name, guid, ts)
                        )
                    elif event == 'player_disconnected':
                        # Update the most recent open session for this player
                        conn.execute(
                            """UPDATE player_sessions SET disconnect_ts=?, player_guid=?
                               WHERE id=(
                                   SELECT id FROM player_sessions
                                   WHERE player_name=? AND connect_ts<=? AND disconnect_ts IS NULL
                                   ORDER BY connect_ts DESC LIMIT 1
                               )""",
                            (ts, guid, name, ts)
                        )
            conn.commit()
        finally:
            conn.close()

def _sync_server_sessions(mat_dir: Path, data_dir: Path = PANEL_DATA):
    """Derive server up/down sessions from game_start events in kill_logs.json."""
    kill_log = mat_dir / "logs/kill_logs.json"
    if not kill_log.exists():
        return
    game_starts = []
    try:
        with open(kill_log, 'r', errors='replace') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('='):
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if ev.get('event') == 'game_start':
                    game_starts.append(ev.get('timestamp', 0))
    except OSError:
        return

    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            for i, start_ts in enumerate(game_starts):
                end_ts = game_starts[i + 1] if i + 1 < len(game_starts) else None
                conn.execute(
                    "INSERT OR REPLACE INTO server_sessions(start_ts, end_ts) VALUES(?,?)",
                    (start_ts, end_ts)
                )
            conn.commit()
        finally:
            conn.close()

def _log_action(actor: str, action: str, target: str = '', detail: str = '', data_dir: Path = PANEL_DATA):
    """Write an entry to the admin audit log."""
    try:
        with _player_db_lock:
            conn = _get_player_db_conn(data_dir)
            try:
                conn.execute(
                    "INSERT INTO admin_actions (actor,action,target,detail,timestamp) VALUES (?,?,?,?,?)",
                    (actor, action, target, detail, datetime.utcnow().isoformat())
                )
                conn.commit()
            finally:
                conn.close()
    except:
        pass

def _sync_player_db_from_logs(log_dir: Path = LOG_DIR, data_dir: Path = PANEL_DATA):
    """Parse all available log sessions and upsert player data into SQLite."""
    if not log_dir.exists():
        return
    try:
        log_dirs = sorted([d for d in log_dir.iterdir() if d.is_dir()],
                          key=lambda d: d.stat().st_mtime, reverse=True)
    except:
        return

    all_lines = []
    for ld in log_dirs[:15]:
        lf = ld / "console.log"
        if lf.exists():
            try:
                with open(lf, 'r', errors='replace') as f:
                    all_lines.extend(f.readlines())
            except:
                continue

    if not all_lines:
        return

    rpl_to_ip   = {}
    rpl_to_guid = {}
    players     = {}  # guid -> dict

    def upsert(guid, name, ip=''):
        if not guid:
            return
        if guid not in players:
            players[guid] = {'guid': guid, 'name': name, 'names': set(),
                             'ips': set(), 'sessions': 0, 'kills': 0, 'deaths': 0, 'tks': 0}
        p = players[guid]
        if name:
            p['name'] = name
            p['names'].add(name)
        if ip:
            p['ips'].add(ip)

    for line in all_lines:
        ln = line.strip()

        m = re.search(r'authenticating.*?identity=(0x[0-9a-fA-F]+).*?address=([\d.]+)', ln)
        if m:
            rpl_to_ip[m.group(1).lower()] = m.group(2)
            continue

        m = re.search(r'[Aa]uthenticated player.*?rplIdentity=(0x[0-9a-fA-F]+).*?identityId=([\w-]+).*?name=(\S+)', ln)
        if m:
            rpl = m.group(1).lower()
            guid, name = m.group(2), m.group(3)
            rpl_to_guid[rpl] = {'name': name, 'guid': guid}
            ip = rpl_to_ip.get(rpl, '')
            upsert(guid, name, ip)
            players[guid]['sessions'] += 1
            continue

        m = re.search(r'Updating player:.*?Name=([^,]+).*?rplIdentity=(0x[0-9a-fA-F]+).*?IdentityId=([\w-]+)', ln, re.I)
        if m:
            name, rpl, guid = m.group(1).strip().rstrip(','), m.group(2).lower(), m.group(3)
            rpl_to_guid[rpl] = {'name': name, 'guid': guid}
            ip = rpl_to_ip.get(rpl, '')
            upsert(guid, name, ip)
            continue

        m = re.search(r'serveradmintools_player_killed.*?killer:\s*([^,|]+).*?victim:\s*([^,|]+)', ln)
        if m:
            killer_name = m.group(1).strip()
            victim_name = m.group(2).strip()
            tk = 'teamkill: true' in ln.lower()
            for p in players.values():
                if p['name'] == killer_name:
                    p['kills'] += 1
                    if tk:
                        p['tks'] += 1
                if p['name'] == victim_name:
                    p['deaths'] += 1

    now = datetime.now().isoformat()
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            for guid, p in players.items():
                row = conn.execute("SELECT names_seen, ips_seen, session_count, kills, deaths, teamkills FROM players WHERE guid=?", (guid,)).fetchone()
                if row:
                    ex_names = set(json.loads(row['names_seen'] or '[]'))
                    ex_ips   = set(json.loads(row['ips_seen']   or '[]'))
                    merged_names = list(ex_names | p['names'])
                    merged_ips   = list(ex_ips   | p['ips'])
                    conn.execute("""UPDATE players SET name=?,names_seen=?,ips_seen=?,last_seen=?,
                        session_count=MAX(session_count,?),kills=MAX(kills,?),deaths=MAX(deaths,?),teamkills=MAX(teamkills,?)
                        WHERE guid=?""",
                        (p['name'], json.dumps(merged_names), json.dumps(merged_ips), now,
                         p['sessions'], p['kills'], p['deaths'], p['tks'], guid))
                else:
                    conn.execute("""INSERT INTO players
                        (guid,name,names_seen,ips_seen,first_seen,last_seen,session_count,kills,deaths,teamkills)
                        VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (guid, p['name'], json.dumps(list(p['names'])), json.dumps(list(p['ips'])),
                         now, now, p['sessions'], p['kills'], p['deaths'], p['tks']))
            conn.commit()
        finally:
            conn.close()

@app.get("/api/players/history")
async def player_history(request: Request, q: str = ""):
    data_dir = srv_data_dir(request)
    log_dir = srv_log_dir(request)
    await asyncio.get_running_loop().run_in_executor(None, _sync_player_db_from_logs, log_dir, data_dir)
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            if q:
                rows = conn.execute(
                    "SELECT * FROM players WHERE name LIKE ? OR guid LIKE ? OR names_seen LIKE ? OR ips_seen LIKE ? ORDER BY last_seen DESC LIMIT 500",
                    (f'%{q}%', f'%{q}%', f'%{q}%', f'%{q}%')).fetchall()
            else:
                rows = conn.execute("SELECT * FROM players ORDER BY last_seen DESC LIMIT 500").fetchall()
            total = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
            result = [dict(r) for r in rows]
            if is_demo(request):
                for p in result:
                    p["ips_seen"] = "[]"
            return {"players": result, "total": total}
        finally:
            conn.close()

@app.get("/api/admin/troll-alerts")
async def troll_alerts(request: Request):
    if is_demo(request): return {"alerts": []}
    data_dir = srv_data_dir(request)
    log_dir = srv_log_dir(request)
    await asyncio.get_running_loop().run_in_executor(None, _sync_player_db_from_logs, log_dir, data_dir)
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            rows = conn.execute("SELECT guid, name, names_seen, ips_seen, last_seen FROM players").fetchall()
        finally:
            conn.close()

    ip_to_players: dict = {}
    for row in rows:
        ips = json.loads(row['ips_seen'] or '[]')
        for ip in ips:
            ip_to_players.setdefault(ip, []).append({
                'guid': row['guid'], 'name': row['name'],
                'names': json.loads(row['names_seen'] or '[]'), 'last_seen': row['last_seen'],
            })

    alerts = []
    for ip, plist in ip_to_players.items():
        if len(plist) >= 2:
            all_names = set()
            for p in plist:
                all_names.update(p['names'])
                all_names.add(p['name'])
            if len(all_names) >= 2:
                alerts.append({'ip': ip, 'player_count': len(plist), 'names': list(all_names), 'players': plist})

    return {"alerts": sorted(alerts, key=lambda a: a['player_count'], reverse=True)}

@app.get("/api/admin/ip-bans")
async def list_ip_bans(request: Request):
    data_dir = srv_data_dir(request)
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            rows = conn.execute("SELECT * FROM ip_bans ORDER BY banned_at DESC").fetchall()
            return {"bans": [dict(r) for r in rows]}
        finally:
            conn.close()

@app.post("/api/admin/ip-ban")
async def add_ip_ban(request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    body = await request.json()
    ip = body.get("ip", "").strip()
    reason = body.get("reason", "Banned").strip()
    if not ip: return {"error": "IP required"}
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        return {"error": f"Invalid IP: {ip}"}

    banned_by = current_user(request).get('username', 'admin')
    banned_at = datetime.now().isoformat()

    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            conn.execute("INSERT OR REPLACE INTO ip_bans (ip,reason,banned_by,banned_at) VALUES (?,?,?,?)",
                         (ip, reason, banned_by, banned_at))
            conn.commit()
        finally:
            conn.close()

    ufw_result = "ufw not available"
    try:
        r = await asyncio.to_thread(subprocess.run, ["sudo", "ufw", "deny", "from", ip, "to", "any"],
                                    capture_output=True, text=True, timeout=10)
        ufw_result = (r.stdout + r.stderr).strip() or "Done"
    except Exception as e:
        ufw_result = f"ufw error: {e}"

    _log_action(banned_by, "ip_ban", ip, reason, data_dir)
    return {"message": f"IP {ip} banned", "ufw": ufw_result}

@app.delete("/api/admin/ip-ban/{encoded_ip}")
async def remove_ip_ban(encoded_ip: str, request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    ip = encoded_ip.replace('_', '.')
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        return JSONResponse({"error": "Invalid IP address"}, status_code=400)

    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            conn.execute("DELETE FROM ip_bans WHERE ip=?", (ip,))
            conn.commit()
        finally:
            conn.close()

    ufw_result = "ufw not available"
    try:
        r = await asyncio.to_thread(subprocess.run, ["sudo", "ufw", "delete", "deny", "from", ip, "to", "any"],
                                    capture_output=True, text=True, timeout=10)
        ufw_result = (r.stdout + r.stderr).strip() or "Done"
    except Exception as e:
        ufw_result = f"ufw error: {e}"

    _log_action(current_user(request).get('username','unknown'), "ip_unban", ip, "", data_dir)
    return {"message": f"IP {ip} unbanned", "ufw": ufw_result}

@app.get("/api/admin/mods/detected")
async def detect_admin_mods(request: Request):
    profile_dir = srv_profile_dir(request)
    config_path = srv_config_path(request)
    sat_path = profile_dir / "profile" / "ServerAdminTools_Config.json"
    cfg = read_config(config_path)
    loaded_ids = {m.get('modId','') for m in cfg.get('game', {}).get('mods', []) if isinstance(m, dict)}

    SAT_ID = '5AAAC70D754245DD'
    MAT_ID = '68DC33B21E340EA1'

    sat_detected = sat_path.exists() or SAT_ID in loaded_ids
    mat_dir = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME
    mat_detected  = mat_dir.exists()  or MAT_ID in loaded_ids

    mods = []
    if sat_detected:
        mods.append({
            "id": SAT_ID, "name": "Server Admin Tools", "short": "SAT",
            "status": "active" if sat_path.exists() else "in_config",
            "features": ["admins", "bans", "events_api", "chat_messages"],
        })
    if mat_detected:
        mat_settings = mat_dir / "configs" / "msf_settings.json"
        mat_bans_f   = mat_dir / "configs" / "banlist.json"
        mat_webhooks = mat_dir / "configs" / "msf_webhooks.json"
        mods.append({
            "id": MAT_ID, "name": "Misfits Admin Tools", "short": "MAT",
            "status": "active" if mat_dir.exists() else "in_config",
            "features": ["admins", "bans", "webhooks", "player_cache", "commands", "spectate"],
            "settings_exists": mat_settings.exists(),
            "bans_exists": mat_bans_f.exists(),
            "webhooks_exists": mat_webhooks.exists(),
        })
    if not mods:
        mods.append({"id": "native", "name": "Native (No Admin Mod)", "short": "NATIVE",
                     "status": "active", "features": ["rcon", "logs"]})

    return {"mods": mods, "sat": sat_detected, "mat": mat_detected}

@app.get("/api/admin/mat/bans")
async def mat_bans(request: Request):
    ban_path = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME / "configs" / "banlist.json"
    if not ban_path.exists():
        return {"bans": [], "exists": False}
    try:
        data = json.loads(ban_path.read_text(errors='replace'))
        return {"bans": data if isinstance(data, list) else [], "exists": True}
    except Exception as e:
        return {"error": str(e), "bans": []}

@app.post("/api/admin/mat/ban")
async def add_mat_ban(request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    body = await request.json()
    guid = body.get("reforger_id", "").strip()
    player_name = body.get("player_name", "").strip()
    reason = body.get("reason", "Banned").strip()
    if not guid: return {"error": "reforger_id required"}

    ban_path = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME / "configs" / "banlist.json"
    ban_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        bans = []
        if ban_path.exists():
            bans = json.loads(ban_path.read_text(errors='replace'))
            if not isinstance(bans, list): bans = []
        bans = [b for b in bans if b.get('reforger_id') != guid]
        admin_user = current_user(request).get('username', 'panel')
        bans.append({
            "reforger_id": guid, "player_name": player_name,
            "admin_name": admin_user, "admin_guid": "",
            "banned_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"), "reason": reason,
        })
        ban_path.write_text(json.dumps(bans, indent=2))
        return {"message": f"Banned {player_name or guid}"}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/admin/mat/ban/{guid}")
async def remove_mat_ban(guid: str, request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    ban_path = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME / "configs" / "banlist.json"
    if not ban_path.exists(): return {"error": "banlist.json not found"}
    try:
        bans = json.loads(ban_path.read_text(errors='replace'))
        ban_path.write_text(json.dumps([b for b in bans if b.get('reforger_id') != guid], indent=2))
        return {"message": f"Unbanned {guid}"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/admin/rcon/kick")
async def rcon_kick(request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    body = await request.json()
    player_id = body.get("player_id", "").strip()
    if not player_id: return {"error": "player_id required"}
    host, port, pw = _rcon_cfg(srv_config_path(request))
    if not port or not pw: return {"error": "RCON not configured"}
    try:
        resp = await asyncio.get_running_loop().run_in_executor(None, _rcon_exec, host, port, pw, f"#kick {player_id}")
        _log_action(current_user(request).get('username','unknown'), "kick", player_id, body.get("reason",""), srv_data_dir(request))
        return {"message": f"Kicked {player_id}", "rcon": resp}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/admin/rcon/message")
async def rcon_message(request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    body = await request.json()
    msg = body.get("message", "").strip()
    target = body.get("target", "").strip()
    if not msg: return {"error": "message required"}
    host, port, pw = _rcon_cfg(srv_config_path(request))
    if not port or not pw: return {"error": "RCON not configured"}
    cmd = f"#say {target} {msg}" if target else f"#say {msg}"
    try:
        resp = await asyncio.get_running_loop().run_in_executor(None, _rcon_exec, host, port, pw, cmd)
        return {"message": "Sent", "rcon": resp}
    except Exception as e:
        return {"error": str(e)}

# === AUDIT LOG ===

@app.get("/api/admin/audit-log")
async def get_audit_log(request: Request):
    denied = require_role(request, "viewer")
    if denied: return denied
    data_dir = srv_data_dir(request)
    try:
        limit = min(int(request.query_params.get("limit", 200)), 1000)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (ValueError, TypeError):
        return JSONResponse({"error": "Invalid limit or offset"}, status_code=400)
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            rows = conn.execute(
                "SELECT * FROM admin_actions ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit, offset)
            ).fetchall()
            total = conn.execute("SELECT COUNT(*) FROM admin_actions").fetchone()[0]
            return {"actions": [dict(r) for r in rows], "total": total}
        finally:
            conn.close()

# === STARTUP PARAMETERS ===

STARTUP_PARAM_SCHEMA = [
    {"key": "maxFPS",           "label": "Max FPS",                "type": "int",   "default": 60,    "category": "Performance", "description": "Server tick rate cap. Recommended 60–120. Without this the server will peg CPU.", "min": 10, "max": 240},
    {"key": "noSound",          "label": "No Sound",               "type": "flag",  "default": True,  "category": "Performance", "description": "Disable audio output. Always set on dedicated servers."},
    {"key": "noPause",          "label": "No Pause",               "type": "flag",  "default": True,  "category": "Performance", "description": "Prevent server from pausing when its window loses focus."},
    {"key": "nothrow",          "label": "No Throw",               "type": "flag",  "default": False, "category": "Performance", "description": "Suppress assert errors on startup. Recommended for production stability."},
    {"key": "logStats",         "label": "Log Stats Interval (ms)","type": "int",   "default": 0,     "category": "Logging",     "description": "Log FPS and performance data at this interval in milliseconds. 0 = disabled. e.g. 10000 = every 10s.", "min": 0},
    {"key": "logLevel",         "label": "Log Level",              "type": "enum",  "default": "normal","category": "Logging",   "description": "Verbosity of console log output.", "options": ["normal","warning","error","fatal"]},
    {"key": "logAppend",        "label": "Log Append",             "type": "flag",  "default": False, "category": "Logging",     "description": "Append to existing log file instead of creating a new one each start."},
    {"key": "logTime",          "label": "Log Timestamps",         "type": "flag",  "default": False, "category": "Logging",     "description": "Prefix every log line with a timestamp."},
    {"key": "keepCrashFiles",   "label": "Keep Crash Files",       "type": "flag",  "default": False, "category": "Logging",     "description": "Preserve crash dump files on disk for debugging."},
    {"key": "listScenarios",    "label": "List Scenarios",         "type": "flag",  "default": False, "category": "Logging",     "description": "Log all available scenario .conf paths on startup."},
    {"key": "aiLimit",          "label": "AI Limit",               "type": "int",   "default": -1,    "category": "AI",          "description": "Maximum number of AI characters. -1 = unlimited.", "min": -1},
    {"key": "aiPartialSim",     "label": "AI Partial Simulation",  "type": "flag",  "default": False, "category": "AI",          "description": "Enable partial AI simulation for better performance with high AI counts."},
    {"key": "disableAI",        "label": "Disable AI",             "type": "flag",  "default": False, "category": "AI",          "description": "Disable AI entirely. For testing/diagnostic use only."},
    {"key": "nds",              "label": "Network Dynamic Sim",    "type": "int",   "default": 0,     "category": "Network",     "description": "Network Dynamic Simulation diameter. 0 = disabled.", "min": 0},
    {"key": "staggeringBudget", "label": "Staggering Budget",      "type": "int",   "default": 0,     "category": "Network",     "description": "Stationary spatial cells processed per tick (1–10201). Lower = fewer per tick, slower client stream-in. 0 = disabled.", "min": 0, "max": 10201},
    {"key": "streamingBudget",  "label": "Streaming Budget",       "type": "int",   "default": 0,     "category": "Network",     "description": "Global entity streaming budget split across all connections. Minimum 100 when set. 0 = disabled.", "min": 0},
    {"key": "loadSessionSave",  "label": "Load Session Save",      "type": "string","default": "",    "category": "Persistence", "description": "Load a session save by UUID, or 'latest' for the most recent save of the current scenario."},
    {"key": "keepSessionSave",  "label": "Keep Session Save",      "type": "flag",  "default": False, "category": "Persistence", "description": "Preserve the session save between server restarts."},
    {"key": "disableCrashReporter","label":"Disable Crash Reporter","type": "flag", "default": False, "category": "Logging",     "description": "Disable automatic crash report submission to Bohemia Interactive."},
    {"key": "backendLog",       "label": "Backend Log",            "type": "flag",  "default": False, "category": "Logging",     "description": "Enable backend logging output."},
]

ARMA_EXE = str(ARMA_DIR / "ArmaReforgerServer")

def _service_file(service_name: str) -> Path:
    return Path(f"/etc/systemd/system/{service_name}.service")

def _parse_current_startup_args(service_name: str) -> dict:
    """Parse current ExecStart from systemd service file into a dict of active params."""
    try:
        content = _service_file(service_name).read_text()
        m = re.search(r'ExecStart=(.+)', content)
        if not m:
            return {}
        line = m.group(1).strip()
        # Remove the executable itself
        parts = line.split()
        # Parse flags: -key value or -key (flag)
        active = {}
        i = 1  # skip executable
        while i < len(parts):
            p = parts[i]
            if p.startswith('-'):
                key = p.lstrip('-')
                # Check if next part is a value (not a flag)
                if i + 1 < len(parts) and not parts[i+1].startswith('-'):
                    active[key] = parts[i+1]
                    i += 2
                else:
                    active[key] = True
                    i += 1
            else:
                i += 1
        return active
    except:
        return {}

@app.get("/api/server/startup-params")
async def get_startup_params(request: Request):
    denied = require_role(request, "viewer")
    if denied: return denied
    service = srv_service_name(request)
    active = _parse_current_startup_args(service)
    # Merge schema with active values
    result = []
    for param in STARTUP_PARAM_SCHEMA:
        p = dict(param)
        key = p['key']
        if key in active:
            raw = active[key]
            if p['type'] == 'flag':
                p['value'] = True
            elif p['type'] == 'int':
                try: p['value'] = int(raw) if raw is not True else p['default']
                except: p['value'] = p['default']
            else:
                p['value'] = raw if raw is not True else ''
            p['active'] = True
        else:
            p['value'] = p['default']
            p['active'] = False
        result.append(p)
    return {"params": result, "current_execstart": _parse_current_startup_args(service)}

@app.put("/api/server/startup-params")
async def set_startup_params(request: Request):
    denied = require_permission(request, "config.write")
    if denied: return denied
    user = current_user(request)
    service = srv_service_name(request)
    svc_file = _service_file(service)
    body = await request.json()
    updates = body.get("params", {})  # {key: value_or_false_to_remove}

    # Validate keys against schema and values against injection chars
    _schema_keys = {p['key'] for p in STARTUP_PARAM_SCHEMA}
    _bad_chars = {'\n', '\r', '\x00', '%'}
    for k, v in updates.items():
        if k not in _schema_keys:
            return JSONResponse({"error": f"Unknown startup parameter: {k}"}, status_code=400)
        if isinstance(v, str) and any(c in v for c in _bad_chars):
            return JSONResponse({"error": f"Invalid characters in value for '{k}'"}, status_code=400)

    # Validate loadSessionSave against allowlist
    if 'loadSessionSave' in updates:
        val = updates['loadSessionSave']
        if val and val != 'latest' and not re.match(r'^[a-fA-F0-9\-]{1,64}$', str(val)):
            return JSONResponse({"error": "Invalid loadSessionSave value"}, status_code=400)

    # Get current args
    current = _parse_current_startup_args(service)
    config_path = current.pop('config', './config.json')
    profile_path = current.pop('profile', './profile')

    # Apply updates
    for key, val in updates.items():
        if val is False or val == '' or val is None:
            current.pop(key, None)
        else:
            current[key] = val

    # Remove 0-value ints (disabled)
    for param in STARTUP_PARAM_SCHEMA:
        k = param['key']
        if k in current and param['type'] == 'int' and current[k] == 0:
            del current[k]

    new_line = f"{ARMA_EXE} -config {config_path} -profile {profile_path}"
    for key, val in current.items():
        if val is True or val == 'true':
            new_line += f" -{key}"
        elif val not in (False, 'false', '', None, 0):
            new_line += f" -{key} {val}"

    try:
        content = svc_file.read_text()
        new_content = re.sub(r'ExecStart=.+', f'ExecStart={new_line}', content)
        tee = subprocess.run(
            ["sudo", "tee", str(svc_file)],
            input=new_content.encode(),
            capture_output=True
        )
        if tee.returncode != 0:
            return {"error": f"Failed to write service file: {tee.stderr.decode()}"}
        subprocess.run(["sudo", "systemctl", "daemon-reload"], check=True)
        _log_action(user, "startup_params_update", "", json.dumps(updates), srv_data_dir(request))
        return {"message": "Startup parameters updated. Restart server to apply.", "execstart": new_line}
    except Exception as e:
        return {"error": str(e)}

# === IP REPUTATION ===

@app.get("/api/admin/ip-reputation/{encoded_ip}")
async def get_ip_reputation(encoded_ip: str, request: Request):
    denied = require_permission(request, "bans.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    ip = encoded_ip.replace('_', '.')
    try:
        ipaddress.ip_address(ip)
    except:
        return {"error": "Invalid IP"}

    # Check cache first
    with _player_db_lock:
        conn = _get_player_db_conn(data_dir)
        try:
            row = conn.execute("SELECT * FROM ip_reputation WHERE ip=?", (ip,)).fetchone()
            if row:
                cached = dict(row)
                # Cache valid for 24h
                checked = datetime.fromisoformat(cached['checked_at']) if cached.get('checked_at') else None
                if checked and (datetime.utcnow() - checked).total_seconds() < 86400:
                    cached['cached'] = True
                    return cached
        finally:
            conn.close()

    # Try IPQS if API key configured
    settings = load_settings(data_dir)
    ipqs_key = settings.get("ipqs_api_key", "")

    if not ipqs_key:
        return {"ip": ip, "error": "No IPQS API key configured. Add ipqs_api_key to panel settings."}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://www.ipqualityscore.com/api/json/ip/{ipqs_key}/{ip}",
                params={"strictness": 1}
            )
            data = r.json()
            if not data.get("success"):
                return {"ip": ip, "error": data.get("message", "IPQS check failed")}

            result = {
                "ip": ip,
                "fraud_score": data.get("fraud_score", 0),
                "is_vpn": int(data.get("vpn", False)),
                "is_proxy": int(data.get("proxy", False)),
                "is_tor": int(data.get("tor", False)),
                "isp": data.get("isp", ""),
                "country_code": data.get("country_code", ""),
                "connection_type": data.get("connection_type", ""),
                "checked_at": datetime.utcnow().isoformat(),
                "cached": False
            }
            with _player_db_lock:
                conn = _get_player_db_conn(data_dir)
                try:
                    conn.execute("""
                        INSERT OR REPLACE INTO ip_reputation
                        (ip,fraud_score,is_vpn,is_proxy,is_tor,isp,country_code,connection_type,checked_at)
                        VALUES (?,?,?,?,?,?,?,?,?)
                    """, (ip, result['fraud_score'], result['is_vpn'], result['is_proxy'],
                          result['is_tor'], result['isp'], result['country_code'],
                          result['connection_type'], result['checked_at']))
                    conn.commit()
                finally:
                    conn.close()
            return result
    except Exception as e:
        return {"ip": ip, "error": str(e)}

# === PANEL USER IP VISIBILITY ===

@app.get("/api/users/settings")
async def get_user_settings(request: Request):
    data_dir = srv_data_dir(request)
    user_obj = current_user(request)
    username = user_obj.get("username", "")
    if not username:
        return {"error": "Not authenticated"}
    data = load_panel_users(data_dir)
    u = next((x for x in data["users"] if x["username"] == username), None)
    if not u:
        return {"error": "User not found"}
    return {"ip_visible": u.get("ip_visible", True), "username": username}

@app.put("/api/users/settings")
async def update_user_settings(request: Request):
    data_dir = srv_data_dir(request)
    user_obj = current_user(request)
    username = user_obj.get("username", "")
    if not username:
        return {"error": "Not authenticated"}
    body = await request.json()
    data = load_panel_users(data_dir)
    users = data.get("users", [])
    updated = False
    for u in users:
        if u["username"] == username:
            if "ip_visible" in body:
                u["ip_visible"] = bool(body["ip_visible"])
            updated = True
            break
    if not updated:
        return {"error": "User not found"}
    save_panel_users(data, data_dir)
    return {"message": "Settings saved"}

@app.put("/api/users/{username}/settings")
async def update_other_user_settings(username: str, request: Request):
    """Owner-only: set ip_visible for any user."""
    user = current_user(request)
    role = user.get("role", "viewer")
    if role != "owner":
        return {"error": "Owner only"}
    data_dir = srv_data_dir(request)
    body = await request.json()
    data = load_panel_users(data_dir)
    users = data.get("users", [])
    for u in users:
        if u["username"] == username:
            if "ip_visible" in body:
                u["ip_visible"] = bool(body["ip_visible"])
            save_panel_users(data, data_dir)
            return {"message": "Saved"}
    return {"error": "User not found"}

@app.get("/api/users/profile")
async def get_own_profile(request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    data_dir = srv_data_dir(request)
    profiles = load_user_profiles(data_dir)
    p = profiles.get(username, {})
    panel_data = load_panel_users(data_dir)
    panel_user = next((u for u in panel_data["users"] if u["username"] == username), {})
    return {
        "display_name": p.get("display_name", ""),
        "default_tab": p.get("default_tab", "dashboard"),
        "avatar_ext": p.get("avatar_ext", ""),
        "bg_ext": p.get("bg_ext", ""),
        "preferences": p.get("preferences", {
            "theme": "", "text_size": "", "custom_accent": None,
            "bg_type": "none", "custom_bg_color": None
        }),
        "panel_defaults": p.get("panel_defaults", {"order": [], "hidden": []}),
        "discord_id": panel_user.get("discord_id", ""),
        "discord_username": panel_user.get("discord_username", ""),
        "created": panel_user.get("created", ""),
    }

@app.put("/api/users/profile")
async def update_own_profile(request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    body = await request.json()
    data_dir = srv_data_dir(request)
    profiles = load_user_profiles(data_dir)
    if username not in profiles:
        profiles[username] = {}
    p = profiles[username]
    if "display_name" in body:
        p["display_name"] = str(body["display_name"])[:32]
    VALID_TABS = {"dashboard", "console", "admin", "mods", "config", "startup", "stats", "aigm"}
    if "default_tab" in body and body["default_tab"] in VALID_TABS:
        p["default_tab"] = body["default_tab"]
    if "preferences" in body and isinstance(body["preferences"], dict):
        if "preferences" not in p:
            p["preferences"] = {}
        for key in ("theme", "text_size", "custom_accent", "bg_type", "custom_bg_color"):
            if key in body["preferences"]:
                p["preferences"][key] = body["preferences"][key]
    if "panel_defaults" in body and isinstance(body["panel_defaults"], dict):
        pd = body["panel_defaults"]
        if isinstance(pd.get("order"), list) and isinstance(pd.get("hidden"), list):
            p["panel_defaults"] = {"order": [str(x) for x in pd["order"][:20]], "hidden": [str(x) for x in pd["hidden"][:20]]}
    save_user_profiles(profiles, data_dir)
    return {"message": "Profile saved"}

@app.post("/api/users/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...)):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        return JSONResponse({"error": "Only jpg, png, webp allowed"}, status_code=400)
    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        return JSONResponse({"error": "File too large (max 10MB)"}, status_code=400)
    data_dir = srv_data_dir(request)
    avatars_dir = data_dir / "avatars"
    avatars_dir.mkdir(exist_ok=True)
    ext = IMAGE_EXTENSIONS[file.content_type]
    for _ext in ("jpg", "png", "webp"):
        _old = avatars_dir / f"{username}.{_ext}"
        if _old.exists():
            _old.unlink()
    (avatars_dir / f"{username}.{ext}").write_bytes(content)
    profiles = load_user_profiles(data_dir)
    if username not in profiles:
        profiles[username] = {}
    profiles[username]["avatar_ext"] = ext
    save_user_profiles(profiles, data_dir)
    return {"message": "Avatar uploaded", "ext": ext}

@app.delete("/api/users/avatar")
async def delete_avatar(request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    data_dir = srv_data_dir(request)
    avatars_dir = data_dir / "avatars"
    if avatars_dir.exists():
        for _ext in ("jpg", "png", "webp"):
            _old = avatars_dir / f"{username}.{_ext}"
            if _old.exists():
                _old.unlink()
    profiles = load_user_profiles(data_dir)
    if username in profiles:
        profiles[username]["avatar_ext"] = ""
        save_user_profiles(profiles, data_dir)
    return {"message": "Avatar removed"}

@app.get("/api/users/{username}/avatar")
async def serve_avatar(username: str, request: Request):
    data_dir = srv_data_dir(request)
    avatars_dir = data_dir / "avatars"
    for ext in ("jpg", "png", "webp"):
        p = avatars_dir / f"{username}.{ext}"
        if not p.resolve().is_relative_to(avatars_dir.resolve()):
            continue
        if p.exists():
            media = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ext]
            return FileResponse(str(p), media_type=media, headers={"Cache-Control": "no-cache"})
    return JSONResponse({"error": "No avatar"}, status_code=404)

@app.post("/api/users/background")
async def upload_background(request: Request, file: UploadFile = File(...)):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        return JSONResponse({"error": "Only jpg, png, webp allowed"}, status_code=400)
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        return JSONResponse({"error": "File too large (max 5MB)"}, status_code=400)
    data_dir = srv_data_dir(request)
    bg_dir = data_dir / "backgrounds"
    bg_dir.mkdir(exist_ok=True)
    ext = IMAGE_EXTENSIONS[file.content_type]
    for _ext in ("jpg", "png", "webp"):
        _old = bg_dir / f"{username}.{_ext}"
        if _old.exists():
            _old.unlink()
    (bg_dir / f"{username}.{ext}").write_bytes(content)
    profiles = load_user_profiles(data_dir)
    if username not in profiles:
        profiles[username] = {}
    profiles[username]["bg_ext"] = ext
    save_user_profiles(profiles, data_dir)
    return {"message": "Background uploaded", "ext": ext}

@app.delete("/api/users/background")
async def delete_background(request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    data_dir = srv_data_dir(request)
    bg_dir = data_dir / "backgrounds"
    if bg_dir.exists():
        for _ext in ("jpg", "png", "webp"):
            _old = bg_dir / f"{username}.{_ext}"
            if _old.exists():
                _old.unlink()
    profiles = load_user_profiles(data_dir)
    if username in profiles:
        profiles[username]["bg_ext"] = ""
        save_user_profiles(profiles, data_dir)
    return {"message": "Background removed"}

@app.get("/api/users/{username}/background")
async def serve_background(username: str, request: Request):
    data_dir = srv_data_dir(request)
    bg_dir = data_dir / "backgrounds"
    for ext in ("jpg", "png", "webp"):
        p = bg_dir / f"{username}.{ext}"
        if not p.resolve().is_relative_to(bg_dir.resolve()):
            continue
        if p.exists():
            media = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ext]
            return FileResponse(str(p), media_type=media, headers={"Cache-Control": "no-cache"})
    return JSONResponse({"error": "No background"}, status_code=404)

@app.put("/api/users/password")
async def change_own_password(request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    body = await request.json()
    current_pw = body.get("current_password", "")
    new_pw = body.get("new_password", "")
    if not current_pw or not new_pw:
        return JSONResponse({"error": "current_password and new_password required"}, status_code=400)
    if len(new_pw) < 8:
        return JSONResponse({"error": "New password must be at least 8 characters"}, status_code=400)
    data_dir = srv_data_dir(request)
    data = load_panel_users(data_dir)
    u = next((x for x in data["users"] if x["username"] == username), None)
    if not u:
        return JSONResponse({"error": "User not found"}, status_code=404)
    if not verify_password(current_pw, u["password_hash"]):
        return JSONResponse({"error": "Current password is incorrect"}, status_code=400)
    u["password_hash"] = hash_password(new_pw)
    u["tokens_valid_after"] = int(time.time())
    save_panel_users(data, data_dir)
    # Revoke all sessions except the current one so the user stays logged in
    current_refresh = request.cookies.get("sitrep-refresh", "")
    with _refresh_tokens_lock:
        rdata = load_refresh_tokens()
        rdata["tokens"] = [
            t for t in rdata["tokens"]
            if t["username"] != username or t["id"] == current_refresh
        ]
        save_refresh_tokens(rdata)
    return {"message": "Password changed"}

@app.get("/api/users/sessions")
async def list_sessions(request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    current_refresh = request.cookies.get("sitrep-refresh", "")
    with _refresh_tokens_lock:
        data = load_refresh_tokens()
        now = int(time.time())
        user_tokens = [t for t in data["tokens"] if t["username"] == username and t["expires_at"] > now]
    sessions = []
    for t in user_tokens:
        sessions.append({
            "sid": _session_sid(t["id"]),
            "created_at": t.get("created_at", t["expires_at"] - 2592000),
            "expires_at": t["expires_at"],
            "is_current": t["id"] == current_refresh,
            "remember": t.get("remember", True),
            "device": _device_type(t.get("user_agent", "")),
        })
    sessions.sort(key=lambda s: (not s["is_current"], -s["created_at"]))
    return {"sessions": sessions}

@app.delete("/api/users/sessions/{sid}")
async def revoke_session(sid: str, request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    current_refresh = request.cookies.get("sitrep-refresh", "")
    with _refresh_tokens_lock:
        data = load_refresh_tokens()
        now = int(time.time())
        target = next(
            (t for t in data["tokens"]
             if t["username"] == username and _session_sid(t["id"]) == sid and t["expires_at"] > now),
            None
        )
        if not target:
            return JSONResponse({"error": "Session not found"}, status_code=404)
        if target["id"] == current_refresh:
            return JSONResponse({"error": "Use logout to end the current session"}, status_code=400)
        data["tokens"] = [t for t in data["tokens"] if t["id"] != target["id"]]
        save_refresh_tokens(data)
    return {"message": "Session revoked"}

@app.delete("/api/users/sessions")
async def revoke_all_other_sessions(request: Request):
    user = current_user(request)
    username = user.get("username", "")
    if not username or username == "unknown":
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    current_refresh = request.cookies.get("sitrep-refresh", "")
    with _refresh_tokens_lock:
        data = load_refresh_tokens()
        before = sum(1 for t in data["tokens"] if t["username"] == username)
        data["tokens"] = [
            t for t in data["tokens"]
            if t["username"] != username or t["id"] == current_refresh
        ]
        after = sum(1 for t in data["tokens"] if t["username"] == username)
        save_refresh_tokens(data)
    return {"message": f"Revoked {before - after} session(s)"}

# === RCON / NETWORK / WEBHOOKS / CRONTAB / WS / AIGM ===

_rcon_status_cache: dict = {}  # key: (addr, port) -> {result, ts}
_RCON_STATUS_TTL = 30  # seconds between actual RCON probes

@app.get("/api/rcon/status")
async def rcon_status(request: Request):
    config = read_config(srv_config_path(request)); rcon = config.get("rcon",{}); port = rcon.get("port",0)
    addr = rcon.get("address","127.0.0.1") or "127.0.0.1"
    pw = rcon.get("password","")
    reachable = False
    detail = None
    if port and pw:
        cache_key = (addr, int(port))
        cached = _rcon_status_cache.get(cache_key)
        if cached and (time.time() - cached["ts"]) < _RCON_STATUS_TTL:
            return cached["result"]
        try:
            # BattlEye RCON is UDP — attempt login; empty command returns "OK" on success
            resp = await asyncio.get_running_loop().run_in_executor(None, _rcon_exec, addr, int(port), pw, "")
            if resp == "OK":
                reachable = True
            else:
                detail = resp  # e.g. "AUTH_ERROR:Wrong password" or "AUTH_ERROR:No login ack"
        except Exception as e:
            detail = str(e)
        result = {"status": "reachable" if reachable else "unreachable", "port": port, "address": addr, "detail": detail}
        _rcon_status_cache[cache_key] = {"result": result, "ts": time.time()}
        return result
    elif not pw:
        detail = "No RCON password configured"
    return {"status": "reachable" if reachable else "unreachable", "port": port, "address": addr, "detail": detail}

def _be_packet(ptype: int, payload: bytes, seq: int = None) -> bytes:
    """Build a BattlEye RCON UDP packet."""
    inner = bytes([0xFF, ptype])
    if seq is not None:
        inner += bytes([seq])
    inner += payload
    crc = zlib.crc32(inner) & 0xFFFFFFFF
    return b'BE' + struct.pack('<I', crc) + inner

def _rcon_exec(host: str, port: int, password: str, command: str, timeout: float = 5.0) -> str:
    """
    BattlEye RCON over UDP for Arma Reforger.
    Packet: 'BE' + CRC32(4B LE) + 0xFF + type + [seq] + payload
      type 0x00 = login / login-response
      type 0x01 = command / command-response
      type 0x02 = server keepalive/message (ack with seq byte)
    """
    connect_host = "127.0.0.1" if host in ("0.0.0.0", "") else host
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(2.0)
    try:
        addr = (connect_host, int(port))

        def recv_pkt():
            """Return (ptype, payload) or None on timeout."""
            try:
                data, _ = s.recvfrom(4096)
                if len(data) < 8 or data[:2] != b'BE':
                    return None
                ptype   = data[7] if len(data) > 7 else -1
                payload = data[8:]
                return ptype, payload
            except socket.timeout:
                return None

        # --- Login ---
        s.sendto(_be_packet(0x00, password.encode()), addr)
        logged_in = False
        deadline = time.time() + 3.0
        while time.time() < deadline:
            r = recv_pkt()
            if r is None:
                break
            ptype, payload = r
            if ptype == 0x00:          # login ack
                if payload and payload[0] == 1:
                    logged_in = True
                    break
                else:
                    return "AUTH_ERROR:Wrong password"
            elif ptype == 0x02:        # server message during login — ack and keep waiting
                seq = payload[0] if payload else 0
                s.sendto(_be_packet(0x02, b'', seq=seq), addr)

        if not logged_in:
            return "AUTH_ERROR:No login ack (server may be loading)"
        if not command:
            return "OK"

        # --- Command ---
        s.sendto(_be_packet(0x01, command.encode(), seq=0), addr)
        parts = {}
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = recv_pkt()
            if r is None:
                break
            ptype, payload = r
            if ptype == 0x02:          # server message — ack, ignore
                seq = payload[0] if payload else 0
                s.sendto(_be_packet(0x02, b'', seq=seq), addr)
                continue
            if ptype == 0x01:          # command response
                if not payload:
                    break
                seq_byte = payload[0:1]
                rest = payload[1:]
                # Multi-part: 0x00 + total + index + data
                if rest and rest[0:1] == b'\x00' and len(rest) >= 3:
                    total = rest[1]
                    idx   = rest[2]
                    parts[idx] = rest[3:]
                    if len(parts) >= total:
                        break
                else:
                    parts[0] = rest
                    break
        return b''.join(v for _, v in sorted(parts.items())).decode('utf-8', errors='replace').strip() or "OK"
    finally:
        try: s.close()
        except: pass

def _rcon_cfg(config_path: Path = CONFIG_PATH):
    cfg = read_config(config_path).get("rcon", {})
    return cfg.get("address", "127.0.0.1") or "127.0.0.1", cfg.get("port"), cfg.get("password", "")

@app.post("/api/rcon/command")
async def rcon_command(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    body = await request.json(); cmd = body.get("command", "").strip()
    if not cmd: return {"error": "No command"}
    host, port, pw = _rcon_cfg(srv_config_path(request))
    if not port: return {"error": "RCON port not set in config.json"}
    if not pw: return {"error": "RCON password not set in config.json"}
    try:
        resp = await asyncio.get_running_loop().run_in_executor(None, _rcon_exec, host, port, pw, cmd)
        if resp.startswith("AUTH_ERROR:"): return {"error": resp[11:]}
        return {"response": resp, "command": cmd}
    except Exception as e: return {"error": str(e)}

@app.get("/api/rcon/players")
async def rcon_players_live(request: Request):
    denied = require_permission(request, "server.status")
    if denied: return denied
    host, port, pw = _rcon_cfg(srv_config_path(request))
    if not port: return {"error": "RCON not configured", "players": []}
    try:
        resp = await asyncio.get_running_loop().run_in_executor(None, _rcon_exec, host, port, pw, "#players")
        if resp.startswith("AUTH_ERROR:"): return {"error": resp[11:], "players": []}
        players = [l.strip() for l in resp.split("\n") if l.strip() and not l.startswith("#")]
        return {"raw": resp, "players": players}
    except Exception as e: return {"error": str(e), "players": []}

@app.post("/api/admins/ban-kick")
async def ban_and_kick(request: Request):
    """Write SAT ban + RCON kick so the ban takes effect immediately."""
    denied = require_permission(request, "bans.write")
    if denied: return denied
    profile_dir = srv_profile_dir(request)
    body = await request.json()
    guid = body.get("guid", "").strip()
    reason = body.get("reason", "Banned").strip()
    if not guid: return {"error": "GUID required"}
    # Write to SAT config
    sat_path = profile_dir / "profile" / "ServerAdminTools_Config.json"
    if sat_path.exists():
        try:
            sat = json.loads(sat_path.read_text())
            sat.setdefault("bans", {})[guid] = reason
            shutil.copy2(sat_path, str(sat_path) + ".bak")
            sat_path.write_text(json.dumps(sat, indent=2))
        except Exception as e:
            return {"error": f"SAT write failed: {e}"}
    # RCON kick (best-effort)
    host, port, pw = _rcon_cfg(srv_config_path(request))
    rcon_result = "RCON not configured"
    if port and pw:
        try:
            rcon_result = await asyncio.get_running_loop().run_in_executor(
                None, _rcon_exec, host, port, pw, f"#kick {guid}"
            )
        except Exception as e:
            rcon_result = f"RCON error: {e}"
    return {"message": f"Banned {guid}", "rcon": rcon_result}

@app.get("/api/network")
async def network():
    return get_network_stats()

@app.get("/api/webhooks")
async def get_webhooks(request: Request):
    return load_webhooks(srv_data_dir(request))

@app.put("/api/webhooks")
async def put_webhooks(request: Request):
    denied = require_permission(request, "webhooks.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    try: save_webhooks(await request.json(), data_dir); return {"message": "Saved"}
    except Exception as e: return {"error": str(e)}

@app.post("/api/webhooks/test")
async def test_webhook(request: Request):
    denied = require_permission(request, "webhooks.write")
    if denied: return denied
    import socket as _socket
    from urllib.parse import urlparse as _urlparse
    body = await request.json(); url = body.get("url","")
    if not url: return {"error": "No URL"}
    try:
        p = _urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname:
            return JSONResponse({"error": "Invalid URL"}, status_code=400)
        resolved = ipaddress.ip_address(_socket.gethostbyname(p.hostname))
        if resolved.is_private or resolved.is_loopback or resolved.is_link_local:
            return JSONResponse({"error": "URL resolves to a private address"}, status_code=400)
    except Exception:
        return JSONResponse({"error": "Invalid or unresolvable URL"}, status_code=400)
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(url, json={"embeds":[{"title":"SITREP Test",
                "description":"Webhook connected!","color":0x69f0ae,
                "timestamp":datetime.utcnow().isoformat(),"footer":{"text":"SITREP"}}]})
            return {"message":"Sent!"} if r.status_code in (200,204) else {"error":f"Discord: {r.status_code}"}
    except Exception as e: return {"error": str(e)}

@app.get("/api/crontab")
async def get_crontab(request: Request):
    denied = require_permission(request, "crontab.write")
    if denied: return denied
    try:
        r = await asyncio.to_thread(subprocess.run, ["crontab","-l"], capture_output=True, text=True, timeout=5)
        if r.returncode != 0: return {"jobs":[], "raw":""}
        raw = r.stdout; jobs = []
        for line in raw.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("#"): continue
            parts = line.split(None, 5)
            if len(parts) >= 6:
                cron = " ".join(parts[:5]); cmd = parts[5]; comment = ""
                if "#" in cmd: cmd, comment = cmd.rsplit("#",1); cmd = cmd.strip(); comment = comment.strip()
                jobs.append({"cron":cron,"command":cmd,"comment":comment,"enabled":True,"raw":line})
        return {"jobs": jobs, "raw": raw}
    except Exception as e: return {"error": str(e)}

@app.post("/api/crontab/add")
async def add_crontab(request: Request):
    denied = require_permission(request, "crontab.write")
    if denied: return denied
    body = await request.json()
    cron = body.get("cron",""); command = body.get("command",""); comment = body.get("comment","")
    if not cron or not command: return {"error": "cron and command required"}
    _bad = {'\n', '\r', '\x00'}
    if any(c in s for c in _bad for s in (cron, command, comment)):
        return JSONResponse({"error": "Invalid characters in cron fields"}, status_code=400)
    line = f"{cron} {command}"
    if comment: line += f"  # {comment}"
    try:
        r = await asyncio.to_thread(subprocess.run, ["crontab","-l"], capture_output=True, text=True, timeout=5)
        existing = r.stdout if r.returncode == 0 else ""
        new_ct = existing.rstrip() + "\n" + line + "\n"
        p = await asyncio.to_thread(subprocess.run, ["crontab","-"], input=new_ct, capture_output=True, text=True, timeout=5)
        if p.returncode != 0: return {"error": p.stderr}
        return {"message": f"Added: {line}"}
    except Exception as e: return {"error": str(e)}

@app.post("/api/crontab/remove")
async def remove_crontab(request: Request):
    denied = require_permission(request, "crontab.write")
    if denied: return denied
    body = await request.json(); raw_line = body.get("raw","").strip()
    if not raw_line: return {"error": "raw line required"}
    try:
        r = await asyncio.to_thread(subprocess.run, ["crontab","-l"], capture_output=True, text=True, timeout=5)
        if r.returncode != 0: return {"error": "No crontab"}
        lines = r.stdout.strip().split("\n")
        new_lines = [l for l in lines if l.strip() != raw_line]
        p = await asyncio.to_thread(subprocess.run, ["crontab","-"], input="\n".join(new_lines)+"\n", capture_output=True, text=True, timeout=5)
        if p.returncode != 0: return {"error": p.stderr}
        return {"message": "Removed"}
    except Exception as e: return {"error": str(e)}

# === DEPLOYMENTS (saved mod list snapshots) ===

SETTINGS_FILE    = PANEL_DATA / "settings.json"
SETTINGS_DEFAULTS = {
    "uploadCapMbps": 120.0,
    "ipqs_api_key": "",
    "discord_client_id": "",
    "discord_client_secret": "",
    "discord_redirect_uri": f"{PANEL_URL}/api/auth/discord/callback",
    "discord_allow_auto_register": False,
    "frontend_url": PANEL_URL,
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_pass": "",
    "smtp_from": "",
    "smtp_from_name": "SITREP Panel",
    "smtp_use_tls": True,
}

def load_deployments(data_dir: Path = PANEL_DATA) -> list:
    path = data_dir / "deployments.json"
    if path.exists():
        try: return json.loads(path.read_text())
        except: pass
    return []

def save_deployments(deps: list, data_dir: Path = PANEL_DATA):
    path = data_dir / "deployments.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(deps, indent=2))
    tmp.replace(path)

def load_settings(data_dir: Path = PANEL_DATA) -> dict:
    path = data_dir / "settings.json"
    if path.exists():
        try: return {**SETTINGS_DEFAULTS, **json.loads(path.read_text())}
        except: pass
    return dict(SETTINGS_DEFAULTS)

def save_settings(data: dict, data_dir: Path = PANEL_DATA):
    path = data_dir / "settings.json"
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)

@app.get("/api/deployments")
async def get_deployments(request: Request):
    denied = require_role(request, "viewer")
    if denied: return denied
    return load_deployments(srv_data_dir(request))

@app.post("/api/deployments")
async def create_deployment(request: Request):
    denied = require_permission(request, "config.write")
    if denied: return denied
    body = await request.json()
    name = body.get("name", "").strip()
    if not name: return {"error": "Name required"}
    config = read_config(srv_config_path(request))
    mods = config.get("game", {}).get("mods", [])
    dep = {
        "id": secrets.token_hex(8),
        "name": name,
        "description": body.get("description", ""),
        "mods": mods,
        "modCount": len(mods),
        "created": datetime.now().isoformat(),
    }
    data_dir = srv_data_dir(request)
    deps = load_deployments(data_dir)
    deps.append(dep)
    save_deployments(deps, data_dir)
    return dep

@app.delete("/api/deployments/{dep_id}")
async def delete_deployment(dep_id: str, request: Request):
    denied = require_permission(request, "config.write")
    if denied: return denied
    data_dir = srv_data_dir(request)
    deps = load_deployments(data_dir)
    new_deps = [d for d in deps if d["id"] != dep_id]
    if len(new_deps) == len(deps): return {"error": "Not found"}
    save_deployments(new_deps, data_dir)
    return {"message": "Deleted"}

@app.post("/api/deployments/{dep_id}/apply")
async def apply_deployment(dep_id: str, request: Request):
    denied = require_permission(request, "config.write")
    if denied: return denied
    config_path = srv_config_path(request)
    deps = load_deployments(srv_data_dir(request))
    dep = next((d for d in deps if d["id"] == dep_id), None)
    if not dep: return {"error": "Not found"}
    config = read_config(config_path)
    config.setdefault("game", {})["mods"] = dep["mods"]
    write_config(config, config_path)
    return {"message": f"Applied '{dep['name']}' — {len(dep['mods'])} mods"}

@app.get("/api/settings")
async def get_settings_endpoint(request: Request):
    settings = load_settings(srv_data_dir(request))
    if request.state.user.get("role") != "owner":
        settings["discord_client_secret"] = "***"
        settings["ipqs_api_key"] = "***"
        settings["smtp_pass"] = "***" if settings.get("smtp_pass") else ""
    return settings

@app.get("/api/settings/public")
async def get_public_settings():
    s = load_settings(PANEL_DATA)
    return {
        "discord_client_id": s.get("discord_client_id", ""),
        "aigm_enabled": AIGM_BRIDGE_PATH.exists(),
    }

@app.put("/api/settings")
async def put_settings_endpoint(request: Request):
    denied = require_role(request, "head_admin")
    if denied: return denied
    data_dir = srv_data_dir(request)
    body = await request.json()
    current = load_settings(data_dir)
    valid = {k: body[k] for k in SETTINGS_DEFAULTS if k in body}
    # Preserve real secret values when the client submits the masked placeholder.
    # GET returns "***" for secrets to non-owners; a blind PUT round-trip would
    # otherwise wipe the real value.
    for secret_key in ("discord_client_secret", "ipqs_api_key", "smtp_pass"):
        if valid.get(secret_key) == "***":
            valid[secret_key] = current.get(secret_key, "")
    merged = {**current, **valid}
    save_settings(merged, data_dir)
    return {"message": "Saved"}

@app.post("/api/settings/smtp/test")
async def test_smtp_endpoint(request: Request):
    """Owner-only: send a test email to verify SMTP config is working."""
    user = current_user(request)
    if user.get("role") != "owner":
        return JSONResponse({"error": "Owner only"}, status_code=403)
    body = await request.json()
    to_addr = (body.get("to") or "").strip()
    if not to_addr or "@" not in to_addr:
        return JSONResponse({"error": "Valid 'to' email address required"}, status_code=400)
    cfg = _get_smtp_config()
    if not cfg["host"]:
        return JSONResponse({"error": "SMTP not configured. Fill in host + user + pass + from, then save before testing."}, status_code=400)
    subject = "SITREP — SMTP Test"
    text_body = (
        f"This is a test email from your SITREP panel.\n\n"
        f"Host: {cfg['host']}:{cfg['port']}\n"
        f"From: {cfg['from']}\n"
        f"TLS:  {cfg['use_tls']}\n\n"
        f"If you can read this, password reset emails will work."
    )
    html_body = f"""<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
<h2 style="color:#111">SITREP — SMTP Test</h2>
<p>This is a test email from your SITREP panel.</p>
<ul style="color:#444;font-size:13px">
<li>Host: <code>{cfg['host']}:{cfg['port']}</code></li>
<li>From: <code>{cfg['from']}</code></li>
<li>TLS: <code>{cfg['use_tls']}</code></li>
</ul>
<p style="color:#22c55e"><strong>✓ SMTP is working.</strong> Password reset emails will be delivered.</p>
</div>"""
    ok, err = _send_email(to_addr, subject, text_body, html_body)
    if not ok:
        return JSONResponse({"error": f"Send failed: {err}"}, status_code=500)
    return {"message": f"Test email sent to {to_addr}"}

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = ""):
    payload = decode_token(token)
    if not payload or payload.get("role") not in ROLE_ORDER:
        await ws.close(code=4001)
        return
    await ws.accept()
    ws_clients.append(ws)
    try:
        while True:
            await ws.send_json({"event":"heartbeat","data":{"online":is_server_running(get_default_server()["service_name"]),"ts":time.time()}})
            await asyncio.sleep(3)
    except: pass
    finally:
        if ws in ws_clients: ws_clients.remove(ws)

BRIDGE = os.environ.get("AIGM_BRIDGE_URL", "http://127.0.0.1:5555")

@app.post("/api/aigm/chat")
async def aigm_chat(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            return (await c.post(f"{BRIDGE}/api/chat", json=await request.json())).json()
    except Exception as e: return {"error": str(e), "reply": "Bridge not running."}

AIGM_BRIDGE_PATH = Path(os.environ.get("AIGM_BRIDGE_PATH", str(Path.home() / "AIGameMaster" / "AIGameMaster" / "bridge.py")))

@app.get("/api/aigm/status")
async def aigm_status(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    if not AIGM_BRIDGE_PATH.exists():
        return {"enabled": False, "status": "not-configured", "bridge_path": str(AIGM_BRIDGE_PATH)}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            data = (await c.get(f"{BRIDGE}/api/status")).json()
            if isinstance(data, dict):
                data.setdefault("enabled", True)
            return data
    except Exception:
        return {"enabled": True, "status": "offline"}

_venv = os.environ.get("AIGM_VENV_PYTHON", "")
AIGM_VENV_PYTHON = Path(_venv) if _venv else None

@app.post("/api/aigm/start")
async def aigm_start(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    # Start via systemctl if managed as a service
    try:
        result = subprocess.run(
            ["sudo", "systemctl", "start", "aigm-bridge"],
            capture_output=True, timeout=10
        )
        if result.returncode == 0:
            return {"message": "Bridge starting..."}
    except Exception:
        pass
    # Fallback: launch directly
    if not AIGM_BRIDGE_PATH.exists():
        return {"error": f"Bridge not found at {AIGM_BRIDGE_PATH}"}
    python = str(AIGM_VENV_PYTHON) if AIGM_VENV_PYTHON and AIGM_VENV_PYTHON.exists() else "python3"
    try:
        subprocess.Popen(
            [python, str(AIGM_BRIDGE_PATH)],
            cwd=str(AIGM_BRIDGE_PATH.parent),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True
        )
        return {"message": "Bridge starting..."}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/aigm/stop")
async def aigm_stop(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    # Unload model from Ollama before stopping bridge so VRAM is freed immediately
    ollama_url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            ps = await c.get(f"{ollama_url}/api/ps")
            for m in ps.json().get("models", []):
                model_name = m.get("name") or m.get("model", "")
                if model_name:
                    await c.post(f"{ollama_url}/api/generate", json={"model": model_name, "keep_alive": 0})
    except Exception:
        pass
    # Stop via systemctl if managed as a service (prevents auto-restart)
    try:
        result = subprocess.run(
            ["sudo", "systemctl", "stop", "aigm-bridge"],
            capture_output=True, timeout=10
        )
        if result.returncode == 0:
            return {"message": "Bridge stopped (systemd service)"}
    except Exception:
        pass
    # Fallback: kill process directly
    import signal as _sig
    killed = 0
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            if "bridge.py" in " ".join(proc.info["cmdline"] or []):
                try:
                    os.killpg(os.getpgid(proc.pid), _sig.SIGKILL)
                except Exception:
                    proc.kill()
                killed += 1
        except: pass
    return {"message": f"Stopped {killed} bridge process(es)" if killed else "No bridge process found"}

@app.get("/api/aigm/bridge-info")
async def aigm_bridge_info(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    return {
        "bridge_path": str(AIGM_BRIDGE_PATH),
        "bridge_exists": AIGM_BRIDGE_PATH.exists(),
    }

@app.get("/api/aigm/decisions")
async def aigm_decisions(request: Request, limit: int = 50):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.get(f"{BRIDGE}/api/decisions", params={"limit": limit})).json()
    except Exception: return []

@app.get("/api/aigm/session-config")
async def aigm_session_config_get(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.get(f"{BRIDGE}/api/session-config")).json()
    except Exception: return {"error": "Bridge offline"}

@app.post("/api/aigm/session-config")
async def aigm_session_config_post(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.post(f"{BRIDGE}/api/session-config", json=await request.json())).json()
    except Exception as e: return {"error": str(e)}

@app.post("/api/aigm/trigger")
async def aigm_trigger(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        body = {}
        try: body = await request.json()
        except: pass
        async with httpx.AsyncClient(timeout=10) as c:
            return (await c.post(f"{BRIDGE}/api/trigger", json=body)).json()
    except Exception as e: return {"error": str(e)}

@app.post("/api/aigm/warmup")
async def aigm_warmup(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=90) as c:
            return (await c.post(f"{BRIDGE}/api/warmup")).json()
    except Exception as e: return {"error": str(e)}

@app.post("/api/aigm/mission")
async def aigm_mission(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.post(f"{BRIDGE}/api/mission", json=await request.json())).json()
    except Exception as e: return {"error": str(e)}

@app.delete("/api/aigm/mission")
async def aigm_mission_clear(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.delete(f"{BRIDGE}/api/mission")).json()
    except Exception as e: return {"error": str(e)}

@app.post("/api/aigm/config")
async def aigm_config(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.post(f"{BRIDGE}/api/config", json=await request.json())).json()
    except Exception as e: return {"error": str(e)}

@app.post("/api/aigm/admin")
async def aigm_admin(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            return (await c.post(f"{BRIDGE}/api/admin", json=await request.json())).json()
    except Exception as e: return {"error": str(e)}

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")

@app.get("/api/aigm/model/status")
async def aigm_model_status(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{OLLAMA_URL}/api/ps")
            data = r.json()
            models = data.get("models", [])
            return {"loaded": models, "count": len(models)}
    except Exception:
        return {"loaded": [], "count": 0, "error": "Ollama not reachable"}

@app.get("/api/aigm/model/list")
async def aigm_model_list(request: Request):
    """Return all models installed in Ollama, sorted by size descending."""
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
            models = r.json().get("models", [])
            return {"models": sorted(models, key=lambda m: m.get("size", 0), reverse=True)}
    except Exception:
        return {"models": [], "error": "Ollama not reachable"}

@app.post("/api/aigm/model/unload")
async def aigm_model_unload(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        body = await request.json()
    except Exception:
        body = {}
    model_name = body.get("model", "")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            # First get loaded models if no name specified
            if not model_name:
                ps = await c.get(f"{OLLAMA_URL}/api/ps")
                loaded = ps.json().get("models", [])
                if not loaded:
                    return {"status": "nothing_loaded", "message": "No models currently loaded"}
                model_name = loaded[0].get("name", loaded[0].get("model", ""))
            if not model_name:
                return {"error": "Could not determine model name"}
            # Unload by setting keep_alive=0
            r = await c.post(f"{OLLAMA_URL}/api/generate",
                json={"model": model_name, "keep_alive": 0})
            return {"status": "unloaded", "model": model_name}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/aigm/model-config")
async def aigm_model_config_get(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{BRIDGE}/api/model-config")
            return r.json()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/aigm/model-config")
async def aigm_model_config_post(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        body = await request.json()
    except Exception:
        body = {}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(f"{BRIDGE}/api/model-config", json=body)
            return r.json()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/aigm/opord/save")
async def aigm_opord_save(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        opord = await request.json()
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{BRIDGE}/api/aigm/opord", json={"opord": opord})
            return r.json()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/aigm/opord/parse")
async def aigm_opord_parse(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        opord = await request.json()
        async with httpx.AsyncClient(timeout=120) as c:
            await c.post(f"{BRIDGE}/api/aigm/opord", json={"opord": opord})
            r = await c.post(f"{BRIDGE}/api/aigm/opord/parse", json={})
            return r.json()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/aigm/opord/load")
async def aigm_opord_load(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    return {"status": "loaded"}

@app.post("/api/aigm/operation/advance")
async def aigm_operation_advance(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(f"{BRIDGE}/api/aigm/operation/advance", json={})
            return r.json()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/aigm/operation/abort")
async def aigm_operation_abort(request: Request):
    denied = require_permission(request, "server.control")
    if denied: return denied
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(f"{BRIDGE}/api/aigm/operation/abort", json={})
            return r.json()
    except Exception as e:
        return {"error": str(e)}

# === WORKSHOP PROXY ===

_ws_build_id: str = ""
_ws_build_id_ts: float = 0
_ws_cache: dict = {}
_WS_CACHE_TTL = 300   # 5 min
_WS_BUILD_TTL = 3600  # 1 hour

# Mod index for real tag filtering
_ws_index: list = []
_ws_index_state: dict = {"status": "idle", "count": 0, "built_at": None}
_ws_index_lock = asyncio.Lock()
_WS_INDEX_PATH = Path(os.environ.get("WS_INDEX_PATH", "/opt/panel/backend/ws_index.json"))

def _load_ws_index():
    global _ws_index, _ws_index_state
    if not _WS_INDEX_PATH.exists(): return
    try:
        data = json.loads(_WS_INDEX_PATH.read_text())
        _ws_index = data.get("mods", [])
        _ws_index_state = {"status": "ready" if _ws_index else "idle", "count": len(_ws_index), "built_at": data.get("built_at")}
    except: pass

_load_ws_index()

async def _build_ws_index_bg():
    global _ws_index, _ws_index_state
    if _ws_index_state["status"] == "building": return
    _ws_index_state = {"status": "building", "count": 0, "built_at": None}
    all_mods: dict = {}
    sem = asyncio.Semaphore(5)
    try:
        build_id = await _get_build_id()
        base_url = f"https://reforger.armaplatform.com/_next/data/{build_id}/workshop.json"
        async def fetch_page(sort, page):
            async with sem:
                try:
                    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
                        r = await c.get(base_url, params={"page": page, "sort": sort})
                        r.raise_for_status()
                        raw = r.json()
                    pp = raw.get("pageProps", raw.get("props", {}).get("pageProps", {}))
                    return [_simplify_mod(m) for m in pp.get("assets", {}).get("rows", [])]
                except: return []
        tasks = (
            [fetch_page("downloads", p) for p in range(1, 151)] +
            [fetch_page("newest", p) for p in range(1, 51)]
        )
        results = await asyncio.gather(*tasks)
        for batch in results:
            for mod in batch:
                if mod.get("id") and mod["id"] not in all_mods:
                    all_mods[mod["id"]] = mod
                    _ws_index_state["count"] = len(all_mods)
        _ws_index = list(all_mods.values())
        built_at = time.time()
        _ws_index_state = {"status": "ready", "count": len(_ws_index), "built_at": built_at}
        try:
            _WS_INDEX_PATH.write_text(json.dumps({"mods": _ws_index, "built_at": built_at}))
        except: pass
    except Exception as e:
        _ws_index_state = {"status": "error", "count": len(_ws_index), "built_at": None, "error": str(e)}

async def _get_build_id() -> str:
    global _ws_build_id, _ws_build_id_ts
    if _ws_build_id and time.time() - _ws_build_id_ts < _WS_BUILD_TTL:
        return _ws_build_id
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
            r = await c.get("https://reforger.armaplatform.com/workshop")
            m = re.search(r'"buildId":"([^"]+)"', r.text)
            if m:
                _ws_build_id = m.group(1)
                _ws_build_id_ts = time.time()
                return _ws_build_id
    except: pass
    return _ws_build_id or "8cIQrfsP0mdy2y8uLb1ix"

def _ws_cache_get(key: str):
    e = _ws_cache.get(key)
    if e and time.time() - e["ts"] < _WS_CACHE_TTL:
        return e["data"]
    _ws_cache.pop(key, None)
    return None

def _ws_cache_set(key: str, data):
    _ws_cache[key] = {"data": data, "ts": time.time()}

def _simplify_mod(mod: dict) -> dict:
    image = None
    for preview in mod.get("previews", []):
        thumbs = (preview.get("thumbnails") or {}).get("image/jpeg", [])
        if thumbs:
            mid = sorted(thumbs, key=lambda t: t.get("width", 9999))[len(thumbs)//2]
            image = mid.get("url")
        if not image:
            image = preview.get("url")
        break
    return {
        "id": mod.get("id"),
        "name": mod.get("name"),
        "summary": mod.get("summary", ""),
        "author": mod.get("author", {}).get("username", ""),
        "version": mod.get("currentVersionNumber", ""),
        "subscribers": mod.get("subscriberCount", 0),
        "rating": round((mod.get("averageRating") or 0) * 5, 1),
        "ratingCount": mod.get("ratingCount", 0),
        "image": image,
        "size": mod.get("currentVersionSize", 0),
        "tags": [t["name"] for t in mod.get("tags", []) if t.get("name")],
        "updatedAt": mod.get("updatedAt", ""),
    }

@app.get("/api/workshop/index/status")
async def workshop_index_status():
    stale = bool(_ws_index_state.get("built_at") and time.time() - _ws_index_state["built_at"] > 86400)
    return {**_ws_index_state, "stale": stale}

@app.post("/api/workshop/index/build")
async def workshop_index_build(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    async with _ws_index_lock:
        if _ws_index_state["status"] == "building":
            return {"message": "Already building", "status": "building"}
        _ws_index_state["status"] = "building"
    asyncio.create_task(_build_ws_index_bg())
    return {"message": "Index build started", "status": "building"}

@app.get("/api/workshop/search")
async def workshop_search(request: Request, q: str = "", page: int = 1, sort: str = "downloads", tags: str = ""):
    if not hasattr(request.state, 'user') or not request.state.user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    page = max(1, page)

    # Tag filtering: use local index for real cross-page results
    if tags:
        tag_list = [t.strip() for t in tags.split(',') if t.strip()]
        if tag_list:
            if _ws_index_state["status"] == "idle":
                asyncio.create_task(_build_ws_index_bg())
            if _ws_index:
                def tag_match(mod):
                    mod_tags = [t.lower() for t in mod.get("tags", [])]
                    return any(any(ft.lower() in mt or mt in ft.lower() for mt in mod_tags) for ft in tag_list)
                filtered = [m for m in _ws_index if tag_match(m)]
                if q:
                    ql = q.lower()
                    filtered = [m for m in filtered if ql in (m.get("name") or "").lower() or ql in (m.get("author") or "").lower()]
                if sort == "newest":
                    filtered.sort(key=lambda m: m.get("updatedAt", ""), reverse=True)
                elif sort == "popular":
                    filtered.sort(key=lambda m: m.get("rating", 0), reverse=True)
                else:
                    filtered.sort(key=lambda m: m.get("subscribers", 0), reverse=True)
                per_page = 20
                total = len(filtered)
                start = (page - 1) * per_page
                return {"mods": filtered[start:start + per_page], "total": total, "page": page,
                        "pages": max(1, math.ceil(total / per_page)),
                        "from_index": True, "index_count": len(_ws_index), "index_status": _ws_index_state["status"]}
            return {"mods": [], "total": 0, "page": 1, "pages": 1, "from_index": False,
                    "index_status": _ws_index_state["status"], "index_count": 0}

    # No tags: proxy to Bohemia
    cache_key = f"search:{q}:{page}:{sort}"
    cached = _ws_cache_get(cache_key)
    if cached: return cached
    try:
        build_id = await _get_build_id()
        params = {"page": page, "sort": sort}
        if q: params["search"] = q
        url = f"https://reforger.armaplatform.com/_next/data/{build_id}/workshop.json"
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            r = await c.get(url, params=params)
            r.raise_for_status()
            raw = r.json()
        pp = raw.get("pageProps", raw.get("props", {}).get("pageProps", {}))
        assets = pp.get("assets", {})
        rows = assets.get("rows", [])
        total = assets.get("count", 0)
        result = {"mods": [_simplify_mod(m) for m in rows], "total": total, "page": page,
                  "pages": max(1, math.ceil(total / max(1, len(rows)))) if rows else 1}
        _ws_cache_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "mods": [], "total": 0, "page": 1, "pages": 1}

@app.get("/api/workshop/mod/{mod_id}")
async def workshop_mod_detail(request: Request, mod_id: str):
    if not hasattr(request.state, 'user') or not request.state.user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    cache_key = f"mod:{mod_id}"
    cached = _ws_cache_get(cache_key)
    if cached: return cached
    try:
        build_id = await _get_build_id()
        url = f"https://reforger.armaplatform.com/_next/data/{build_id}/workshop/{mod_id}.json"
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            r = await c.get(url)
            r.raise_for_status()
            raw = r.json()
        pp = raw.get("pageProps", raw.get("props", {}).get("pageProps", {}))
        asset = pp.get("asset", {})
        image = None
        for preview in asset.get("previews", []):
            image = preview.get("url"); break
        versions = [
            {"version": v.get("version"), "gameVersion": v.get("gameVersion", ""),
             "size": v.get("totalFileSize", 0), "date": v.get("createdAt", "")}
            for v in asset.get("versions", [])
        ]
        # Extract scenarios — field is 'gameId' per Bohemia API
        raw_scenarios = asset.get("scenarios", [])
        scenarios = []
        for s in (raw_scenarios or []):
            if isinstance(s, dict) and s.get("gameId"):
                thumb = None
                img_obj = s.get("image") or {}
                for t in (img_obj.get("thumbnails") or {}).get("image/jpeg", []):
                    thumb = t.get("url"); break
                scenarios.append({
                    "name": s.get("name", ""),
                    "id": s.get("gameId", ""),
                    "gameMode": s.get("gameMode", ""),
                    "playerCount": s.get("playerCount", 0),
                    "description": s.get("description", ""),
                    "image": img_obj.get("url") or thumb,
                })
        raw_deps = asset.get("dependencies", []) or []
        dependencies = []
        for dep in raw_deps:
            if not isinstance(dep, dict): continue
            # Bohemia API: each entry has a nested "asset" with id/name,
            # plus top-level "version" and "totalFileSize"
            da = dep.get("asset") or dep  # fallback: treat dep itself as the asset
            dep_id   = da.get("id", "")
            dep_name = da.get("name", dep_id)
            dep_ver  = dep.get("version") or dep.get("currentVersionNumber", "")
            dep_size = dep.get("totalFileSize", 0)
            if not dep_id: continue
            dependencies.append({
                "id": dep_id,
                "name": dep_name,
                "version": dep_ver,
                "size": dep_size,
            })
        result = {
            **_simplify_mod(asset),
            "image": image,
            "description": asset.get("description") or asset.get("summary", ""),
            "versions": versions,
            "scenarios": scenarios,
            "dependencies": dependencies,
        }
        _ws_cache_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e)}

# ─── Stats API ────────────────────────────────────────────────────────────────

def _stats_period_filter(period: str):
    """Return (where_clause, params_tuple) for a period filter on kill_events.ts."""
    if period == 'all':
        return ("", ())
    seconds = 7 * 86400 if period == '7d' else 30 * 86400
    since = int(time.time()) - seconds
    return ("AND ts >= ?", (since,))


@app.get("/api/stats/overview")
async def stats_overview(request: Request):
    data_dir = srv_data_dir(request)
    mat_dir = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _sync_kill_events, mat_dir, data_dir)
    await loop.run_in_executor(None, _sync_player_sessions, mat_dir, data_dir)
    await loop.run_in_executor(None, _sync_server_sessions, mat_dir, data_dir)
    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            now = int(time.time())
            since_30d = now - 30 * 86400
            total_kills = conn.execute(
                "SELECT COUNT(*) FROM kill_events WHERE killer_guid NOT IN ('AI','World','')"
            ).fetchone()[0]
            total_deaths = conn.execute(
                "SELECT COUNT(*) FROM kill_events WHERE victim_guid NOT IN ('AI','World','')"
            ).fetchone()[0]
            kd = round(total_kills / total_deaths, 2) if total_deaths else 0
            unique_players = conn.execute(
                "SELECT COUNT(DISTINCT player_name) FROM player_sessions"
            ).fetchone()[0]
            # uptime % over last 30 days
            sess_rows = conn.execute(
                "SELECT start_ts, COALESCE(end_ts,?) as end_ts FROM server_sessions WHERE end_ts IS NULL OR end_ts >= ?",
                (now, since_30d)
            ).fetchall()
            total_up = sum(
                max(0, min(int(r['end_ts']), now) - max(int(r['start_ts']), since_30d))
                for r in sess_rows if int(r['start_ts']) < now
            )
            uptime_pct = round(min(100.0, total_up / (30 * 86400) * 100), 1)
            return {
                "total_kills": total_kills,
                "total_deaths": total_deaths,
                "kd_ratio": kd,
                "uptime_pct_30d": uptime_pct,
                "unique_players": unique_players,
            }
        finally:
            conn.close()


@app.get("/api/stats/feed")
async def stats_feed(request: Request, limit: int = 50):
    data_dir = srv_data_dir(request)
    mat_dir = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME
    await asyncio.get_running_loop().run_in_executor(None, _sync_kill_events, mat_dir, data_dir)
    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            rows = conn.execute(
                "SELECT ts,killer,victim,weapon,distance,friendly_fire,team_kill FROM kill_events ORDER BY ts DESC LIMIT ?",
                (min(limit, 200),)
            ).fetchall()
            return {"events": [dict(r) for r in rows]}
        finally:
            conn.close()


@app.get("/api/stats/leaderboard")
async def stats_leaderboard(request: Request, period: str = "7d"):
    if period not in ('7d', '30d', 'all'):
        return JSONResponse({"error": "Invalid period"}, status_code=400)
    data_dir = srv_data_dir(request)
    mat_dir = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME
    await asyncio.get_running_loop().run_in_executor(None, _sync_kill_events, mat_dir, data_dir)
    where, params = _stats_period_filter(period)
    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            kills_rows = conn.execute(
                f"SELECT killer as name, COUNT(*) as kills FROM kill_events WHERE killer_guid NOT IN ('AI','World','') AND 1=1 {where} GROUP BY killer",
                params
            ).fetchall()
            deaths_rows = conn.execute(
                f"SELECT victim as name, COUNT(*) as deaths FROM kill_events WHERE victim_guid NOT IN ('AI','World','') AND 1=1 {where} GROUP BY victim",
                params
            ).fetchall()
            kills_map = {r['name']: r['kills'] for r in kills_rows}
            deaths_map = {r['name']: r['deaths'] for r in deaths_rows}
            names = sorted(set(kills_map) | set(deaths_map))
            board = []
            for name in names:
                k = kills_map.get(name, 0)
                d = deaths_map.get(name, 0)
                board.append({"name": name, "kills": k, "deaths": d, "kd": round(k / d, 2) if d else None})
            board.sort(key=lambda x: x['kills'], reverse=True)
            return {"leaderboard": board[:50], "period": period}
        finally:
            conn.close()


@app.get("/api/stats/weapons")
async def stats_weapons(request: Request, period: str = "7d"):
    if period not in ('7d', '30d', 'all'):
        return JSONResponse({"error": "Invalid period"}, status_code=400)
    data_dir = srv_data_dir(request)
    mat_dir = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME
    await asyncio.get_running_loop().run_in_executor(None, _sync_kill_events, mat_dir, data_dir)
    where, params = _stats_period_filter(period)
    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            rows = conn.execute(
                f"SELECT weapon, COUNT(*) as kills FROM kill_events WHERE 1=1 {where} GROUP BY weapon ORDER BY kills DESC LIMIT 20",
                params
            ).fetchall()
            total = sum(r['kills'] for r in rows)
            weapons = [{"weapon": r['weapon'], "kills": r['kills'], "pct": round(r['kills'] / total * 100, 1) if total else 0} for r in rows]
            return {"weapons": weapons, "period": period}
        finally:
            conn.close()


@app.get("/api/stats/player-history")
async def stats_player_history(request: Request):
    data_dir = srv_data_dir(request)
    mat_dir = srv_profile_dir(request) / "profile" / MAT_PROFILE_DIR_NAME
    await asyncio.get_running_loop().run_in_executor(None, _sync_player_sessions, mat_dir, data_dir)
    now = int(time.time())
    since = now - 7 * 86400
    with _stats_db_lock:
        conn = _get_stats_db_conn(data_dir)
        try:
            rows = conn.execute(
                "SELECT connect_ts, COALESCE(disconnect_ts,?) as disconnect_ts FROM player_sessions WHERE connect_ts >= ? OR (disconnect_ts IS NULL AND connect_ts < ?)",
                (now, since, now)
            ).fetchall()
        finally:
            conn.close()
    hours = []
    for i in range(7 * 24):
        h_start = since + i * 3600
        h_end = h_start + 3600
        count = sum(1 for r in rows if int(r['connect_ts']) < h_end and int(r['disconnect_ts']) > h_start)
        hours.append({"ts": h_start, "count": count})
    return {"history": hours}


# === TRACKER ENDPOINTS ===

@app.get("/api/tracker/status")
async def tracker_status(request: Request):
    settings = _tracker_load_settings()
    server_running = _tracker_server_running()
    mod_id = _tracker_panel_mod_id(request)
    now = time.time()
    last_rx = 0.0
    snap_count = 0
    evt_count = 0
    with _TRACKER_STATE_LOCK:
        if mod_id:
            last_rx = _TRACKER_LAST_RX.get(mod_id, 0.0)
            snap_count = len(_TRACKER_LATEST_SNAPSHOTS.get(mod_id, {}))
            evt_count = len(_TRACKER_RECENT_EVENTS.get(mod_id, ()))
        # Global "any mod posting recently" check — used by the frontend to
        # surface the Tracker tab even when the current server has no
        # tracker_mod_id configured yet (otherwise the tab is unreachable
        # because you configure the link *inside* the tab).
        any_recent_rx = max(_TRACKER_LAST_RX.values(), default=0.0)
    mod_wired = bool(last_rx > 0 and (now - last_rx) < 90)
    # Gate detected on server_running so stopping the Arma server hides the
    # tab on the next poll instead of waiting ≤90s for _TRACKER_LAST_RX to age
    # out. Stale mod timestamps linger in-memory until the process restarts.
    detected = bool(server_running and any_recent_rx > 0 and (now - any_recent_rx) < 90)
    return {
        "wired_up": server_running and mod_wired,
        "detected": detected,
        "server_running": server_running,
        "configured": bool(mod_id),
        "mod_server_id": mod_id or None,
        "last_rx": last_rx or None,
        "snapshot_count": snap_count,
        "event_count": evt_count,
        "sqlite_enabled": settings["sqlite_enabled"],
        "key_configured": bool(PLAYERTRACKER_API_KEY),
    }

@app.post("/api/tracker/track")
async def tracker_track(request: Request):
    if not _tracker_check_key(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    ct = request.headers.get("content-type", "")
    raw = await request.body()
    try:
        payload = json.loads(raw)
    except Exception as e:
        print(f"[TRACKER] /track parse error: {e!r}  content-type={ct!r}  raw_head={raw[:200]!r}")
        return JSONResponse({"error": "Invalid JSON", "detail": str(e)}, status_code=400)
    mod_id = (payload.get("server_id") or "").strip()
    if not mod_id:
        return JSONResponse({"error": "payload missing server_id"}, status_code=400)
    players = payload.get("players", [])
    ts = payload.get("timestamp", int(time.time()))
    with _TRACKER_STATE_LOCK:
        slot = _TRACKER_LATEST_SNAPSHOTS.setdefault(mod_id, {})
        for p in players:
            uid = p.get("uid") or p.get("name", "")
            if uid:
                slot[uid] = {**p, "_server_id": mod_id, "_ts": ts}
        _TRACKER_LAST_RX[mod_id] = time.time()
    settings = _tracker_load_settings()
    if settings["sqlite_enabled"]:
        _tracker_db_init()
        await asyncio.to_thread(_tracker_db_write_snapshot, payload, settings)
    asyncio.create_task(_tracker_forward(payload, "snapshot"))
    return {"ok": True}

def _tracker_db_write_snapshot(payload: dict, settings: dict):
    with _TRACKER_DB_LOCK:
        conn = sqlite3.connect(TRACKER_DB)
        try:
            conn.execute(
                "INSERT INTO tr_snapshots (server_id,ts,session_time,players_total,players_alive,map,players_json) VALUES (?,?,?,?,?,?,?)",
                (payload.get("server_id",""), payload.get("timestamp", int(time.time())),
                 payload.get("session_time",0), payload.get("players_total",0),
                 payload.get("players_alive",0), payload.get("map",""),
                 json.dumps(payload.get("players",[])))
            )
            conn.commit()
            if settings["sqlite_retention_days"] > 0:
                _tracker_db_prune(settings["sqlite_retention_days"])
        finally:
            conn.close()

@app.post("/api/tracker/event")
async def tracker_event(request: Request):
    if not _tracker_check_key(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    ct = request.headers.get("content-type", "")
    raw = await request.body()
    try:
        payload = json.loads(raw)
    except Exception as e:
        print(f"[TRACKER] /event parse error: {e!r}  content-type={ct!r}  raw_head={raw[:200]!r}")
        return JSONResponse({"error": "Invalid JSON", "detail": str(e)}, status_code=400)
    mod_id = (payload.get("server_id") or "").strip()
    if not mod_id:
        return JSONResponse({"error": "payload missing server_id"}, status_code=400)
    with _TRACKER_STATE_LOCK:
        _tracker_events_deque(mod_id).append({**payload, "_rx_ts": time.time()})
        _TRACKER_LAST_RX[mod_id] = time.time()
    settings = _tracker_load_settings()
    if settings["sqlite_enabled"]:
        _tracker_db_init()
        await asyncio.to_thread(_tracker_db_write_event, payload)
    asyncio.create_task(_tracker_forward(payload, payload.get("event_type", "event")))
    return {"ok": True}

def _tracker_db_write_event(payload: dict):
    with _TRACKER_DB_LOCK:
        conn = sqlite3.connect(TRACKER_DB)
        try:
            conn.execute(
                "INSERT INTO tr_events (server_id,ts,event_type,data_json) VALUES (?,?,?,?)",
                (payload.get("server_id",""), payload.get("timestamp", int(time.time())),
                 payload.get("event_type","unknown"), json.dumps(payload.get("data",{})))
            )
            conn.commit()
        finally:
            conn.close()

def _tracker_server_running() -> bool:
    try:
        for s in load_servers().get("servers", []):
            if is_server_running(s.get("service_name", SERVICE_NAME)):
                return True
    except Exception:
        pass
    return False

@app.get("/api/tracker/debug")
async def tracker_debug(request: Request):
    key_ok = _tracker_check_key(request)
    role_ok = ROLE_ORDER.get(current_user(request).get("role",""), 0) >= ROLE_ORDER.get("admin", 0)
    if not key_ok and not role_ok:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    server_running = _tracker_server_running()
    mod_id = _tracker_panel_mod_id(request)
    if not mod_id:
        return {
            "wired_up": False,
            "server_running": server_running,
            "configured": False,
            "mod_server_id": None,
            "last_rx": None,
            "snapshots": [],
            "events": [],
            "forward_status": dict(_TRACKER_FORWARD_STATUS),
            "key_configured": bool(PLAYERTRACKER_API_KEY),
        }
    with _TRACKER_STATE_LOCK:
        last_rx = _TRACKER_LAST_RX.get(mod_id, 0.0)
        snapshots = list(_TRACKER_LATEST_SNAPSHOTS.get(mod_id, {}).values())
        events = list(_TRACKER_RECENT_EVENTS.get(mod_id, ()))
    mod_wired = bool(last_rx > 0 and (time.time() - last_rx) < 90)
    return {
        "wired_up": server_running and mod_wired,
        "server_running": server_running,
        "configured": True,
        "mod_server_id": mod_id,
        "last_rx": last_rx or None,
        "snapshots": snapshots,
        "events": events,
        "forward_status": dict(_TRACKER_FORWARD_STATUS),
        "key_configured": bool(PLAYERTRACKER_API_KEY),
    }

@app.get("/api/tracker/settings")
async def tracker_get_settings(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    return _tracker_load_settings()

@app.put("/api/tracker/settings")
async def tracker_put_settings(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    body = await request.json()
    with _TRACKER_SETTINGS_LOCK:
        current = _tracker_load_settings()
        for k in ("events_cap","snapshot_ttl_sec","sqlite_enabled","sqlite_retention_days","forward_destinations"):
            if k in body:
                current[k] = body[k]
        if "events_cap" in body:
            new_cap = max(1, int(body["events_cap"]))
            with _TRACKER_STATE_LOCK:
                for mid, dq in list(_TRACKER_RECENT_EVENTS.items()):
                    old_events = list(dq)
                    _TRACKER_RECENT_EVENTS[mid] = deque(old_events[-new_cap:], maxlen=new_cap)
        _tracker_save_settings(current)
        if current["sqlite_enabled"]:
            _tracker_db_init()
    return {"ok": True}

@app.post("/api/tracker/clear")
async def tracker_clear(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    body = await request.json()
    target = body.get("target", "all")
    scope = body.get("scope", "server")  # "server" (default, current panel server) or "global"
    mod_id = _tracker_panel_mod_id(request)
    with _TRACKER_STATE_LOCK:
        if target in ("snapshots", "all"):
            if scope == "global" or not mod_id:
                _TRACKER_LATEST_SNAPSHOTS.clear()
            else:
                _TRACKER_LATEST_SNAPSHOTS.pop(mod_id, None)
        if target in ("events", "all"):
            if scope == "global" or not mod_id:
                _TRACKER_RECENT_EVENTS.clear()
            else:
                _TRACKER_RECENT_EVENTS.pop(mod_id, None)
    if target in ("sqlite", "all"):
        settings = _tracker_load_settings()
        if settings["sqlite_enabled"] and TRACKER_DB.exists():
            await asyncio.to_thread(_tracker_sqlite_wipe)
    return {"ok": True, "cleared": target, "scope": scope}

@app.get("/api/tracker/mod-ids")
async def tracker_mod_ids(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    return {"mod_ids": _tracker_recent_mod_ids()}

@app.put("/api/tracker/mod-id")
async def tracker_set_mod_id(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    body = await request.json()
    new_id = (body.get("mod_server_id") or "").strip()
    srv = getattr(request.state, "server", None)
    if not srv:
        return JSONResponse({"error": "No server context"}, status_code=400)
    registry = load_servers()
    found = False
    for entry in registry.get("servers", []):
        if entry.get("id") == srv.get("id"):
            if new_id:
                entry["tracker_mod_id"] = new_id
            else:
                entry.pop("tracker_mod_id", None)
            found = True
            break
    if not found:
        return JSONResponse({"error": "Server not found in registry"}, status_code=404)
    save_servers(registry)
    return {"ok": True, "tracker_mod_id": new_id or None}

def _tracker_sqlite_wipe():
    with _TRACKER_DB_LOCK:
        conn = sqlite3.connect(TRACKER_DB)
        try:
            conn.execute("DELETE FROM tr_snapshots")
            conn.execute("DELETE FROM tr_events")
            conn.commit()
        finally:
            conn.close()

@app.get("/api/tracker/forward/status")
async def tracker_forward_status(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    return {"destinations": dict(_TRACKER_FORWARD_STATUS)}

@app.post("/api/tracker/forward/test")
async def tracker_forward_test(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    body = await request.json()
    dest = body.get("destination", {})
    test_payload = {"server_id": "test", "timestamp": int(time.time()), "players_total": 0, "players": []}
    await _tracker_send_dest(dest, test_payload, "test")
    name = dest.get("name", "unnamed")
    return {"ok": True, "result": _TRACKER_FORWARD_STATUS.get(name)}

@app.get("/api/tracker/history/events")
async def tracker_history_events(request: Request, limit: int = 200, offset: int = 0, event_type: str = "", scope: str = "server"):
    denied = require_role(request, "admin")
    if denied: return denied
    settings = _tracker_load_settings()
    if not settings["sqlite_enabled"] or not TRACKER_DB.exists():
        return {"events": [], "total": 0, "sqlite_enabled": False}
    mod_id = _tracker_panel_mod_id(request)
    if scope != "global" and not mod_id:
        return {"events": [], "total": 0, "sqlite_enabled": True, "configured": False}
    def _query():
        with _TRACKER_DB_LOCK:
            conn = sqlite3.connect(TRACKER_DB)
            conn.row_factory = sqlite3.Row
            try:
                base = "FROM tr_events"
                clauses: list = []
                params: list = []
                if scope != "global":
                    clauses.append("server_id=?")
                    params.append(mod_id)
                if event_type:
                    clauses.append("event_type=?")
                    params.append(event_type)
                if clauses:
                    base += " WHERE " + " AND ".join(clauses)
                total = conn.execute(f"SELECT COUNT(*) {base}", params).fetchone()[0]
                rows = conn.execute(f"SELECT * {base} ORDER BY ts DESC LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
                return total, [dict(r) for r in rows]
            finally:
                conn.close()
    total, rows = await asyncio.to_thread(_query)
    return {"events": rows, "total": total, "sqlite_enabled": True, "configured": True}

@app.get("/api/tracker/history/snapshots")
async def tracker_history_snapshots(request: Request, limit: int = 100, offset: int = 0, scope: str = "server"):
    denied = require_role(request, "admin")
    if denied: return denied
    settings = _tracker_load_settings()
    if not settings["sqlite_enabled"] or not TRACKER_DB.exists():
        return {"snapshots": [], "total": 0, "sqlite_enabled": False}
    mod_id = _tracker_panel_mod_id(request)
    if scope != "global" and not mod_id:
        return {"snapshots": [], "total": 0, "sqlite_enabled": True, "configured": False}
    def _query():
        with _TRACKER_DB_LOCK:
            conn = sqlite3.connect(TRACKER_DB)
            conn.row_factory = sqlite3.Row
            try:
                base = "FROM tr_snapshots"
                params: list = []
                if scope != "global":
                    base += " WHERE server_id=?"
                    params.append(mod_id)
                total = conn.execute(f"SELECT COUNT(*) {base}", params).fetchone()[0]
                rows = conn.execute(f"SELECT id,server_id,ts,session_time,players_total,players_alive,map {base} ORDER BY ts DESC LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
                return total, [dict(r) for r in rows]
            finally:
                conn.close()
    total, rows = await asyncio.to_thread(_query)
    return {"snapshots": rows, "total": total, "sqlite_enabled": True, "configured": True}

@app.get("/api/tracker/key")
async def tracker_key_get(request: Request):
    denied = require_role(request, "admin")
    if denied: return denied
    key = PLAYERTRACKER_API_KEY
    if not key:
        return {"key_configured": False, "masked": None}
    masked = "*" * max(0, len(key) - 6) + key[-6:] if len(key) > 6 else "***"
    return {"key_configured": True, "masked": masked}

@app.get("/api/tracker/key/reveal")
async def tracker_key_reveal(request: Request):
    denied = require_role(request, "owner")
    if denied: return denied
    return {"key": PLAYERTRACKER_API_KEY}

@app.post("/api/tracker/key/rotate")
async def tracker_key_rotate(request: Request):
    global PLAYERTRACKER_API_KEY
    denied = require_role(request, "owner")
    if denied: return denied
    new_key = secrets.token_hex(20)
    PLAYERTRACKER_API_KEY = new_key
    lines = []
    if _env_path.exists():
        for line in _env_path.read_text().splitlines():
            if line.strip().startswith("PLAYERTRACKER_API_KEY="):
                continue
            lines.append(line)
    lines.append(f"PLAYERTRACKER_API_KEY={new_key}")
    tmp = _env_path.with_suffix(".env.tmp")
    tmp.write_text("\n".join(lines) + "\n")
    tmp.replace(_env_path)
    os.environ["PLAYERTRACKER_API_KEY"] = new_key
    masked = "*" * max(0, len(new_key) - 6) + new_key[-6:]
    return {"ok": True, "masked": masked}

@app.post("/api/tracker/key/set")
async def tracker_key_set(request: Request):
    global PLAYERTRACKER_API_KEY
    denied = require_role(request, "owner")
    if denied: return denied
    body = await request.json()
    new_key = (body.get("key") or "").strip()
    if not new_key:
        return JSONResponse({"error": "key required"}, status_code=400)
    PLAYERTRACKER_API_KEY = new_key
    lines = []
    if _env_path.exists():
        for line in _env_path.read_text().splitlines():
            if line.strip().startswith("PLAYERTRACKER_API_KEY="):
                continue
            lines.append(line)
    lines.append(f"PLAYERTRACKER_API_KEY={new_key}")
    tmp = _env_path.with_suffix(".env.tmp")
    tmp.write_text("\n".join(lines) + "\n")
    tmp.replace(_env_path)
    os.environ["PLAYERTRACKER_API_KEY"] = new_key
    masked = "*" * max(0, len(new_key) - 6) + new_key[-6:]
    return {"ok": True, "masked": masked}


frontend_dist = Path("/opt/panel/frontend/dist")
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
