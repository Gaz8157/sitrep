# AI GM — Qwen3:14b Upgrade + Full Data Enrichment + Shippable Package
**Date:** 2026-04-08  
**Status:** Approved for implementation

---

## Overview

Upgrade the AI Game Master stack from `qwen3:8b` (4K context, limited data) to `qwen3:14b` with KV cache quantization (32K context, full data enrichment). Simultaneously add kill event tracking, player chat forwarding, and vehicle state to `AIGameMasterComponent.c`. Create the missing doctrine/reference JSON files the bridge already knows how to load. Package the entire system for distribution to other Arma Reforger server operators.

**Hardware target (primary):** RTX 4080 (16GB VRAM), 9950X, 32GB RAM, Ubuntu desktop  
**Hardware target (min spec):** RTX 3060 / any GPU with ≥8GB VRAM, Ubuntu 22.04+  
**Inference backend:** Ollama (local, no cloud dependency)

---

## Goals

1. Replace `qwen3:8b` with `qwen3:14b` Q4_K_M — smarter multi-step tool calling, better operation planning, thinking-mode deliberation before decisions
2. Expand context window from 4K → 32K via KV cache quantization (`q8_0`)
3. Feed the AI richer live data: kill events, player chat, vehicle state, full catalog, player skill summaries
4. Create `military_doctrine_reference.json` and `arma_reference_data.json` so the doctrine system (already coded) actually works
5. Package everything so a new user can go from zero to running AI GM in one script

---

## Architecture

```
[Arma Reforger Server]
  └── AIGameMasterComponent.c (mod, EnforceScript)
        ├── CollectState() → POST /state every 10s
        │     Now includes: event_log, vehicle_state, player_stats
        ├── FetchCommands() → GET /commands
        └── NEW: chat hook → POST /chat_event on player message

[bridge.py — FastAPI, port 5555]
  ├── /state          ← receives game state
  ├── /commands       ← serves queued commands
  ├── /chat_event     ← NEW: receives player chat
  ├── Ollama client   → qwen3:14b Q4_K_M, 32K ctx, think:true, q8_0 KV
  ├── BattlefieldAwareness (event diffs, movement, engagement)
  ├── PlayerSkillTracker (KD, threat level — now fed by mod kill events)
  ├── OutcomeEvaluator (did spawns engage/survive/get wiped)
  ├── OperationPlanner (multi-phase ops)
  └── data/
        ├── military_doctrine_reference.json  ← CREATE (was missing)
        └── arma_reference_data.json          ← CREATE (was missing)

[dashboard — Next.js, port 3000]
  ├── Tactical Map, Stats, Chat Panel (existing)
  └── NEW: Model Config panel (model, KV type, ctx size, think toggle)
```

---

## Piece 1 — Model & Inference Configuration

### Ollama Setup
- Default model: `qwen3:14b` (Q4_K_M quantization, pulled via `ollama pull qwen3:14b`)
- KV cache type: `OLLAMA_KV_CACHE_TYPE=q8_0` (env var, set before starting Ollama)
- Context window: `OLLAMA_NUM_CTX=32768` (passed per-request in bridge)
- Thinking mode: `think: true` in Ollama API calls for autonomous heartbeat queries
- Thinking mode: `think: false` for fast chat responses (keeps chat snappy)

### bridge.py changes
- Update `_default_model` from `qwen3:8b` → `qwen3:14b`
- Add `num_ctx: 32768` to all Ollama request payloads
- Add `think: true/false` param based on query type (autonomous=true, chat=false)
- Add `OLLAMA_KV_CACHE_TYPE` to startup docs / `.env.example`
- Expose model config via new `GET/POST /api/model-config` endpoint (for dashboard panel)

### Model tier logic (for shippable install)
The install script detects VRAM and writes the appropriate model to `.env`:
- ≥16GB VRAM → `qwen3:14b` (recommended, 32K ctx)
- ≥12GB VRAM → `qwen3:14b` (tighter, 16K ctx)
- ≥8GB VRAM → `qwen3.5:9b` (262K native ctx, good fallback)
- <8GB VRAM → `qwen3:8b` (minimum viable, 8K ctx)

---

## Piece 2 — Doctrine & Reference JSON Files

### `data/military_doctrine_reference.json`
The bridge already calls `build_doctrine_context()` which reads this file. It's been returning empty string because the file doesn't exist. Structure:

```json
{
  "version": "1.0",
  "mission_types": {
    "special_operations": {
      "direct_action": {
        "name": "Direct Action",
        "description": "Short-duration strike against high-value target...",
        "phases": ["Insertion", "Actions on Objective", "Exfil"],
        "force_composition": "...",
        "ai_escalation": ["Sentry → QRF → Reinforcement wave"],
        "sub_types": { ... }
      },
      "special_reconnaissance": { ... },
      "personnel_recovery": { ... }
    },
    "conventional_operations": {
      "deliberate_attack": { ... },
      "defense_in_depth": { ... },
      "ambush": { ... },
      "convoy_operations": { ... },
      "urban_operations": { ... },
      "patrol_operations": { ... },
      "checkpoint_operations": { ... }
    }
  },
  "combined_arms_principles": { ... },
  "escalation_ladder": { ... },
  "vehicle_tactics": {
    "apc_assault": "Spawn APC at staging grid → BOARD infantry → MOVE to assault grid → dismount order",
    "vehicle_patrol": "...",
    "qrf_response": "..."
  }
}
```

This gives the AI 8+ concrete mission types with phases, force compositions, escalation patterns, and vehicle tactic sequences it can follow precisely.

### `data/arma_reference_data.json`
Map knowledge for Everon and other supported maps. Already has a loader in `load_reference_data()`. Structure per map:

```json
{
  "everon": {
    "named_locations": [
      {"name": "Morton", "type": "town", "grid": "065-088"},
      ...
    ],
    "military_sites": [ ... ],
    "terrain_features": [ ... ],
    "tactical_notes": [
      "Eastern coast is flat — vehicle corridor, ideal for convoy ops",
      "Central highlands offer elevation advantage — use for overwatch/mortar"
    ],
    "operation_suggestions": [ ... ]
  }
}
```

---

## Piece 3 — AIGameMasterComponent.c Additions

### 3a — Kill Event Log

**New fields on `AIGameMasterComponent`:**
```c
protected ref array<ref AIGM_KillEvent> m_aEventLog = {};
protected int m_iEventLogMax = 20;
protected int m_iPlayerKillsThisSession = 0;
protected int m_iPlayerDeathsThisSession = 0;
```

**New data class:**
```c
class AIGM_KillEvent {
    string m_sType;       // "PLAYER_KILLED", "AI_GROUP_WIPED", "AI_UNIT_KILLED"
    string m_sPlayer;     // player name (if applicable)
    string m_sKillerUnit; // AI unit name that scored the kill
    string m_sVictimUnit; // unit that was killed
    string m_sGrid;       // grid where kill happened
    int    m_iTimestamp;  // unix time
}
```

**Hook in `OnPostInit`:**
```c
SCR_BaseGameMode gameMode = SCR_BaseGameMode.Cast(GetGame().GetGameMode());
if (gameMode) {
    gameMode.GetOnPlayerKilled().Insert(OnPlayerKilled);
}
```

**New handler:**
```c
protected void OnPlayerKilled(int playerId, IEntity player, IEntity killer, notnull Instigator instigator) {
    // Extract player name, grid, nearest killer unit
    // Append AIGM_KillEvent to m_aEventLog (rolling, max 20)
    // Increment m_iPlayerDeathsThisSession
}
```

**Track AI group destruction** in the existing cleanup loop — when `rec.m_bAlive` flips false, append `AI_GROUP_WIPED` event.

**CollectState() addition:**
```json
"event_log": [
  {"type":"PLAYER_KILLED","player":"Mark","grid":"150-200","killer_unit":"Group_USSR_Spetsnaz_Squad","ts":1712345678},
  {"type":"AI_GROUP_WIPED","unit":"Group_USSR_RifleSquad","grid":"155-205","ts":1712345679}
],
"player_stats": {
  "kills_this_session": 5,
  "deaths_this_session": 2
}
```

### 3b — Player Chat Forwarding

**Hook in `OnPostInit`:**
```c
foreach (int pid : playerIds) {
    PlayerController pc = GetGame().GetPlayerManager().GetPlayerController(pid);
    if (pc) {
        BaseChatComponent chat = BaseChatComponent.Cast(pc.FindComponent(BaseChatComponent));
        if (chat) chat.GetOnChatMessage().Insert(OnChatMessage);
    }
}
```

**Handler:**
```c
protected void OnChatMessage(string text, EBaseChatChannel channel, PlayerController sender) {
    if (channel != EBaseChatChannel.GLOBAL && channel != EBaseChatChannel.DIRECT) return;
    string pName = sender ? GetGame().GetPlayerManager().GetPlayerName(sender.GetPlayerId()) : "Unknown";
    string chatJson = "{\"player\":\"" + pName + "\",\"message\":\"" + EscapeJson(text) + "\",\"server_id\":\"" + m_sServerId + "\"}";
    RestContext ctx = GetGame().GetRestApi().GetContext(m_sBridgeUrl);
    if (ctx) ctx.POST(m_pStateCallback, "/chat_event", chatJson);
}
```

### 3c — Vehicle State

Scan nearby vehicles in `CollectState()` using `GetWorld().QueryEntitiesBySphere()` around each player (500m radius), filter for `Vehicle` class, extract type name + grid + faction + occupant count. Include as:

```json
"vehicles": [
  {"type":"BTR70","grid":"155-205","faction":"OPFOR","occupants":3},
  {"type":"UAZ469","grid":"140-190","faction":"OPFOR","occupants":0}
]
```

Cap at 10 vehicles per scan to avoid payload bloat.

---

## Piece 4 — bridge.py Context Expansion

With 32K context unlocked, update `build_prompt()` to include:

| Data | Before | After |
|------|--------|-------|
| AI groups shown | 10 (capped) | All active (up to 40) |
| Catalog entries | Enemy-only, capped | All, with `[MOD]` flag on non-base items |
| Event log | Not included | Last 20 events from mod + BattlefieldAwareness |
| Player skill | Not in prompt | Full skill summary (KD, threat level) |
| RCON monitor | Not in prompt | FPS + entity count as stress indicator |
| Doctrine context | Empty (file missing) | Full doctrine once JSON created |
| Vehicle state | Not included | Nearby vehicles from mod |
| Chat history | In chat endpoint only | Recent 5 messages in autonomous heartbeat |

### Catalog mod-detection
In `format_catalog_for_prompt()`, flag items not matching known base-game prefab patterns with `[MOD]`:
```
Group_USSR_Spetsnaz_Squad (group, OPFOR)
NuclearBombCarrier [MOD] (vehicle, OPFOR)  ← flagged for AI attention
```

### New `/chat_event` endpoint
```python
@app.post("/chat_event")
async def chat_event(req: ChatEventRequest):
    # Add to server chat_history
    # If AI is not busy, optionally trigger a tactical response
    # Broadcast to dashboard websocket
```

---

## Piece 5 — System Prompt Enhancements

Two additions to the `system_prompt` string in bridge.py:

### Vehicle Sequencing Section
```
## VEHICLE OPERATIONS
When using vehicles tactically, sequence your tool calls:
1. SPAWN vehicle at a staging grid (500m+ from players)
2. SPAWN infantry group at same grid with behavior "defend" (they will board)
3. MOVE vehicle to assault grid with behavior "attack"
4. On next heartbeat: SPAWN dismount infantry near objective

For [MOD] vehicles (non-base-game): treat as heavy/elite assets. Use sparingly
for operation climax moments — QRF peak, final assault, or special objectives.
```

### Mod Arsenal Awareness Section
```
## MOD ASSETS
Items marked [MOD] in the catalog are not base-game. They are mod-added weapons,
vehicles, or compositions (e.g. custom bombs, special vehicles, unique compositions).
Rules:
- Read [MOD] item names carefully — the name tells you what it does
- Reserve [MOD] items for escalation peaks or unique scenario requirements
- Do NOT use [MOD] items in the first phase of an operation — build up to them
- If a [MOD] item is a composition (bomb, fortification), place it as environment first
```

---

## Piece 6 — Shippable Package

### File structure additions
```
AIGameMaster/
├── install.sh              ← NEW: one-command installer
├── .env.example            ← NEW: all config with comments
├── docker-compose.yml      ← NEW: container option
├── README.md               ← NEW: setup guide
└── AIGameMaster/
    ├── bridge.py
    ├── AIGameMasterComponent.c
    └── data/
        ├── military_doctrine_reference.json  ← NEW
        └── arma_reference_data.json          ← NEW
```

### `install.sh` logic
1. Check Ubuntu version (22.04+ required)
2. `nvidia-smi --query-gpu=memory.total` → detect VRAM
3. Map VRAM to recommended model (see tier table in Piece 1)
4. Install Ollama if not present (`curl https://ollama.ai/install.sh | sh`)
5. `ollama pull <recommended_model>` 
6. Copy `.env.example` → `.env`, patch model name
7. `pip install -r requirements.txt`
8. Install systemd unit for bridge.py (`aigm-bridge.service`)
9. Print: "Setup complete. Start bridge: `systemctl start aigm-bridge`. Dashboard: `npm run dev` in dashboard/"

### `.env.example`
```bash
# ─── Required ───────────────────────────────────────────
BRIDGE_PORT=5555           # Port bridge listens on
RCON_HOST=127.0.0.1        # Arma Reforger server IP
RCON_PORT=19999            # RCON port
RCON_PASSWORD=             # RCON password (leave blank if none)

# ─── Model Config (auto-set by install.sh) ──────────────
VLLM_MODEL=qwen3:14b       # Ollama model name
OLLAMA_NUM_CTX=32768       # Context window tokens
OLLAMA_KV_CACHE_TYPE=q8_0  # KV cache quantization: f16 / q8_0 / q4_0

# ─── Optional ───────────────────────────────────────────
BACKEND_MODE=ollama        # ollama or vllm
HEARTBEAT_SEC=90           # Autonomous AI decision interval
AI_TIMEOUT=120             # Max seconds to wait for AI response
MAX_TOKENS=2048            # Max output tokens per AI call
```

### Dashboard Model Config Panel
New panel in the dashboard settings section:
- Dropdown: Model name (shows installed Ollama models)
- Dropdown: KV Cache Type (f16 / q8_0 / q4_0) with memory impact label
- Slider: Context window (4K / 8K / 16K / 32K / 64K)
- Toggle: Thinking mode (on/off with latency warning)
- Button: "Pull Model" (calls `ollama pull <model>` via bridge API)
- Reads/writes via `GET/POST /api/model-config` on bridge

---

## Spec Self-Review

- **No TBDs or placeholders** — all sections specify exact field names, JSON shapes, and code patterns
- **No contradictions** — vehicle section in system prompt matches vehicle data added to state
- **Scope** — one implementation plan, sequenced as: model config → JSON files → mod additions → bridge expansion → system prompt → packaging
- **Ambiguity check** — "thinking mode" means Ollama's `think: true` param (not a separate model), clarified in Piece 1
- **Shipping constraint honored** — every piece has a portable default, hardware auto-detection in install.sh, and dashboard-configurable overrides

---

## Implementation Sequence

1. **bridge.py** — model config (default model, num_ctx, think param, model-config API)
2. **military_doctrine_reference.json** — create with full doctrine content
3. **arma_reference_data.json** — create with Everon map knowledge
4. **AIGameMasterComponent.c** — kill events, chat hook, vehicle state, CollectState additions
5. **bridge.py** — context expansion (build_prompt updates, /chat_event endpoint, catalog mod-detection)
6. **bridge.py** — system prompt additions (vehicle sequencing, mod arsenal sections)
7. **dashboard** — Model Config panel
8. **Packaging** — install.sh, .env.example, docker-compose.yml, README.md
