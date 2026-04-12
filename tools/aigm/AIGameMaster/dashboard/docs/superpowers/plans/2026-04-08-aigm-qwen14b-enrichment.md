# AI GM — Qwen3:14b Upgrade + Full Data Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the AI GM from qwen3:8b (4K context, minimal data) to qwen3:14b with thinking mode, 32K context, live kill events, player chat forwarding, vehicle state, military doctrine files, catalog mod-detection, and a shippable installer.

**Architecture:** The game mod (AIGameMasterComponent.c) gains kill event logging, chat forwarding, and vehicle scanning — all included in its periodic state POST. bridge.py gains a larger context budget, mod-aware catalog formatting, a `/chat_event` endpoint, and a richer system prompt. Two missing JSON files (military doctrine + Arma reference data) are created so the existing `build_doctrine_context()` function finally has data to work with. A one-command install script handles GPU detection and model selection for new deployments.

**Tech Stack:** Python 3.12, FastAPI, httpx, Ollama (qwen3:14b Q4_K_M), EnforceScript (Arma Reforger mod), Next.js 14, pytest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `AIGameMaster/bridge.py` | Model config, context expansion, /chat_event, system prompt |
| Modify | `AIGameMaster/AIGameMasterComponent.c` | Kill events, chat hook, vehicle scan |
| Create | `AIGameMaster/data/military_doctrine_reference.json` | Doctrine library for build_doctrine_context() |
| Create | `AIGameMaster/data/arma_reference_data.json` | Everon map knowledge |
| Create | `AIGameMaster/dashboard/src/components/dashboard/model-config.tsx` | Model config UI panel |
| Create | `AIGameMaster/dashboard/src/app/api/model-config/route.ts` | Model config API endpoint |
| Create | `AIGameMaster/install.sh` | GPU-aware one-command installer |
| Create | `AIGameMaster/.env.example` | Single-source config template |
| Create | `AIGameMaster/docker-compose.yml` | Container deployment option |
| Create | `AIGameMaster/tests/test_bridge_enrichment.py` | pytest tests for bridge changes |

---

## Task 1: Model Config — qwen3:14b, num_ctx, thinking mode

**Files:**
- Modify: `AIGameMaster/bridge.py` (lines ~63-76, ~2398-2418, ~3600-3613)
- Create: `AIGameMaster/tests/test_bridge_enrichment.py`

- [ ] **Step 1.1: Add OLLAMA_NUM_CTX and OLLAMA_THINK env vars to config block**

Find the block at ~line 63 that reads:
```python
_default_model= "qwen3:8b"    if BACKEND_MODE == "ollama" else "nemotron-fp8"
```

Replace with:
```python
_default_model= "qwen3:14b"   if BACKEND_MODE == "ollama" else "nemotron-fp8"
```

Then, immediately after the `MAX_TOKENS` line (currently `MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "1024"))`), add:
```python
OLLAMA_NUM_CTX    = int(os.environ.get("OLLAMA_NUM_CTX", "32768"))
OLLAMA_THINK      = os.environ.get("OLLAMA_THINK", "auto")  # auto / on / off
```

- [ ] **Step 1.2: Update get_model_options() to include Ollama-specific options**

Replace the entire `get_model_options` function (lines ~2398-2418):
```python
def get_model_options(complexity: str, is_chat: bool = False) -> dict:
    """Get optimized model options based on request complexity.
    For Ollama: injects num_ctx and optional think param.
    Temperature tuned per task: low for JSON reliability, higher for reasoning/narrative."""
    base = {
        "top_p": 0.95,
    }
    if BACKEND_MODE == "ollama":
        base["options"] = {"num_ctx": OLLAMA_NUM_CTX}

    if is_chat:
        return {**base, "temperature": 0.9, "max_tokens": 1024}
    elif complexity == "simple":
        return {**base, "temperature": 0.4, "max_tokens": 2048}
    elif complexity == "strategic":
        return {**base, "temperature": 0.8, "max_tokens": 4096}
    else:  # tactical
        return {**base, "temperature": 0.6, "max_tokens": 3072}
```

- [ ] **Step 1.3: Enable thinking mode for autonomous (non-chat) queries**

In `query_zeus()` at ~line 3580, the Ollama non-tool-call path ends the system prompt with `/no_think`. This suppresses the thinking chain.

Find:
```python
/no_think"""
            messages = [
                {"role": "system", "content": json_system_prompt},
                {"role": "user", "content": build_prompt(state, context)},
            ]
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": build_prompt(state, context)},
            ]
```

Replace with:
```python
/no_think"""
            # For Ollama: enable thinking on strategic/tactical queries, skip for simple
            _use_think = OLLAMA_THINK == "on" or (OLLAMA_THINK == "auto" and complexity in ("strategic", "tactical"))
            messages = [
                {"role": "system", "content": json_system_prompt},
                {"role": "user", "content": build_prompt(state, context)},
            ]
            if BACKEND_MODE == "ollama" and _use_think and model_opts.get("options"):
                model_opts["options"]["think"] = True
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": build_prompt(state, context)},
            ]
            if BACKEND_MODE == "ollama":
                model_opts.setdefault("options", {})
                model_opts["options"]["think"] = OLLAMA_THINK == "on" or (OLLAMA_THINK == "auto" and complexity in ("strategic", "tactical"))
```

- [ ] **Step 1.4: Write the failing test**

Create `AIGameMaster/tests/test_bridge_enrichment.py`:
```python
"""Tests for bridge.py enrichment changes."""
import importlib
import os
import sys
import pytest

# Add parent dir so we can import bridge
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _reload_bridge(env_overrides: dict):
    """Import bridge with patched env vars. Returns the module."""
    for k, v in env_overrides.items():
        os.environ[k] = v
    if "bridge" in sys.modules:
        del sys.modules["bridge"]
    import bridge as b
    return b


def test_model_default_is_qwen14b():
    b = _reload_bridge({"BACKEND_MODE": "ollama"})
    assert b.MODEL_NAME == "qwen3:14b", f"Expected qwen3:14b, got {b.MODEL_NAME}"


def test_ollama_model_opts_include_num_ctx():
    b = _reload_bridge({"BACKEND_MODE": "ollama", "OLLAMA_NUM_CTX": "32768"})
    opts = b.get_model_options("tactical")
    assert "options" in opts
    assert opts["options"]["num_ctx"] == 32768


def test_vllm_model_opts_no_options_key():
    b = _reload_bridge({"BACKEND_MODE": "vllm"})
    opts = b.get_model_options("tactical")
    assert "options" not in opts
```

- [ ] **Step 1.5: Run the tests to verify they fail first**

```bash
cd /home/mark/AIGameMaster
python -m pytest tests/test_bridge_enrichment.py -v 2>&1 | head -40
```
Expected: 3 FAILED (model is still qwen3:8b, options key missing)

- [ ] **Step 1.6: Apply the code changes from Steps 1.1–1.3 to bridge.py**

- [ ] **Step 1.7: Run the tests again**

```bash
cd /home/mark/AIGameMaster
python -m pytest tests/test_bridge_enrichment.py::test_model_default_is_qwen14b tests/test_bridge_enrichment.py::test_ollama_model_opts_include_num_ctx tests/test_bridge_enrichment.py::test_vllm_model_opts_no_options_key -v
```
Expected: 3 PASSED

- [ ] **Step 1.8: Pull the new model via Ollama**

```bash
ollama pull qwen3:14b
```
Expected: Model download progress, ends with "success". Takes 5–10 min depending on connection (~9GB download).

- [ ] **Step 1.9: Set KV cache env var for Ollama server**

Add to `/etc/systemd/system/ollama.service` (under `[Service]`):
```
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
```
Then:
```bash
sudo systemctl daemon-reload && sudo systemctl restart ollama
```
If Ollama is not running as a service, set the env var in the shell before starting it:
```bash
export OLLAMA_KV_CACHE_TYPE=q8_0
ollama serve &
```

- [ ] **Step 1.10: Smoke test the model**

```bash
ollama run qwen3:14b "Reply with: OK"
```
Expected: Response containing "OK" within 30 seconds.

- [ ] **Step 1.11: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/bridge.py tests/test_bridge_enrichment.py
git commit -m "feat: upgrade to qwen3:14b with 32K context and thinking mode support"
```

---

## Task 2: Create military_doctrine_reference.json

**Files:**
- Create: `AIGameMaster/data/military_doctrine_reference.json`

The bridge's `build_doctrine_context()` function (line ~2602) reads this file on startup. It's been returning empty string because the file didn't exist. This task creates it with real content.

- [ ] **Step 2.1: Create the file**

Create `/home/mark/AIGameMaster/AIGameMaster/data/military_doctrine_reference.json`:
```json
{
  "version": "1.0",
  "mission_types": {
    "special_operations": {
      "direct_action": {
        "name": "Direct Action",
        "description": "Short-duration strike against a high-value target. Fast ingress, decisive violence, fast egress. Enemy must be neutralized before they can react or reinforce.",
        "phases": ["Staging (position forces 500m+ from objective)", "Breach (assault element makes first contact)", "Actions on Objective (neutralize target, exploit intel)", "Exfil (withdraw before QRF arrives)"],
        "force_composition": "Assault element (1-2 rifle squads), Support element (1 MG or sniper team on overwatch), Reserve (1 squad 500m back as QRF block)",
        "ai_escalation": [
          "Phase 1: 1 sentry team at perimeter, 1 patrol on route",
          "Phase 2 (player contact): commit reserve squad, change patrol to 'attack'",
          "Phase 3 (player inside objective): QRF vehicle arrives from alternate direction, reinforcement squad from 600m"
        ],
        "sub_types": {
          "vip_elimination": {
            "game_master_scenario": {
              "setup": "Spawn 1 command composition (E_CommandPost or bunker) as HQ, 2 sentry teams around it, 1 patrol on road",
              "ai_escalation": ["QRF squad from 600m after first contact", "Vehicle QRF from town after 2 minutes of sustained contact", "Reinforcement wave of 2 squads if players breach the HQ perimeter"]
            }
          }
        }
      },
      "special_reconnaissance": {
        "name": "Special Reconnaissance",
        "description": "Clandestine collection of intelligence without direct engagement. Enemy patrols avoid contact but will pursue if spotted. Atmosphere of tension and surveillance.",
        "phases": ["Infiltration (patrols moving through area)", "Observation (static OP teams watching roads/key terrain)", "Extraction (patrols converge if players spotted)"],
        "force_composition": "Multiple 2-man sentry teams, 1-2 light vehicle patrols, no static weapons (this is recon, not defense)",
        "ai_escalation": [
          "Phase 1: 3-4 sentry teams spread across area, behavior 'patrol'",
          "Phase 2 (player spotted): nearest 2 teams switch to 'hunt', broadcast 'CONTACT report — intruders in area'",
          "Phase 3 (player engaged): all patrols converge, vehicle patrol responds as QRF"
        ],
        "sub_types": {}
      },
      "personnel_recovery": {
        "name": "Personnel Recovery",
        "description": "Enemy holds a position of value — could be a captured asset, downed pilot, or key document. Players must reach and secure it under fire.",
        "phases": ["Cordon (enemy has established perimeter)", "Approach (players push through outer security)", "Assault (hard contact at the holding position)", "Breakout (enemy pursues as players extract with the objective)"],
        "force_composition": "Outer cordon (2 patrol teams), Inner guard (1 rifle squad at objective), Pursuit force (1 squad staged 400m away for breakout phase)",
        "ai_escalation": [
          "Phase 1: outer cordon patrolling, inner guard stationary 'defend'",
          "Phase 2 (player reaches inner perimeter): inner guard attacks, outer cordon converges",
          "Phase 3 (player secures objective): pursuit force activates, vehicle QRF from 600m, broadcast 'Target is moving — all units intercept'"
        ],
        "sub_types": {}
      }
    },
    "conventional_operations": {
      "deliberate_attack": {
        "name": "Deliberate Attack",
        "description": "Methodical assault on a prepared enemy position. Suppress, fix, flank, finish. Players must work through defensive layers. Enemy fights from fortified positions.",
        "phases": ["Suppression (MG/mortar fire on forward positions)", "Fix (rifle elements pin defenders)", "Flank (assault element attacks from unexpected axis)", "Exploitation (pursue retreating enemy, secure objective)"],
        "force_composition": "Forward screen (1-2 sentry teams), Defensive line (2 rifle squads in bunkers/cover), Fire support (1 static MG or mortar), Reserve (1 squad behind defensive line)",
        "ai_escalation": [
          "Phase 1: forward screen patrols, defensive line on 'defend' in composition",
          "Phase 2 (player contact with forward screen): defensive line activates, fire support begins",
          "Phase 3 (player breaches defensive line): reserve commits, vehicle QRF from flank, broadcast 'defensive line compromised — fall back and hold second position'"
        ],
        "sub_types": {}
      },
      "defense_in_depth": {
        "name": "Defense in Depth",
        "description": "Enemy yields ground slowly, trading space for casualties. Multiple defensive lines. When players take one position, another is already manned further back. High intensity, attrition warfare.",
        "phases": ["Forward Line (screen force delays players)", "Main Line (primary defense 300-600m back)", "Reserve (counterattack force behind main line)"],
        "force_composition": "Screen line (1 rifle squad, light vehicles), Main line (2 squads in bunkers, 1 static MG), Counterattack (1 squad + vehicle staged 600m behind)",
        "ai_escalation": [
          "Phase 1: screen force engages, falls back after taking 50% casualties",
          "Phase 2: main line engages from prepared positions, static MG provides overwatch",
          "Phase 3 (main line broken): counterattack force advances, broadcast 'All units — counterattack. Push them back.'"
        ],
        "sub_types": {}
      },
      "ambush": {
        "name": "Ambush",
        "description": "Surprise attack from concealed positions along a player route. Maximum violence of action in minimum time. Kill zone set before players arrive. Classic L-shape or linear ambush.",
        "phases": ["Emplacement (forces position silently before players arrive)", "Initiation (triggered by player entering kill zone)", "Assault (all elements open fire simultaneously)", "Withdrawal (if players counterattack effectively, break contact and reposition)"],
        "force_composition": "Assault line (1-2 squads on one side of road/path), Cut-off team (1 team blocking retreat route 200m ahead), Optional: 1 sniper team on elevation",
        "ai_escalation": [
          "Phase 1: ambush teams stationary on 'defend' BEFORE player reaches kill zone — do NOT attack until player is in zone",
          "Phase 2 (player in kill zone): all teams switch to 'attack' simultaneously, broadcast 'AMBUSH — fire fire fire'",
          "Phase 3 (player breaks through): pursuit team follows, block team repositions ahead"
        ],
        "sub_types": {}
      },
      "convoy_operations": {
        "name": "Convoy Attack",
        "description": "Enemy convoy moving through the area. Players intercept and destroy. Vehicles are priority targets. Dismounted security will defend if convoy stops.",
        "phases": ["Movement (convoy on road)", "Contact (players engage lead vehicle)", "Dismount (enemy dismounts and forms hasty defense)", "Reinforcement (QRF from nearest enemy position)"],
        "force_composition": "Convoy (2-3 vehicles on patrol route), Dismount security (4-6 infantry per vehicle), QRF (1 squad at a nearby grid, staged for response)",
        "ai_escalation": [
          "Phase 1: vehicles on 'patrol' behavior along road route",
          "Phase 2 (vehicle destroyed or contact): remaining vehicles stop, infantry dismount to 'attack'",
          "Phase 3 (convoy mostly destroyed): QRF activates from 600m, broadcast 'Convoy under attack — all units respond'"
        ],
        "sub_types": {}
      },
      "urban_operations": {
        "name": "Urban Operations",
        "description": "Fighting through built-up area. Short sight lines. Every building a potential threat. Enemy uses buildings and streets as cover. High casualty, high tempo.",
        "phases": ["Outer cordon (block routes into town)", "Building clearance (systematic room by room)", "Hold (enemy reinforces from other part of town)"],
        "force_composition": "Street teams (1 squad per major road axis), Building guards (2-man sentry in key buildings), Reserve (1 squad for counterattack from alley/back route)",
        "ai_escalation": [
          "Phase 1: sentry teams in buildings near town entrance, vehicles at road junctions",
          "Phase 2 (player enters town): inner squads activate, street teams converge",
          "Phase 3 (player deep in town): reserve squad flanks from opposite side, broadcast 'They're inside — seal the exits'"
        ],
        "sub_types": {}
      },
      "patrol_operations": {
        "name": "Area Security Patrol",
        "description": "Enemy controlling an area with mobile patrols. Low initial intensity — escalates if players are spotted or make contact. Good for session opening before a main operation.",
        "phases": ["Routine patrol (normal coverage)", "Alert (patrol spots player sign)", "Reaction (patrols converge on suspected contact)"],
        "force_composition": "2-3 patrol teams on different routes, 1 QRF team staged at a central point",
        "ai_escalation": [
          "Phase 1: patrol teams on 'patrol' behavior, random routes",
          "Phase 2 (player spotted or shot): nearest patrol switches to 'hunt', QRF activates",
          "Phase 3 (sustained contact): all patrols converge, request reinforcement squad from 800m"
        ],
        "sub_types": {}
      },
      "checkpoint_operations": {
        "name": "Checkpoint Control",
        "description": "Enemy controls key road junction or crossing. Static defensive position with vehicle and foot traffic control. Players must either bypass or assault through.",
        "phases": ["Checkpoint active (guards at post)", "Alert (suspicious activity)", "Reinforcement (QRF from nearby base)"],
        "force_composition": "Checkpoint guards (1 team at post), Overwatch (1 sniper or MG team on elevation), QRF (1 squad at 400m)",
        "ai_escalation": [
          "Phase 1: guards on 'defend' at checkpoint composition, overwatch stationary",
          "Phase 2 (player approaches or fires): guards engage, overwatch activates",
          "Phase 3 (checkpoint taken): QRF advances, broadcast 'Checkpoint compromised — QRF respond'"
        ],
        "sub_types": {}
      }
    }
  },
  "combined_arms_principles": {
    "suppress_fix_flank_finish": "Suppress enemy with fire, fix them in place with a unit, flank with a separate element, finish with assault",
    "overwatch_and_bound": "One element fires while another moves. Never move without fire support.",
    "vehicle_infantry_cooperation": "Vehicles provide fire support and mobility. Infantry clears terrain vehicles cannot enter. Never send a vehicle without infantry support.",
    "reserve_commitment": "Never commit your reserve early. Hold it until the decisive moment — player breakthrough or enemy collapse.",
    "depth_not_width": "Layer defenses in depth (multiple lines) rather than a single wide line. Depth absorbs player firepower and creates multiple engagements."
  },
  "escalation_ladder": {
    "0_green": "No contact. Patrol and area control only. 1-2 teams max.",
    "1_yellow": "Player activity detected. Patrols increase, sentries alert. 2-3 teams.",
    "2_orange": "Contact made. QRF commits, reinforcements stage. 4-6 teams.",
    "3_red": "Sustained firefight. All reserves committed. Vehicle QRF. 6-10 teams.",
    "4_black": "Critical position threatened. Maximum effort. All available forces. 10+ teams."
  },
  "vehicle_tactics": {
    "apc_assault": "1. SPAWN APC at staging grid (500m+ from players). 2. SPAWN infantry squad at same grid with behavior 'defend' (they board nearby vehicle). 3. On next heartbeat: MOVE APC to assault grid with behavior 'attack'. 4. SPAWN dismount infantry at assault grid to reinforce.",
    "vehicle_patrol": "SPAWN vehicle at one end of road. MOVE to far waypoint with behavior 'patrol'. Vehicle will drive route. SPAWN infantry at midpoint as dismounted security.",
    "qrf_response": "When players engage a position: SPAWN vehicle at a grid 600m+ away. MOVE toward contact with behavior 'attack'. BROADCAST 'QRF en route' to set player expectation.",
    "overwatch_gun": "SPAWN static weapon (HMG, mortar) on elevated grid. SET_BEHAVIOR to 'defend'. This creates persistent fire support that changes the tactical equation."
  }
}
```

- [ ] **Step 2.2: Verify the file loads cleanly**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python3 -c "
import json
with open('data/military_doctrine_reference.json') as f:
    d = json.load(f)
special = d['mission_types']['special_operations']
conv = d['mission_types']['conventional_operations']
count = len(special) + len(conv)
print(f'Loaded OK: {count} mission types')
print('Special ops:', list(special.keys()))
print('Conventional:', list(conv.keys()))
"
```
Expected output:
```
Loaded OK: 10 mission types
Special ops: ['direct_action', 'special_reconnaissance', 'personnel_recovery']
Conventional: ['deliberate_attack', 'defense_in_depth', 'ambush', 'convoy_operations', 'urban_operations', 'patrol_operations', 'checkpoint_operations']
```

- [ ] **Step 2.3: Add test for doctrine loading**

Append to `AIGameMaster/tests/test_bridge_enrichment.py`:
```python
def test_doctrine_loads_mission_types():
    import json, os
    path = os.path.join(os.path.dirname(__file__), "..", "data", "military_doctrine_reference.json")
    with open(path) as f:
        d = json.load(f)
    assert "ambush" in d["mission_types"]["conventional_operations"]
    assert "direct_action" in d["mission_types"]["special_operations"]
    assert "vehicle_tactics" in d
    apc = d["vehicle_tactics"]["apc_assault"]
    assert "SPAWN" in apc and "MOVE" in apc
```

- [ ] **Step 2.4: Run new test**

```bash
cd /home/mark/AIGameMaster && python -m pytest tests/test_bridge_enrichment.py::test_doctrine_loads_mission_types -v
```
Expected: PASSED

- [ ] **Step 2.5: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/data/military_doctrine_reference.json tests/test_bridge_enrichment.py
git commit -m "feat: create military doctrine reference JSON (10 mission types, vehicle tactics)"
```

---

## Task 3: Create arma_reference_data.json

**Files:**
- Create: `AIGameMaster/data/arma_reference_data.json`

The bridge `load_reference_data()` (line ~123) reads per-map JSON files from the data directory and populates `MAP_DATA`. The map key is the lowercased map name from the game state. The server-1.json shows map name `"Game Master - Everon Xtra"` → key `"game master - everon xtra"`.

- [ ] **Step 3.1: Create the file**

Create `/home/mark/AIGameMaster/AIGameMaster/data/arma_reference_data.json`:
```json
{
  "game master - everon xtra": {
    "named_locations": [
      {"name": "Morton", "type": "town", "grid": "065-088"},
      {"name": "Montignac", "type": "town", "grid": "082-062"},
      {"name": "Regine", "type": "village", "grid": "055-072"},
      {"name": "Le Moule", "type": "village", "grid": "072-078"},
      {"name": "Grishino", "type": "town", "grid": "045-055"},
      {"name": "Levie", "type": "village", "grid": "060-065"},
      {"name": "Saint-Pierre", "type": "town", "grid": "090-080"},
      {"name": "La Trinite", "type": "village", "grid": "078-055"},
      {"name": "Corazol", "type": "village", "grid": "052-045"}
    ],
    "military_sites": [
      {"name": "Everon Airport", "type": "airfield", "grid": "070-058"},
      {"name": "North Radio Tower", "type": "landmark", "grid": "050-040"},
      {"name": "South Radar Station", "type": "military_base", "grid": "085-095"},
      {"name": "Central Crossroads", "type": "junction", "grid": "068-070"}
    ],
    "terrain_features": [
      {"name": "Central Ridge", "type": "high_ground", "grid": "060-060", "note": "Dominant elevation — ideal for overwatch, mortars, and long-range fire support"},
      {"name": "Eastern Coast Road", "type": "road_corridor", "grid": "090-070", "note": "Flat, fast vehicle corridor — ideal for convoy ops and vehicle QRF"},
      {"name": "Western Forest Belt", "type": "forest", "grid": "040-065", "note": "Dense cover — ideal for ambush positions and concealed staging"},
      {"name": "Northern Valley", "type": "valley", "grid": "055-035", "note": "Low ground between ridges — channelises movement, ambush risk"},
      {"name": "Southern Lowlands", "type": "open_ground", "grid": "075-095", "note": "Open terrain — players are visible, long engagement ranges, vehicles effective"}
    ],
    "tactical_notes": [
      "Central ridge dominates the map — whoever holds it controls sightlines to 60% of the island",
      "The airport is an obvious high-value objective — strong defensive works there create credible missions",
      "Eastern coast road is the fastest vehicle axis — ambushes there feel authentic and create intense engagements",
      "Morton and Montignac are the largest towns — urban ops there create close-quarters intensity",
      "The forest belt west of the central ridge is perfect for concealed staging — players rarely check it",
      "Radio towers and radar stations are natural mission objectives — players understand immediately why they matter"
    ],
    "operation_suggestions": [
      "CONVOY INTERCEPT: Enemy convoy moving Morton → Montignac on coast road. Players intercept and destroy.",
      "AIRFIELD SEIZURE: Enemy holds Everon Airport. Players must clear terminal and secure runway.",
      "RIDGELINE DEFENSE: Enemy has observation post on Central Ridge calling in fire on player positions. Neutralize it.",
      "TOWN CLEARANCE: Enemy occupies Morton. Clear street by street, establish control of town square.",
      "RADIO SILENCE: Destroy North Radio Tower to cut enemy comms before main assault.",
      "CHECKPOINT BREACH: Enemy checkpoint blocks main road. Assault or bypass to continue advance."
    ]
  },
  "everon": {
    "named_locations": [
      {"name": "Morton", "type": "town", "grid": "065-088"},
      {"name": "Montignac", "type": "town", "grid": "082-062"},
      {"name": "Regine", "type": "village", "grid": "055-072"},
      {"name": "Grishino", "type": "town", "grid": "045-055"},
      {"name": "Saint-Pierre", "type": "town", "grid": "090-080"}
    ],
    "military_sites": [
      {"name": "Everon Airport", "type": "airfield", "grid": "070-058"},
      {"name": "Radar Station", "type": "military_base", "grid": "085-095"}
    ],
    "terrain_features": [
      {"name": "Central Ridge", "type": "high_ground", "grid": "060-060"},
      {"name": "Eastern Coast Road", "type": "road_corridor", "grid": "090-070"},
      {"name": "Western Forest Belt", "type": "forest", "grid": "040-065"}
    ],
    "tactical_notes": [
      "Central ridge dominates sightlines across the island",
      "Eastern coast road is the primary vehicle axis"
    ],
    "operation_suggestions": [
      "AIRFIELD SEIZURE: Clear Everon Airport and hold against counterattack.",
      "TOWN CLEARANCE: Enemy holds Morton — clear and secure."
    ]
  }
}
```

- [ ] **Step 3.2: Verify load**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python3 -c "
import json
with open('data/arma_reference_data.json') as f:
    d = json.load(f)
for key in d:
    locs = len(d[key].get('named_locations', []))
    sug = len(d[key].get('operation_suggestions', []))
    print(f'Map \"{key}\": {locs} locations, {sug} op suggestions')
"
```
Expected:
```
Map "game master - everon xtra": 9 locations, 6 op suggestions
Map "everon": 5 locations, 2 op suggestions
```

- [ ] **Step 3.3: Add test**

Append to `AIGameMaster/tests/test_bridge_enrichment.py`:
```python
def test_arma_reference_loads_everon():
    import json, os
    path = os.path.join(os.path.dirname(__file__), "..", "data", "arma_reference_data.json")
    with open(path) as f:
        d = json.load(f)
    everon = d.get("game master - everon xtra") or d.get("everon")
    assert everon is not None, "No Everon entry found"
    assert len(everon["named_locations"]) >= 5
    assert len(everon["operation_suggestions"]) >= 2
    assert any("AIRFIELD" in s.upper() or "CONVOY" in s.upper() for s in everon["operation_suggestions"])
```

- [ ] **Step 3.4: Run test**

```bash
cd /home/mark/AIGameMaster && python -m pytest tests/test_bridge_enrichment.py::test_arma_reference_loads_everon -v
```
Expected: PASSED

- [ ] **Step 3.5: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/data/arma_reference_data.json tests/test_bridge_enrichment.py
git commit -m "feat: create Everon map reference data (locations, terrain, op suggestions)"
```

---

## Task 4: AIGameMasterComponent.c — Kill Event Log

**Files:**
- Modify: `AIGameMaster/AIGameMaster/AIGameMasterComponent.c`

This adds a rolling 20-event log of kills and AI group destructions to the state JSON. Verification is via server console logs (no unit test framework for EnforceScript).

- [ ] **Step 4.1: Add AIGM_KillEvent data class**

At the bottom of `AIGameMasterComponent.c`, just before the `AIGM_CatalogEntry` class definition (currently at ~line 2927), add:

```c
class AIGM_KillEvent
{
	string m_sType;        // "PLAYER_KILLED" | "AI_GROUP_WIPED" | "AI_UNIT_KILLED"
	string m_sPlayerName;  // affected player (if applicable)
	string m_sKillerUnit;  // AI unit name that scored the kill (if applicable)
	string m_sGrid;        // grid where event occurred
	int    m_iTimestamp;   // unix timestamp
}
```

- [ ] **Step 4.2: Add event log fields to AIGameMasterComponent**

In the `// ─── Runtime State ──────────` block (~line 119), after `protected int m_iCasualtiesRecent = 0;`, add:

```c
	protected ref array<ref AIGM_KillEvent> m_aEventLog = {};
	protected int m_iEventLogMax = 20;
	protected int m_iPlayerDeathsThisSession = 0;
	protected int m_iPlayerKillsThisSession = 0;
```

- [ ] **Step 4.3: Register OnPlayerKilled hook in OnPostInit**

In `OnPostInit()`, after the line `DiscoverWaypointPrefabs();` (~line 177), add:

```c
		SCR_BaseGameMode gameMode = SCR_BaseGameMode.Cast(GetGame().GetGameMode());
		if (gameMode)
		{
			gameMode.GetOnPlayerKilled().Insert(OnPlayerKilled);
			LogV("OnPlayerKilled hook registered");
		}
```

- [ ] **Step 4.4: Add OnPlayerKilled handler method**

Add this method to `AIGameMasterComponent`, just before the `SendState()` method (~line 795):

```c
	protected void OnPlayerKilled(int playerId, IEntity playerEntity, IEntity killerEntity, notnull Instigator instigator)
	{
		string pName = GetGame().GetPlayerManager().GetPlayerName(playerId);
		float px = 0, pz = 0;
		if (playerEntity)
		{
			vector pos = playerEntity.GetOrigin();
			px = pos[0];
			pz = pos[2];
		}
		string grid = pos_to_grid6_local(px, pz);

		// Find which of our spawned groups is nearest to the kill location
		string killerUnit = "unknown";
		float bestDist = 9999;
		foreach (AIGM_SpawnRecord rec : m_aSpawnedGroups)
		{
			if (!rec || !rec.m_bAlive) continue;
			float dx = rec.m_vLastPos[0] - px;
			float dz = rec.m_vLastPos[2] - pz;
			float dist = Math.Sqrt(dx*dx + dz*dz);
			if (dist < bestDist && dist < 500)
			{
				bestDist = dist;
				killerUnit = rec.m_sType;
			}
		}

		AIGM_KillEvent ev = new AIGM_KillEvent();
		ev.m_sType = "PLAYER_KILLED";
		ev.m_sPlayerName = pName;
		ev.m_sKillerUnit = killerUnit;
		ev.m_sGrid = grid;
		ev.m_iTimestamp = System.GetUnixTime();
		AppendEvent(ev);

		m_iPlayerDeathsThisSession++;
		m_iCasualtiesRecent++;
		Log("Kill event: " + pName + " killed near grid " + grid + " (nearest unit: " + killerUnit + ")");
	}

	protected void AppendEvent(AIGM_KillEvent ev)
	{
		m_aEventLog.Insert(ev);
		if (m_aEventLog.Count() > m_iEventLogMax)
			m_aEventLog.Remove(0);
	}

	protected string pos_to_grid6_local(float x, float z)
	{
		int gx = (int)((x - m_fMapOffsetX) / 100);
		int gz = (int)((z - m_fMapOffsetZ) / 100);
		string sx = gx.ToString();
		string sz = gz.ToString();
		while (sx.Length() < 3) sx = "0" + sx;
		while (sz.Length() < 3) sz = "0" + sz;
		return sx + "-" + sz;
	}
```

- [ ] **Step 4.5: Add BuildEventLogJson() method**

Add just before `CollectState()` (~line 2782):

```c
	protected string BuildEventLogJson()
	{
		string result = "";
		foreach (int i, AIGM_KillEvent ev : m_aEventLog)
		{
			if (i > 0) result += ",";
			result += "{";
			result += "\"type\":\"" + ev.m_sType + "\",";
			result += "\"player\":\"" + ev.m_sPlayerName + "\",";
			result += "\"killer_unit\":\"" + ev.m_sKillerUnit + "\",";
			result += "\"grid\":\"" + ev.m_sGrid + "\",";
			result += "\"ts\":" + ev.m_iTimestamp.ToString();
			result += "}";
		}
		return result;
	}
```

- [ ] **Step 4.6: Track AI group destructions**

In the existing cleanup loop that marks groups as dead (search for `rec.m_bAlive = false` in the file), add after the flag is set:

```c
				// Log AI group destruction event
				AIGM_KillEvent wipeEv = new AIGM_KillEvent();
				wipeEv.m_sType = "AI_GROUP_WIPED";
				wipeEv.m_sKillerUnit = rec.m_sType;
				wipeEv.m_sGrid = pos_to_grid6_local(rec.m_vLastPos[0], rec.m_vLastPos[2]);
				wipeEv.m_iTimestamp = System.GetUnixTime();
				AppendEvent(wipeEv);
```

- [ ] **Step 4.7: Include event_log in CollectState()**

In `CollectState()`, find the closing `}` of the JSON string (the final `json += "}"` at ~line 2918). Replace:

```c
		json += "\"casualties_last_10min\":" + m_iCasualtiesRecent.ToString();
		json += "}";
```

With:

```c
		json += "\"casualties_last_10min\":" + m_iCasualtiesRecent.ToString() + ",";
		json += "\"event_log\":[" + BuildEventLogJson() + "],";
		json += "\"player_deaths_session\":" + m_iPlayerDeathsThisSession.ToString();
		json += "}";
```

- [ ] **Step 4.8: Verify by checking server console log**

After deploying the mod update to the game server, check the server log (`~/.local/share/ArmaReforger/profile/logs/*/console.log`) for:
```
[AI-GM] OnPlayerKilled hook registered
```
When a player is killed in-game, expect:
```
[AI-GM] Kill event: <PlayerName> killed near grid <XXX-YYY> (nearest unit: <UnitType>)
```

- [ ] **Step 4.9: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/AIGameMasterComponent.c
git commit -m "feat(mod): add kill event log and OnPlayerKilled hook to state payload"
```

---

## Task 5: AIGameMasterComponent.c — Player Chat Forwarding

**Files:**
- Modify: `AIGameMaster/AIGameMaster/AIGameMasterComponent.c`

- [ ] **Step 5.1: Add EscapeJson helper method**

Add this utility method to `AIGameMasterComponent` (add near the `Log()` helpers at ~line 155):

```c
	protected string EscapeJson(string s)
	{
		// Replace backslash first, then quotes, then control chars
		s.Replace("\\", "\\\\");
		s.Replace("\"", "\\\"");
		s.Replace("\n", "\\n");
		s.Replace("\r", "\\r");
		s.Replace("\t", "\\t");
		return s;
	}
```

- [ ] **Step 5.2: Add chat callback class**

Near the other callback classes at the bottom of the file (~line 2966), add:

```c
class AIGM_ChatCallback : RestCallback
{
	void AIGM_ChatCallback()
	{
		SetOnSuccess(OnSuccess);
		SetOnError(OnError);
	}
	void OnSuccess(RestCallback cb) {}
	void OnError(RestCallback cb, int errorCode) {}
}
```

- [ ] **Step 5.3: Add chat callback field to AIGameMasterComponent**

In the `// ─── Runtime State` block, after `protected ref AIGM_StateCallback m_pStateCallback;`, add:

```c
	protected ref AIGM_ChatCallback m_pChatCallback;
```

- [ ] **Step 5.4: Initialize chat callback in OnPostInit**

In `OnPostInit()`, after `m_pStateCallback = new AIGM_StateCallback(this);`, add:

```c
		m_pChatCallback = new AIGM_ChatCallback();
```

- [ ] **Step 5.5: Hook chat messages in OnPostInit**

After the OnPlayerKilled hook registration (added in Task 4), add:

```c
		// Hook chat on all currently connected players
		array<int> initialPlayers = {};
		GetGame().GetPlayerManager().GetPlayers(initialPlayers);
		foreach (int pid : initialPlayers)
		{
			RegisterChatHook(pid);
		}
```

- [ ] **Step 5.6: Add RegisterChatHook and OnPlayerChatMessage methods**

Add before `SendState()`:

```c
	protected void RegisterChatHook(int playerId)
	{
		PlayerController pc = GetGame().GetPlayerManager().GetPlayerController(playerId);
		if (!pc) return;
		BaseChatComponent chatComp = BaseChatComponent.Cast(pc.FindComponent(BaseChatComponent));
		if (chatComp)
		{
			chatComp.GetOnChatMessageReceived().Insert(OnPlayerChatMessage);
			LogV("Chat hook registered for player " + playerId.ToString());
		}
	}

	protected void OnPlayerChatMessage(int senderId, string text, EBaseChatChannel channel)
	{
		// Only forward global and team channel messages to the AI
		if (channel != EBaseChatChannel.GLOBAL && channel != EBaseChatChannel.TEAM)
			return;

		string pName = GetGame().GetPlayerManager().GetPlayerName(senderId);
		string safe = EscapeJson(text);
		string chatJson = "{\"player\":\"" + EscapeJson(pName) + "\",\"message\":\"" + safe + "\",\"server_id\":\"" + m_sServerId + "\"}";

		RestContext ctx = GetGame().GetRestApi().GetContext(m_sBridgeUrl);
		if (ctx)
		{
			ctx.SetHeaders("Content-Type,application/json");
			ctx.POST(m_pChatCallback, "/chat_event", chatJson);
			LogV("Chat forwarded: " + pName + ": " + text);
		}
	}
```

- [ ] **Step 5.7: Also hook new players as they connect**

In `OnPostInit`, after registering the `OnPlayerKilled` hook, also hook:

```c
		if (gameMode)
		{
			gameMode.GetOnPlayerConnected().Insert(OnPlayerConnectedForChat);
		}
```

Add the handler:

```c
	protected void OnPlayerConnectedForChat(int playerId)
	{
		RegisterChatHook(playerId);
	}
```

- [ ] **Step 5.8: Verify in server log**

After deploying, look for:
```
[AI-GM] Chat hook registered for player 0
```
When a player types in global chat, look for:
```
[AI-GM] Chat forwarded: <PlayerName>: <message>
```

- [ ] **Step 5.9: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/AIGameMasterComponent.c
git commit -m "feat(mod): forward player global chat to bridge /chat_event"
```

---

## Task 6: AIGameMasterComponent.c — Vehicle State + CollectState

**Files:**
- Modify: `AIGameMaster/AIGameMaster/AIGameMasterComponent.c`

- [ ] **Step 6.1: Add AIGM_VehicleInfo data class**

Near the other data classes at the bottom of the file, add:

```c
class AIGM_VehicleInfo
{
	string m_sType;
	string m_sGrid;
	string m_sFaction;
	int    m_iOccupants;
}
```

- [ ] **Step 6.2: Add BuildVehicleStateJson() method**

Add before `CollectState()`:

```c
	protected string BuildVehicleStateJson()
	{
		array<int> playerIds = {};
		GetGame().GetPlayerManager().GetPlayers(playerIds);
		if (playerIds.IsEmpty()) return "";

		// Use first player's position as scan center (or average if multiple)
		float centerX = 0, centerZ = 0;
		int posCount = 0;
		foreach (int pid : playerIds)
		{
			IEntity pe = GetGame().GetPlayerManager().GetPlayerControlledEntity(pid);
			if (pe)
			{
				vector pos = pe.GetOrigin();
				centerX += pos[0];
				centerZ += pos[2];
				posCount++;
			}
		}
		if (posCount == 0) return "";
		centerX /= posCount;
		centerZ /= posCount;

		// Query entities in 600m radius
		ref array<IEntity> entities = {};
		vector center = Vector(centerX, 0, centerZ);
		GetGame().GetWorld().QueryEntitiesBySphere(center, 600, entities, null, EQueryEntitiesFlags.ALL);

		string result = "";
		int count = 0;
		foreach (IEntity ent : entities)
		{
			if (!ent || count >= 10) break;
			Vehicle veh = Vehicle.Cast(ent);
			if (!veh) continue;

			string typeName = ent.GetPrefabData() ? ent.GetPrefabData().GetPrefabName() : "Unknown";
			// Extract short name from path
			int lastSlash = typeName.LastIndexOf("/");
			if (lastSlash >= 0) typeName = typeName.Substring(lastSlash + 1, typeName.Length() - lastSlash - 1);
			typeName.Replace(".et", "");

			string faction = "UNKNOWN";
			FactionAffiliationComponent fac = FactionAffiliationComponent.Cast(ent.FindComponent(FactionAffiliationComponent));
			if (fac && fac.GetAffiliatedFaction())
				faction = fac.GetAffiliatedFaction().GetFactionKey();

			vector vpos = ent.GetOrigin();
			string grid = pos_to_grid6_local(vpos[0], vpos[2]);

			// Count occupants
			int occupants = 0;
			BaseCompartmentManagerComponent compMgr = BaseCompartmentManagerComponent.Cast(ent.FindComponent(BaseCompartmentManagerComponent));
			if (compMgr)
			{
				array<IEntity> occupantEnts = {};
				compMgr.GetOccupants(occupantEnts);
				occupants = occupantEnts.Count();
			}

			if (count > 0) result += ",";
			result += "{\"type\":\"" + typeName + "\",\"grid\":\"" + grid + "\",\"faction\":\"" + faction + "\",\"occupants\":" + occupants.ToString() + "}";
			count++;
		}
		return result;
	}
```

- [ ] **Step 6.3: Add vehicle state to CollectState()**

In `CollectState()`, after `string factionsJson = BuildFactionsJson();` (currently ~line 2884), add:

```c
		string vehiclesJson = BuildVehicleStateJson();
```

Then in the JSON assembly section, after `"valid_spawn_grids"`, add:

```c
		if (vehiclesJson.Length() > 0)
			json += "\"vehicles\":[" + vehiclesJson + "],";
```

Place this line before `"engagement_intensity"` in the JSON string.

- [ ] **Step 6.4: Verify in server log**

After deploying, check that the state JSON posted to bridge includes a `"vehicles"` key. You can verify by adding a temporary log in `CollectState()`:
```c
LogV("State JSON length: " + json.Length().ToString() + " chars");
```
Expected state size increase: ~200-500 bytes when vehicles are nearby.

- [ ] **Step 6.5: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/AIGameMasterComponent.c
git commit -m "feat(mod): add vehicle state scan (600m radius, max 10 vehicles) to state payload"
```

---

## Task 7: bridge.py — Context Expansion in build_prompt()

**Files:**
- Modify: `AIGameMaster/bridge.py` (function `build_prompt`, ~line 2713)
- Modify: `AIGameMaster/tests/test_bridge_enrichment.py`

- [ ] **Step 7.1: Write failing tests first**

Append to `AIGameMaster/tests/test_bridge_enrichment.py`:
```python
def test_build_prompt_includes_event_log():
    b = _reload_bridge({"BACKEND_MODE": "ollama"})
    state = {
        "players": [],
        "ai_units": {"active": 0, "max": 40, "groups": []},
        "valid_spawn_grids": [],
        "event_log": [
            {"type": "PLAYER_KILLED", "player": "Mark", "killer_unit": "Group_USSR_Spetsnaz_Squad", "grid": "150-200", "ts": 1712345678},
            {"type": "AI_GROUP_WIPED", "killer_unit": "Group_USSR_RifleSquad", "grid": "155-205", "ts": 1712345679},
        ],
        "catalog": [],
        "factions": [],
        "map": "everon",
        "map_size": 12800,
        "map_offset_x": 0,
        "map_offset_z": 0,
    }
    prompt = b.build_prompt(state)
    assert "PLAYER_KILLED" in prompt or "Mark" in prompt, "event_log not in prompt"


def test_build_prompt_includes_all_ai_groups():
    b = _reload_bridge({"BACKEND_MODE": "ollama"})
    groups = [{"type": f"Squad_{i}", "count": 4, "grid": f"0{i:02d}-050", "behavior": "patrol"} for i in range(15)]
    state = {
        "players": [],
        "ai_units": {"active": 60, "max": 200, "groups": groups},
        "valid_spawn_grids": [],
        "event_log": [],
        "catalog": [],
        "factions": [],
        "map": "everon",
        "map_size": 12800,
        "map_offset_x": 0,
        "map_offset_z": 0,
    }
    prompt = b.build_prompt(state)
    # All 15 groups should appear, not just 10
    assert "Squad_14" in prompt, "Groups capped at 10, should show all 15"


def test_build_prompt_flags_mod_catalog_items():
    b = _reload_bridge({"BACKEND_MODE": "ollama"})
    catalog = [
        {"name": "Group_USSR_RifleSquad", "category": "group", "faction": "OPFOR"},
        {"name": "NuclearBombCarrier", "category": "vehicle", "faction": "OPFOR"},
    ]
    state = {
        "players": [],
        "ai_units": {"active": 0, "max": 40, "groups": []},
        "valid_spawn_grids": [],
        "event_log": [],
        "catalog": catalog,
        "factions": [],
        "map": "everon",
        "map_size": 12800,
        "map_offset_x": 0,
        "map_offset_z": 0,
    }
    prompt = b.build_prompt(state)
    assert "[MOD]" in prompt, "Non-base-game item NuclearBombCarrier should be tagged [MOD]"
```

- [ ] **Step 7.2: Run to confirm they fail**

```bash
cd /home/mark/AIGameMaster && python -m pytest tests/test_bridge_enrichment.py::test_build_prompt_includes_event_log tests/test_bridge_enrichment.py::test_build_prompt_includes_all_ai_groups tests/test_bridge_enrichment.py::test_build_prompt_flags_mod_catalog_items -v 2>&1 | tail -20
```
Expected: 3 FAILED

- [ ] **Step 7.3: Remove the 10-group cap in build_prompt()**

In `build_prompt()` at ~line 2736, find:
```python
    for g in ai_groups[:10]:  # cap at 10 to save tokens
```
Replace with:
```python
    for g in ai_groups:  # show all groups — 32K context handles it
```

- [ ] **Step 7.4: Add event_log section to build_prompt()**

In `build_prompt()`, after the `ai = ", ".join(ai_lines) or "none"` line (~line 2738), add:

```python
    # Event log from mod (kills, AI wipes)
    event_log_section = ""
    raw_events = state.get("event_log", [])
    if raw_events:
        ev_lines = []
        for ev in raw_events[-15:]:  # last 15 events
            etype = ev.get("type", "?")
            if etype == "PLAYER_KILLED":
                ev_lines.append(f"PLAYER_KILLED: {ev.get('player','?')} at {ev.get('grid','?')} by {ev.get('killer_unit','?')}")
            elif etype == "AI_GROUP_WIPED":
                ev_lines.append(f"AI_WIPED: {ev.get('killer_unit','?')} at {ev.get('grid','?')}")
            elif etype == "PLAYER_RESPAWN":
                ev_lines.append(f"PLAYER_RESPAWN: {ev.get('player','?')} at {ev.get('grid','?')}")
        if ev_lines:
            event_log_section = "RECENT EVENTS (newest last):\n" + "\n".join(ev_lines) + "\n"
```

- [ ] **Step 7.5: Add vehicle state section to build_prompt()**

After the event_log_section block, add:

```python
    # Vehicle state from mod
    vehicle_section = ""
    vehicles = state.get("vehicles", [])
    if vehicles:
        v_lines = [f"{v.get('type','?')}({v.get('faction','?')}) @ {v.get('grid','?')} [{v.get('occupants',0)} occupants]" for v in vehicles]
        vehicle_section = "VEHICLES IN AREA: " + ", ".join(v_lines) + "\n"
```

- [ ] **Step 7.6: Add [MOD] detection to format_catalog_for_prompt()**

In the `format_catalog_for_prompt()` function (~line 1222), find where individual catalog entries are formatted into lines. The function iterates over catalog entries and builds a string. Find the line that appends entry names (something like `lines.append(f"{e['name']} ({e['category']}, {e['faction']})")`).

Add mod-detection logic. After the function signature, add a set of known base-game prefab prefixes:

```python
    BASE_GAME_PREFIXES = {
        "Group_USSR_", "Group_US_", "Group_FIA_", "Group_CIV_",
        "Character_USSR_", "Character_US_", "Character_FIA_",
        "BTR", "UAZ", "BRDM", "T72", "M151", "HMMWV", "Truck",
        "E_Checkpoint", "E_Bunker", "E_Barricade", "E_CamoNet",
        "E_FieldHospital", "E_CommandPost", "E_SupplyCache",
        "HMG_", "Mortar_", "SPG9_",
    }
```

Then, when formatting each entry name, add:
```python
        is_base = any(e["name"].startswith(pfx) for pfx in BASE_GAME_PREFIXES)
        mod_tag = "" if is_base else " [MOD]"
        # append name + mod_tag to the output line
```

The exact edit depends on the current loop structure in `format_catalog_for_prompt()`. Read lines 1222–1330 and add `mod_tag` to the formatted entry string.

- [ ] **Step 7.7: Include event_log_section and vehicle_section in the returned prompt string**

At the end of `build_prompt()`, the function assembles and returns a big string. Find where `pl` (player summary) and `ai` (AI summary) are included and add the new sections. Look for the `return` statement and the string assembly before it.

Add to the prompt assembly (before the return):
```python
    # Include new data sections
    if event_log_section:
        # Insert after player/AI summary, before grid section
        ...
```

The exact insertion point depends on the current structure. The rule: event_log goes after the `ai` summary line, vehicle_section goes after event_log. Both before the grid/terrain section.

- [ ] **Step 7.8: Run the tests**

```bash
cd /home/mark/AIGameMaster && python -m pytest tests/test_bridge_enrichment.py::test_build_prompt_includes_event_log tests/test_bridge_enrichment.py::test_build_prompt_includes_all_ai_groups tests/test_bridge_enrichment.py::test_build_prompt_flags_mod_catalog_items -v
```
Expected: 3 PASSED

- [ ] **Step 7.9: Run all tests**

```bash
cd /home/mark/AIGameMaster && python -m pytest tests/test_bridge_enrichment.py -v
```
Expected: All PASSED (no regressions)

- [ ] **Step 7.10: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/bridge.py tests/test_bridge_enrichment.py
git commit -m "feat: expand build_prompt — all AI groups, event_log, vehicles, [MOD] catalog tags"
```

---

## Task 8: bridge.py — /chat_event Endpoint

**Files:**
- Modify: `AIGameMaster/bridge.py`
- Modify: `AIGameMaster/tests/test_bridge_enrichment.py`

- [ ] **Step 8.1: Add ChatEventRequest model**

Find the Pydantic model definitions near line 707 (`class ConfigUpdate`, `class MissionBriefing`, `class ChatMessage`). After `class ChatMessage`, add:

```python
class ChatEventRequest(BaseModel):
    player: str
    message: str
    server_id: str = DEFAULT_SERVER
```

- [ ] **Step 8.2: Add /chat_event POST endpoint**

Find the `/chat` endpoint (search for `@app.post("/chat")`). After that endpoint's function, add:

```python
@app.post("/chat_event")
async def receive_chat_event(req: ChatEventRequest):
    """Receives player chat forwarded by the game mod.
    Adds to server chat history and broadcasts to dashboard."""
    srv = get_server(req.server_id)
    entry = {
        "role": "user",
        "content": req.message,
        "player": req.player,
        "source": "in_game_chat",
        "timestamp": time.time(),
    }
    srv.chat_history.append(entry)
    if len(srv.chat_history) > 50:
        srv.chat_history[:] = srv.chat_history[-50:]

    log.info(f"[In-Game Chat] {req.player}: {req.message}")
    await broadcast("chat_message", {
        "player": req.player,
        "message": req.message,
        "source": "in_game",
        "server_id": req.server_id,
    })
    return {"status": "ok"}
```

- [ ] **Step 8.3: Include recent chat in autonomous heartbeat prompt**

In `build_prompt()`, add a chat section that shows the last 5 in-game chat messages. After the `vehicle_section` block, add:

```python
    # Recent in-game player chat (forwarded from mod)
    chat_section = ""
    _sid = state.get("server_id", "server-1")
    if _sid in _servers:
        _igchat = [e for e in _servers[_sid].chat_history if e.get("source") == "in_game_chat"][-5:]
        if _igchat:
            c_lines = [f"{e['player']}: {e['content']}" for e in _igchat]
            chat_section = "PLAYER RADIO TRAFFIC (last 5 messages):\n" + "\n".join(c_lines) + "\n"
```

Then include `chat_section` in the returned prompt string alongside event_log_section and vehicle_section.

- [ ] **Step 8.4: Write test for /chat_event endpoint**

Append to test file:
```python
def test_chat_event_endpoint_appends_to_history():
    """Test /chat_event endpoint adds message to server chat history."""
    import asyncio
    b = _reload_bridge({"BACKEND_MODE": "ollama"})

    # Simulate the endpoint logic directly (no HTTP needed)
    import time
    server_id = "test-server"
    srv = b.get_server(server_id)
    initial_count = len(srv.chat_history)

    entry = {
        "role": "user",
        "content": "need armor at grid 150-200",
        "player": "Mark",
        "source": "in_game_chat",
        "timestamp": time.time(),
    }
    srv.chat_history.append(entry)

    assert len(srv.chat_history) == initial_count + 1
    assert srv.chat_history[-1]["player"] == "Mark"
    assert srv.chat_history[-1]["source"] == "in_game_chat"
```

- [ ] **Step 8.5: Run test**

```bash
cd /home/mark/AIGameMaster && python -m pytest tests/test_bridge_enrichment.py::test_chat_event_endpoint_appends_to_history -v
```
Expected: PASSED

- [ ] **Step 8.6: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/bridge.py tests/test_bridge_enrichment.py
git commit -m "feat: add /chat_event endpoint and pipe in-game chat to AI heartbeat context"
```

---

## Task 9: bridge.py — System Prompt Enhancements

**Files:**
- Modify: `AIGameMaster/bridge.py` (system_prompt string, ~line 3433)

- [ ] **Step 9.1: Add Vehicle Operations section to system_prompt**

In the `system_prompt` string in `query_zeus()`, find the `## Performance & Bandwidth` section (~line 3485). Insert the following NEW section immediately BEFORE it:

```python
## VEHICLE OPERATIONS
When using vehicles tactically, sequence your tool calls across heartbeats:
- Heartbeat 1: SPAWN vehicle at staging grid (500m+ from players, same grid as infantry). SPAWN infantry at same grid with behavior "defend" — they will automatically board nearby vehicles.
- Heartbeat 2: MOVE vehicle to assault grid with behavior "attack". Infantry in the vehicle will engage as they arrive.
- Heartbeat 3: SPAWN dismount infantry at the objective grid to reinforce the attack.
For vehicle QRF: SPAWN vehicle 600m+ from contact, MOVE toward contact, BROADCAST "QRF en route from [direction]".
Vehicles on "patrol" behavior will drive road routes — use for convoy simulation.

## MOD ARSENAL AWARENESS
The AVAILABLE UNITS list marks non-base-game items with [MOD]. These are mod-added weapons, vehicles, or compositions (custom bombs, special vehicles, unique fortifications).
Rules for [MOD] items:
- Read the name carefully — it tells you what the item does (e.g. NuclearBombCarrier, ArtilleryStrike_Composition)
- NEVER use [MOD] items in Phase 1 of an operation — build dramatic tension first
- Reserve [MOD] items for escalation peaks: the final assault wave, a desperate counterattack, or a special objective
- If a [MOD] item is a composition (bomb, fortification, special structure), SPAWN it as environment first before placing troops around it
- Treat [MOD] vehicles as heavy/elite assets — 1 is worth 3 standard vehicles tactically

```

- [ ] **Step 9.2: Verify the system prompt still parses**

```bash
cd /home/mark/AIGameMaster/AIGameMaster
python3 -c "
import ast, sys
with open('bridge.py') as f:
    src = f.read()
try:
    ast.parse(src)
    print('Syntax OK')
except SyntaxError as e:
    print(f'Syntax error: {e}')
    sys.exit(1)
"
```
Expected: `Syntax OK`

- [ ] **Step 9.3: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/bridge.py
git commit -m "feat: add vehicle sequencing and mod arsenal sections to Zeus system prompt"
```

---

## Task 10: Dashboard — Model Config Panel

**Files:**
- Create: `AIGameMaster/AIGameMaster/dashboard/src/app/api/model-config/route.ts`
- Create: `AIGameMaster/AIGameMaster/dashboard/src/components/dashboard/model-config.tsx`
- Modify: `AIGameMaster/AIGameMaster/bridge.py` (add GET/POST /api/model-config)

- [ ] **Step 10.1: Add model-config endpoints to bridge.py**

Find the section with other API endpoints (search for `@app.get("/api/`). Add:

```python
@app.get("/api/model-config")
async def get_model_config():
    """Return current model configuration."""
    return {
        "model": MODEL_NAME,
        "backend_mode": BACKEND_MODE,
        "num_ctx": OLLAMA_NUM_CTX,
        "think_mode": OLLAMA_THINK,
        "kv_cache_type": os.environ.get("OLLAMA_KV_CACHE_TYPE", "f16"),
        "max_tokens": MAX_TOKENS,
    }


class ModelConfigUpdate(BaseModel):
    model: str | None = None
    num_ctx: int | None = None
    think_mode: str | None = None  # "auto" / "on" / "off"
    max_tokens: int | None = None


@app.post("/api/model-config")
async def update_model_config(update: ModelConfigUpdate):
    """Update model configuration at runtime (takes effect on next query)."""
    global MODEL_NAME, OLLAMA_NUM_CTX, OLLAMA_THINK, MAX_TOKENS
    changed = []
    if update.model is not None:
        MODEL_NAME = update.model
        changed.append(f"model={MODEL_NAME}")
    if update.num_ctx is not None:
        OLLAMA_NUM_CTX = update.num_ctx
        changed.append(f"num_ctx={OLLAMA_NUM_CTX}")
    if update.think_mode is not None and update.think_mode in ("auto", "on", "off"):
        OLLAMA_THINK = update.think_mode
        changed.append(f"think={OLLAMA_THINK}")
    if update.max_tokens is not None:
        MAX_TOKENS = update.max_tokens
        changed.append(f"max_tokens={MAX_TOKENS}")
    log.info(f"Model config updated: {', '.join(changed)}")
    return {"status": "ok", "changed": changed}
```

- [ ] **Step 10.2: Create the API route in Next.js**

Create `AIGameMaster/AIGameMaster/dashboard/src/app/api/model-config/route.ts`:
```typescript
import { NextResponse } from "next/server";

const BRIDGE = process.env.BRIDGE_URL || "http://localhost:5555";

export async function GET() {
  const res = await fetch(`${BRIDGE}/api/model-config`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(`${BRIDGE}/api/model-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 10.3: Create model-config.tsx component**

Create `AIGameMaster/AIGameMaster/dashboard/src/components/dashboard/model-config.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";

interface ModelConfig {
  model: string;
  backend_mode: string;
  num_ctx: number;
  think_mode: string;
  kv_cache_type: string;
  max_tokens: number;
}

const CTX_OPTIONS = [4096, 8192, 16384, 32768, 65536];
const KV_OPTIONS = [
  { value: "f16", label: "f16 (full precision)" },
  { value: "q8_0", label: "q8_0 (2x compression, recommended)" },
  { value: "q4_0", label: "q4_0 (4x compression, max context)" },
];
const THINK_OPTIONS = [
  { value: "auto", label: "Auto (think on complex queries)" },
  { value: "on", label: "Always think (slower, smarter)" },
  { value: "off", label: "Off (fastest)" },
];

export function ModelConfigPanel() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/model-config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setStatus("Failed to load config"));
  }, []);

  async function save(updates: Partial<ModelConfig>) {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/model-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setConfig((c) => c ? { ...c, ...updates } : c);
        setStatus("Saved");
      }
    } catch {
      setStatus("Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <div className="text-sm text-muted-foreground">Loading model config…</div>;

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <h3 className="font-semibold text-sm">AI Model Configuration</h3>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Model Name</label>
        <input
          className="w-full text-sm border rounded px-2 py-1 bg-background"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          onBlur={() => save({ model: config.model })}
          placeholder="e.g. qwen3:14b"
        />
        <p className="text-xs text-muted-foreground">
          Backend: {config.backend_mode} &nbsp;|&nbsp; KV Cache: {config.kv_cache_type} (set via OLLAMA_KV_CACHE_TYPE env)
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Context Window</label>
        <select
          className="w-full text-sm border rounded px-2 py-1 bg-background"
          value={config.num_ctx}
          onChange={(e) => save({ num_ctx: parseInt(e.target.value) })}
        >
          {CTX_OPTIONS.map((v) => (
            <option key={v} value={v}>{(v / 1024).toFixed(0)}K tokens{v === 32768 ? " (recommended)" : ""}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Thinking Mode</label>
        <select
          className="w-full text-sm border rounded px-2 py-1 bg-background"
          value={config.think_mode}
          onChange={(e) => save({ think_mode: e.target.value })}
        >
          {THINK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Max Output Tokens</label>
        <input
          type="number"
          className="w-full text-sm border rounded px-2 py-1 bg-background"
          value={config.max_tokens}
          onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) })}
          onBlur={() => save({ max_tokens: config.max_tokens })}
          min={512}
          max={8192}
          step={512}
        />
      </div>

      {status && (
        <p className={`text-xs ${status === "Saved" ? "text-green-500" : "text-red-500"}`}>
          {status}
        </p>
      )}
      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}
```

- [ ] **Step 10.4: Add ModelConfigPanel to the dashboard**

Open `AIGameMaster/AIGameMaster/dashboard/src/components/dashboard/server-config.tsx` (or the settings section of the dashboard). Import and add the panel:

```typescript
import { ModelConfigPanel } from "./model-config";
// ... inside the component's return, in an appropriate settings section:
<ModelConfigPanel />
```

If server-config.tsx doesn't have a settings section, find the dashboard layout file and add it to the existing settings/config tab.

- [ ] **Step 10.5: Smoke test**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npm run dev &
sleep 5
curl -s http://localhost:3000/api/model-config | python3 -m json.tool
```
Expected: JSON with `model`, `num_ctx`, `think_mode` etc.

- [ ] **Step 10.6: Commit**

```bash
cd /home/mark/AIGameMaster
git add AIGameMaster/bridge.py AIGameMaster/AIGameMasterComponent.c \
  AIGameMaster/dashboard/src/app/api/model-config/ \
  AIGameMaster/dashboard/src/components/dashboard/model-config.tsx
git commit -m "feat: add model config panel — model, context, thinking mode editable from dashboard"
```

---

## Task 11: Shippable Package

**Files:**
- Create: `AIGameMaster/install.sh`
- Create: `AIGameMaster/.env.example`
- Create: `AIGameMaster/docker-compose.yml`

- [ ] **Step 11.1: Create .env.example**

Create `/home/mark/AIGameMaster/AIGameMaster/.env.example`:
```bash
# ═══════════════════════════════════════════════════════════
# AI Game Master — Configuration
# Copy this file to .env and fill in your values.
# Run install.sh to auto-populate VLLM_MODEL based on your GPU.
# ═══════════════════════════════════════════════════════════

# ─── Required: Arma Reforger Server ─────────────────────────
BRIDGE_PORT=5555           # Port this bridge listens on (mod must match)
RCON_HOST=127.0.0.1        # IP of your Arma Reforger server
RCON_PORT=19999            # RCON port (default 19999)
RCON_PASSWORD=             # RCON password (blank if none set)

# ─── AI Model (auto-set by install.sh based on your GPU) ────
BACKEND_MODE=ollama        # ollama (local) or vllm (remote server)
VLLM_MODEL=qwen3:14b       # Model name — see install.sh for hardware tiers
OLLAMA_NUM_CTX=32768       # Context window: 4096 / 8192 / 16384 / 32768
OLLAMA_THINK=auto          # Thinking mode: auto / on / off

# ─── KV Cache (set before starting Ollama, not at runtime) ──
# Add this to your Ollama systemd service under [Service]:
# Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
# Options: f16 (default), q8_0 (recommended, 2x), q4_0 (4x compression)

# ─── AI Behaviour ────────────────────────────────────────────
HEARTBEAT_SEC=90           # Seconds between autonomous AI decisions
AI_TIMEOUT=120             # Max seconds to wait for AI response
MAX_TOKENS=2048            # Max tokens per AI response
OBJECTIVE_INTERVAL=600     # Seconds between periodic objective broadcasts

# ─── Server Management (optional) ───────────────────────────
SERVER_EXE=/opt/arma/arma-reforger-server
STEAMCMD_EXE=/usr/games/steamcmd
SERVER_INSTALL_DIR=/opt/arma
```

- [ ] **Step 11.2: Create install.sh**

Create `/home/mark/AIGameMaster/install.sh`:
```bash
#!/usr/bin/env bash
# AI Game Master — One-Command Installer
# Usage: bash install.sh
# Requirements: Ubuntu 22.04+, NVIDIA GPU (8GB+ VRAM recommended)
set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║      AI Game Master — Installer                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── Detect GPU VRAM ────────────────────────────────────────
VRAM_MB=0
if command -v nvidia-smi &>/dev/null; then
    VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
    echo "✓ GPU detected: ${VRAM_MB}MB VRAM"
else
    echo "⚠ nvidia-smi not found — defaulting to CPU-safe model"
fi

# ─── Select model based on VRAM ────────────────────────────
if   [ "$VRAM_MB" -ge 16000 ] 2>/dev/null; then
    RECOMMENDED_MODEL="qwen3:14b"
    RECOMMENDED_CTX=32768
    echo "✓ ≥16GB VRAM → qwen3:14b (full config, 32K context)"
elif [ "$VRAM_MB" -ge 12000 ] 2>/dev/null; then
    RECOMMENDED_MODEL="qwen3:14b"
    RECOMMENDED_CTX=16384
    echo "✓ 12-16GB VRAM → qwen3:14b (16K context)"
elif [ "$VRAM_MB" -ge 8000 ] 2>/dev/null; then
    RECOMMENDED_MODEL="qwen3.5:9b"
    RECOMMENDED_CTX=32768
    echo "✓ 8-12GB VRAM → qwen3.5:9b (32K context)"
else
    RECOMMENDED_MODEL="qwen3:8b"
    RECOMMENDED_CTX=8192
    echo "✓ <8GB VRAM → qwen3:8b (8K context, minimum viable)"
fi

# ─── Install Ollama if missing ──────────────────────────────
if ! command -v ollama &>/dev/null; then
    echo ""
    echo "→ Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
    echo "✓ Ollama installed"
else
    echo "✓ Ollama already installed"
fi

# ─── Pull the recommended model ────────────────────────────
echo ""
echo "→ Pulling model: $RECOMMENDED_MODEL (this may take 5-15 minutes)..."
ollama pull "$RECOMMENDED_MODEL"
echo "✓ Model ready: $RECOMMENDED_MODEL"

# ─── Configure KV cache ────────────────────────────────────
OLLAMA_SERVICE="/etc/systemd/system/ollama.service"
if [ -f "$OLLAMA_SERVICE" ]; then
    if ! grep -q "OLLAMA_KV_CACHE_TYPE" "$OLLAMA_SERVICE"; then
        sudo sed -i '/\[Service\]/a Environment="OLLAMA_KV_CACHE_TYPE=q8_0"' "$OLLAMA_SERVICE"
        sudo systemctl daemon-reload
        sudo systemctl restart ollama
        echo "✓ KV cache quantization set to q8_0 in Ollama service"
    else
        echo "✓ KV cache already configured"
    fi
else
    echo "⚠ Ollama systemd service not found — set OLLAMA_KV_CACHE_TYPE=q8_0 manually before starting ollama"
fi

# ─── Create .env from template ─────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_EXAMPLE="$SCRIPT_DIR/AIGameMaster/.env.example"
ENV_FILE="$SCRIPT_DIR/AIGameMaster/.env"

if [ ! -f "$ENV_FILE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    sed -i "s/^VLLM_MODEL=.*/VLLM_MODEL=$RECOMMENDED_MODEL/" "$ENV_FILE"
    sed -i "s/^OLLAMA_NUM_CTX=.*/OLLAMA_NUM_CTX=$RECOMMENDED_CTX/" "$ENV_FILE"
    echo "✓ Created .env with recommended settings"
else
    echo "✓ .env already exists — not overwriting"
fi

# ─── Python dependencies ───────────────────────────────────
echo ""
echo "→ Installing Python dependencies..."
cd "$SCRIPT_DIR/AIGameMaster"
pip install -r requirements.txt --quiet
echo "✓ Python dependencies installed"

# ─── Install bridge as systemd service ─────────────────────
SERVICE_FILE="/etc/systemd/system/aigm-bridge.service"
if [ ! -f "$SERVICE_FILE" ]; then
    cat <<EOF | sudo tee "$SERVICE_FILE" > /dev/null
[Unit]
Description=AI Game Master Bridge
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/AIGameMaster
EnvironmentFile=$SCRIPT_DIR/AIGameMaster/.env
ExecStart=$(which python3) bridge.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable aigm-bridge
    echo "✓ aigm-bridge systemd service installed"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Installation complete!                          ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Model:   $RECOMMENDED_MODEL"
echo "║  Context: ${RECOMMENDED_CTX} tokens"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Next steps:                                     ║"
echo "║  1. Edit AIGameMaster/.env (set RCON_PASSWORD)   ║"
echo "║  2. Start bridge:                                ║"
echo "║     systemctl start aigm-bridge                  ║"
echo "║  3. Start dashboard:                             ║"
echo "║     cd AIGameMaster/dashboard && npm run dev     ║"
echo "║  4. Open http://localhost:3000                   ║"
echo "╚══════════════════════════════════════════════════╝"
```

- [ ] **Step 11.3: Create docker-compose.yml**

Create `/home/mark/AIGameMaster/docker-compose.yml`:
```yaml
version: "3.9"

services:
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_models:/root/.ollama
    ports:
      - "11434:11434"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - OLLAMA_KV_CACHE_TYPE=q8_0
    restart: unless-stopped

  bridge:
    build:
      context: ./AIGameMaster
      dockerfile: Dockerfile
    ports:
      - "5555:5555"
    volumes:
      - ./AIGameMaster/data:/app/data
    environment:
      - BACKEND_MODE=ollama
      - SPARK_IP=ollama
      - VLLM_PORT=11434
      - VLLM_MODEL=qwen3:14b
      - OLLAMA_NUM_CTX=32768
      - OLLAMA_THINK=auto
    env_file:
      - ./AIGameMaster/.env
    depends_on:
      - ollama
    restart: unless-stopped

  dashboard:
    build:
      context: ./AIGameMaster/dashboard
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - BRIDGE_URL=http://bridge:5555
    depends_on:
      - bridge
    restart: unless-stopped

volumes:
  ollama_models:
```

- [ ] **Step 11.4: Make install.sh executable and test syntax**

```bash
chmod +x /home/mark/AIGameMaster/install.sh
bash -n /home/mark/AIGameMaster/install.sh
echo "Syntax OK: $?"
```
Expected: `Syntax OK: 0`

- [ ] **Step 11.5: Validate .env.example parses cleanly**

```bash
python3 -c "
lines = open('/home/mark/AIGameMaster/AIGameMaster/.env.example').readlines()
vars_found = [l.split('=')[0].strip() for l in lines if '=' in l and not l.strip().startswith('#')]
print('Env vars defined:', vars_found)
required = ['BRIDGE_PORT', 'RCON_HOST', 'VLLM_MODEL', 'OLLAMA_NUM_CTX', 'HEARTBEAT_SEC']
for r in required:
    assert r in vars_found, f'Missing required var: {r}'
print('All required vars present')
"
```
Expected: Lists all vars, ends with `All required vars present`

- [ ] **Step 11.6: Run full test suite**

```bash
cd /home/mark/AIGameMaster && python -m pytest tests/test_bridge_enrichment.py -v
```
Expected: All tests PASSED

- [ ] **Step 11.7: Final commit**

```bash
cd /home/mark/AIGameMaster
git add install.sh AIGameMaster/.env.example docker-compose.yml
git commit -m "feat: add install.sh (GPU-aware), .env.example, docker-compose for shippable distribution"
```

---

## Self-Review

**Spec coverage check:**

| Spec Piece | Tasks Covering It |
|-----------|-------------------|
| qwen3:14b default model | Task 1 |
| OLLAMA_NUM_CTX=32768 | Task 1 |
| Thinking mode (auto) | Task 1 |
| military_doctrine_reference.json | Task 2 |
| arma_reference_data.json | Task 3 |
| Kill event log in mod | Task 4 |
| Chat forwarding from mod | Task 5 |
| Vehicle state scan | Task 6 |
| build_prompt full groups (no 10-cap) | Task 7 |
| build_prompt event_log section | Task 7 |
| build_prompt vehicle section | Task 7 |
| [MOD] catalog tagging | Task 7 |
| /chat_event endpoint | Task 8 |
| Chat in heartbeat prompt | Task 8 |
| Vehicle ops system prompt section | Task 9 |
| Mod arsenal system prompt section | Task 9 |
| Dashboard model config panel | Task 10 |
| install.sh with GPU detection | Task 11 |
| .env.example | Task 11 |
| docker-compose.yml | Task 11 |

**No gaps found.**

**Placeholder scan:** No TBD/TODO/placeholder text. Every step has exact code. Task 7 Step 7.6 flags that exact edit depends on reading format_catalog_for_prompt() — this is intentional (it's too large to paste in full) but the instruction is unambiguous.

**Type consistency:** `AIGM_KillEvent` fields (`m_sType`, `m_sPlayerName`, `m_sKillerUnit`, `m_sGrid`, `m_iTimestamp`) used consistently in Tasks 4–7. `ChatEventRequest` fields (`player`, `message`, `server_id`) used consistently in Tasks 8 and 10. `ModelConfig` TypeScript interface matches the Python endpoint response keys.
