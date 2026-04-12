# data/prompts.py
"""
Four AI prompt builders for the AI GM system.
Each prompt is focused on one decision type — no monolithic catch-all.
"""
import json
import random
from typing import Optional


def _compact_players(players: list) -> str:
    lines = []
    for p in players:
        px = float(p.get("pos", {}).get("x", 0))
        pz = float(p.get("pos", {}).get("z", p.get("pos", {}).get("y", 0)))
        gx, gz = int(px / 100), int(pz / 100)
        grid = f"{gx:03d}-{gz:03d}"
        lines.append(f"{p.get('name','?')} ({p.get('faction','?')}) @ {grid} [{p.get('status','?')}]")
    return ", ".join(lines) or "none"


def _compact_groups(groups: list) -> str:
    lines = []
    for g in groups:
        gid = g.get("group_id", "?")
        lines.append(
            f"{gid}: {g.get('type','?')}x{g.get('count','?')} "
            f"@ {g.get('grid','?')} [{g.get('behavior','?')}]"
        )
    return "\n".join(lines) or "none"


def _catalog_by_faction(catalog: list) -> str:
    by_faction: dict[str, list] = {}
    for e in catalog:
        f = e.get("faction", "Unknown")
        if f not in by_faction:
            by_faction[f] = []
        if e.get("category") == "group":
            name = e.get("name")
            if name:
                by_faction[f].append(name)
    parts = []
    for faction, names in sorted(by_faction.items()):
        if faction != "CIV" and names:
            parts.append(f"{faction}: {', '.join(names[:10])}")
    return "\n".join(parts) or "No catalog available (join server first)"


def _sample_grids(valid_grids: list, n: int = 10) -> str:
    if not valid_grids:
        return "XXX-YYY (use player-proximate grids)"
    sample = random.sample(valid_grids, min(n, len(valid_grids)))
    return ", ".join(sample)


def build_planner_messages(state: dict) -> list[dict]:
    """
    Prompt 1 — Operation Planner.
    Called once when no active operation and players are present.
    Think mode ON, budget 4096 tokens.
    Returns OpenAI-compatible messages list.
    """
    players = state.get("players", [])
    catalog = state.get("catalog", [])
    map_name = state.get("map", "Unknown")
    player_count = len(players)
    ai_active = state.get("ai_units", {}).get("active", 0)
    ai_max = state.get("ai_units", {}).get("max", 40)
    grids = _sample_grids(state.get("valid_spawn_grids", []), 15)
    factions_str = _catalog_by_faction(catalog)

    # Detect player factions — these are FRIENDLY, never spawn as enemies
    player_factions = list({p.get("faction") for p in players if p.get("faction") and p.get("faction") != "CIV"})
    enemy_hint = ""
    if player_factions:
        enemy_hint = (f"\nPLAYER FACTIONS: {', '.join(player_factions)} — these are FRIENDLY. "
                      f"Spawn enemies from OTHER factions only.")

    system = f"""You are Zeus, an AI Game Master for Arma Reforger.
Design a complete military operation for {player_count} player(s) on {map_name}.

## Your Output
Return ONLY a JSON object matching this schema exactly:
{{
  "name": "Operation [Name]",
  "broadcast_mode": "guided|command|silent",
  "commander_intent": "End state in one sentence",
  "roe": "Rules of engagement one sentence",
  "code_words": {{"CHECKMATE": "operation_complete", "WILDFIRE": "abort_extract"}},
  "phases": [
    {{
      "name": "Phase name",
      "objective": "Specific task at specific location",
      "duration_minutes": 10,
      "forces": [
        {{"units": "EXACT_PREFAB_NAME", "count": 2, "grid": "XXX-YYY",
          "behavior": "patrol|defend|ambush|patrol|hunt", "group_id": null}}
      ],
      "broadcasts": [
        {{"message": "[ZEUS] Message text", "visibility": "guided|command|silent",
          "trigger": "phase_start|time_elapsed"}}
      ],
      "advance_trigger": "time_elapsed OR players_within_300m",
      "escalation": "Optional: what to add if players are dominating"
    }}
  ]
}}

## Rules
- 3-4 phases: recon/staging -> main contact -> escalation -> resolution
- Forces must use EXACT prefab names from the catalog below
- Enemy forces must come from NON-player factions only{enemy_hint}
- Scale forces to {player_count} player(s): aim for ≤3 groups per player per phase
- AI budget: {ai_active}/{ai_max} active. Respect the cap.
- Spawn grids available: {grids}
- Include 1 BROADCAST per phase at minimum
- Output ONLY the JSON object — no text before or after"""

    user = f"""Design the operation now.

PLAYERS: {_compact_players(players)}
MAP: {map_name}

AVAILABLE UNITS BY FACTION:
{factions_str}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_opord_parser_messages(opord: dict, state: dict) -> list[dict]:
    """
    Prompt 2 — OPORD Parser.
    Called once when GM loads a written OPORD.
    Think mode ON, budget 4096 tokens.
    """
    catalog = state.get("catalog", [])
    factions_str = _catalog_by_faction(catalog)
    grids = _sample_grids(state.get("valid_spawn_grids", []), 15)

    opord_text = json.dumps(opord, indent=2)

    system = f"""You are Zeus, an AI Game Master for Arma Reforger.
Parse the provided OPORD into an executable operation plan.

## Your Output
Return ONLY a JSON object matching this schema exactly:
{{
  "name": "Operation name from OPORD",
  "broadcast_mode": "guided|command|silent",
  "commander_intent": "Commander's intent verbatim",
  "roe": "ROE verbatim",
  "code_words": {{"WORD": "effect"}},
  "phases": [
    {{
      "name": "Phase name",
      "objective": "Specific grid or location",
      "duration_minutes": 10,
      "forces": [
        {{"units": "EXACT_PREFAB_NAME", "count": 2, "grid": "XXX-YYY",
          "behavior": "patrol|defend|ambush|hunt", "group_id": null}}
      ],
      "broadcasts": [
        {{"message": "[ZEUS] Text", "visibility": "guided|command|silent",
          "trigger": "phase_start"}}
      ],
      "advance_trigger": "time_elapsed OR players_within_300m",
      "escalation": null
    }}
  ]
}}

## Rules
- Preserve commander's intent and ROE VERBATIM
- Map force descriptions (e.g. "2x infantry patrol") to EXACT prefab names from catalog
- If no catalog match exists for a force, skip it and do NOT invent a name
- Phase triggers from OPORD phase lines map to: "phase_line_X" or "players_within_Nm"
- Code words from Paragraph 5 go in code_words dict, effect is always "operation_complete" for completion words
- Output ONLY the JSON object

AVAILABLE UNITS:
{factions_str}

VALID SPAWN GRIDS: {grids}"""

    user = f"""Parse this OPORD:\n\n{opord_text}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_executor_messages(
    state: dict,
    current_phase,   # OperationPhase
    commander_intent: str,
    roe: str,
) -> list[dict]:
    """
    Prompt 3 — Tactical Executor.
    Called every heartbeat inside ACTIVE phase.
    Think mode OFF, budget 1024 tokens.
    """
    groups = state.get("ai_units", {}).get("groups", [])
    ai_active = state.get("ai_units", {}).get("active", 0)
    ai_max = state.get("ai_units", {}).get("max", 40)
    players = state.get("players", [])
    events = state.get("event_log", [])[-5:]
    grids = _sample_grids(state.get("valid_spawn_grids", []), 8)

    event_lines = []
    for ev in events:
        etype = ev.get("type", "?")
        if etype == "PLAYER_KILLED":
            event_lines.append(f"PLAYER_KILLED: {ev.get('player','?')} at {ev.get('grid','?')}")
        elif etype == "AI_GROUP_WIPED":
            event_lines.append(f"AI_WIPED: {ev.get('killer_unit','?')}")
        elif etype == "PLAYER_RESPAWN":
            event_lines.append(f"PLAYER_RESPAWN: {ev.get('player','?')}")
    events_str = "\n".join(event_lines) or "none"

    headroom = max(0, min(ai_max - ai_active, len(players) * 3 - ai_active))
    system = f"""You are Zeus, AI Game Master for Arma Reforger.
You are executing Phase: {current_phase.name}
Phase objective: {current_phase.objective}
Commander's intent: {commander_intent or "Defeat enemy forces"}
ROE: {roe or "Engage all hostile forces"}

## Your Job
Manage existing forces within this phase. Issue 2-4 commands.
DO NOT advance the phase — that is handled automatically.
DO NOT spawn large numbers — budget is tight.

## Command Format (JSON array)
[
  {{"type":"SPAWN","units":"EXACT_NAME","count":N,"grid":"XXX-YYY","behavior":"patrol","faction":"USSR","reasoning":"why"}},
  {{"type":"SET_BEHAVIOR","group_id":"grp_001","behavior":"attack","grid":"XXX-YYY","reasoning":"why"}},
  {{"type":"MOVE","group_id":"grp_001","grid":"XXX-YYY","behavior":"defend","reasoning":"why"}},
  {{"type":"REINFORCE","units":"EXACT_NAME","count":N,"grid":"XXX-YYY","reasoning":"why"}},
  {{"type":"DELETE","group_id":"grp_001","reasoning":"why"}},
  {{"type":"BROADCAST","message":"[ZEUS] text","visibility":"guided|command|silent"}}
]

## Decision Priority
1. Fix in-contact groups with passive behavior → SET_BEHAVIOR attack/hunt
2. Move idle groups far from objective → MOVE toward objective
3. Reinforce weakened groups below 40% → REINFORCE
4. Spawn ONLY if a specific role is missing (no overwatch, no flanker)

Budget: {ai_active}/{ai_max}. Headroom: {headroom} groups.
Grids: {grids}

Output ONLY the JSON array."""

    user = f"""ACTIVE FORCES:
{_compact_groups(groups)}

PLAYERS:
{_compact_players(players)}

RECENT EVENTS:
{events_str}

Issue orders now."""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_chat_messages(
    state: dict,
    player_message: str,
    current_phase,  # OperationPhase or None
    chat_history: Optional[list] = None,
) -> list[dict]:
    """
    Prompt 4 — Chat Interpreter.
    Called for ENEMY_ACTION and NEW_OPERATION intents only.
    Think mode OFF, budget 1024 tokens.
    """
    players = state.get("players", [])
    catalog = state.get("catalog", [])
    groups = state.get("ai_units", {}).get("groups", [])
    grids = _sample_grids(state.get("valid_spawn_grids", []), 8)

    # Build separate OPFOR and BLUFOR catalogs
    player_factions = {p.get("faction") for p in players if p.get("faction") and p.get("faction") != "CIV"}
    opfor_names = [e["name"] for e in catalog
                   if e.get("category") == "group" and e.get("name")
                   and e.get("faction") not in player_factions
                   and e.get("faction") != "CIV"][:12]
    blufor_names = [e["name"] for e in catalog
                    if e.get("category") == "group" and e.get("name")
                    and e.get("faction") in player_factions][:8]

    phase_ctx = ""
    if current_phase:
        phase_ctx = f"\nActive phase: {current_phase.name} — {current_phase.objective}"

    system = f"""You are Zeus, AI Game Master for Arma Reforger.
Execute the player's command using available forces.{phase_ctx}

PLAYERS: {_compact_players(players)}
ACTIVE FORCES: {_compact_groups(groups)}
GRIDS: {grids}

OPFOR UNITS (enemies): {', '.join(opfor_names) or 'none'}
BLUFOR UNITS (friendly to players): {', '.join(blufor_names) or 'none'}

## Output — JSON array, 2-3 commands max
[
  {{"type":"SPAWN","units":"EXACT_NAME","count":N,"grid":"XXX-YYY","behavior":"patrol","faction":"USSR|US|FIA","reasoning":"why"}},
  {{"type":"MOVE","group_id":"grp_001","grid":"XXX-YYY","behavior":"attack","reasoning":"why"}},
  {{"type":"BROADCAST","message":"[ZEUS] text","visibility":"guided|command|silent"}}
]

For support/backup requests: use BLUFOR UNITS, spawn near the requesting player.
For attack requests: use OPFOR UNITS, work within active phase context.
Output ONLY the JSON array."""

    messages = [{"role": "system", "content": system}]

    # Include last 10 exchanges of chat history
    if chat_history:
        for h in chat_history[-10:]:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": player_message})
    return messages
