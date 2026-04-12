# data/intent.py
"""
Intent classifier and faction resolver for AI GM chat pipeline.
Rules-based — no AI model required.
"""
from typing import Optional
import math
import random

# Keywords that indicate each intent type
_FRIENDLY_KW = {"backup", "support", "help", "reinforce", "reinforcement",
                "troops", "send", "qrf", "extract", "medevac", "evac"}
_INFO_KW = {"where", "find", "location", "position", "coordinates",
            "sitrep", "status", "report"}
_PHASE_ADVANCE_KW = {"skip", "advance", "next phase", "phase advance",
                     "move on", "proceed"}
_ABORT_KW = {"abort", "cancel", "stop", "cease", "end operation",
             "halt", "stand down"}
_NEW_OP_KW = {"new operation", "start operation", "begin operation",
              "plan operation", "new op", "start op"}
_ENEMY_KW = {"attack", "flank", "ambush", "hunt", "deploy", "assault",
             "spawn", "send enemies", "push", "encircle", "engage",
             "patrol", "defend", "checkpoint", "sniper", "armor",
             "north", "south", "east", "west"}

VANILLA_FACTIONS = {"US", "USSR", "FIA", "CIV"}


def _find_player_in_message(message: str, players: list) -> Optional[dict]:
    """Check if any player name appears in the message (case-insensitive)."""
    msg_lower = message.lower()
    for player in players:
        name = player.get("name", "").lower()
        if name and name in msg_lower:
            return player
    return None


def classify_intent(message: str, players: list) -> dict:
    """
    Classify a chat message into one of 6 intent categories.

    Returns dict with:
      intent: FRIENDLY_SUPPORT | INFO_QUERY | OPERATION_MOD |
              PHASE_ADVANCE | ENEMY_ACTION | NEW_OPERATION
      target_player: player dict if a player name found, else None
      mod_action: "abort" | "hold" | None (for OPERATION_MOD)
    """
    msg = message.lower().strip()
    target_player = _find_player_in_message(msg, players)

    # NEW_OPERATION — check before others (longer phrases)
    if any(kw in msg for kw in _NEW_OP_KW):
        return {"intent": "NEW_OPERATION", "target_player": None, "mod_action": None}

    # PHASE_ADVANCE
    if any(kw in msg for kw in _PHASE_ADVANCE_KW):
        return {"intent": "PHASE_ADVANCE", "target_player": None, "mod_action": None}

    # OPERATION_MOD — abort/cancel/hold
    if any(kw in msg for kw in _ABORT_KW):
        return {"intent": "OPERATION_MOD", "target_player": None, "mod_action": "abort"}
    if "hold" in msg and ("all" in msg or "position" in msg or "fire" in msg):
        return {"intent": "OPERATION_MOD", "target_player": None, "mod_action": "hold"}

    # INFO_QUERY — location/status questions
    if any(kw in msg for kw in _INFO_KW):
        return {"intent": "INFO_QUERY", "target_player": target_player, "mod_action": None}

    # FRIENDLY_SUPPORT — backup/support keywords, especially with a player name
    friendly_hit = any(kw in msg for kw in _FRIENDLY_KW)
    if friendly_hit:
        # "send gaz backup" / "send backup" / "reinforce price"
        # Distinguish from "send enemies" / "send attack"
        enemy_hit = any(kw in msg for kw in _ENEMY_KW - {"send"})
        if not enemy_hit:
            return {"intent": "FRIENDLY_SUPPORT", "target_player": target_player,
                    "mod_action": None}

    # ENEMY_ACTION — default for tactical commands
    return {"intent": "ENEMY_ACTION", "target_player": target_player, "mod_action": None}


def resolve_player_faction(player_name: str, players: list) -> Optional[str]:
    """Look up a player's faction from the live players list."""
    name_lower = player_name.lower()
    for p in players:
        if p.get("name", "").lower() == name_lower:
            return p.get("faction")
    return None


def get_friendly_units(faction: str, catalog: list,
                       categories: tuple = ("group",)) -> list:
    """
    Return catalog entries matching the given faction and categories.
    CIV faction always returns empty (never spawned as combat).
    """
    if faction == "CIV":
        return []
    return [
        entry for entry in catalog
        if entry.get("faction") == faction
        and entry.get("category") in categories
    ]


def get_enemy_units(player_factions: set, catalog: list,
                    categories: tuple = ("group", "vehicle", "static_weapon")) -> list:
    """Return catalog entries NOT from player factions and NOT CIV."""
    return [
        entry for entry in catalog
        if entry.get("faction") not in player_factions
        and entry.get("faction") != "CIV"
        and entry.get("role") != "CIV"
        and entry.get("category") in categories
    ]


def pick_support_grid(player_pos: dict, offset_m: int = 200) -> str:
    """
    Return a grid 200m offset from the player position (NW direction).
    Used for friendly support spawn location.
    """
    px = float(player_pos.get("x", 0))
    pz = float(player_pos.get("z", player_pos.get("y", 0)))
    # Offset NW
    ox = max(0, px - offset_m)
    oz = max(0, pz + offset_m)
    return f"{int(ox / 100):03d}-{int(oz / 100):03d}"


def build_friendly_support_commands(
    target_player: Optional[dict],
    all_players: list,
    catalog: list,
    broadcast_mode: str = "command",
) -> list:
    """
    Build SPAWN + BROADCAST commands for a FRIENDLY_SUPPORT request.
    No AI model needed — fully deterministic.
    """
    commands = []

    # Determine target
    if target_player:
        targets = [target_player]
    else:
        targets = [p for p in all_players if p.get("status") == "alive"]

    if not targets:
        return []

    # Use first alive target for spawn grid
    target = targets[0]
    faction = target.get("faction")
    if not faction or faction == "CIV":
        return []

    friendly = get_friendly_units(faction, catalog, categories=("group",))
    if not friendly:
        return []

    # Pick one infantry group
    unit = random.choice(friendly[:5])  # Pick from top 5 to avoid exotic units

    grid = pick_support_grid(target.get("pos", {"x": 4500, "z": 6200}))
    target_name = target.get("name", "your position")

    commands.append({
        "type": "SPAWN",
        "units": unit["name"],
        "count": 2,
        "grid": grid,
        "behavior": "defend",
        "faction": faction,
        "reasoning": f"Friendly QRF for {target_name}",
    })
    commands.append({
        "type": "BROADCAST",
        "message": f"Friendly QRF en route to {target_name}.",
        "visibility": broadcast_mode,
    })
    return commands
