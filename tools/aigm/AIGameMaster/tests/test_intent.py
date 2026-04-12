# tests/test_intent.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from data.intent import (classify_intent, resolve_player_faction, get_friendly_units,
                          get_enemy_units, build_friendly_support_commands, pick_support_grid)

SAMPLE_PLAYERS = [
    {"name": "gaz", "faction": "US", "pos": {"x": 4500, "y": 0, "z": 6200}, "status": "alive"},
    {"name": "price", "faction": "US", "pos": {"x": 4600, "y": 0, "z": 6300}, "status": "alive"},
    {"name": "soap", "faction": "FIA", "pos": {"x": 5000, "y": 0, "z": 5500}, "status": "alive"},
]

SAMPLE_CATALOG = [
    {"name": "Group_US_Rifle_Squad", "faction": "US", "category": "group", "role": "BLUFOR"},
    {"name": "Group_US_Sniper", "faction": "US", "category": "group", "role": "BLUFOR"},
    {"name": "Group_USSR_Rifle_Squad", "faction": "USSR", "category": "group", "role": "OPFOR"},
    {"name": "Group_FIA_Infantry", "faction": "FIA", "category": "group", "role": "INDFOR"},
    {"name": "Vehicle_US_Humvee", "faction": "US", "category": "vehicle", "role": "BLUFOR"},
    {"name": "CIV_Pedestrian", "faction": "CIV", "category": "character", "role": "CIV"},
]

def test_classify_friendly_support_with_player_name():
    result = classify_intent("send gaz backup", SAMPLE_PLAYERS)
    assert result["intent"] == "FRIENDLY_SUPPORT"
    assert result["target_player"]["name"] == "gaz"

def test_classify_friendly_support_no_name():
    result = classify_intent("send me backup", SAMPLE_PLAYERS)
    assert result["intent"] == "FRIENDLY_SUPPORT"
    assert result["target_player"] is None

def test_classify_info_query():
    result = classify_intent("where is gaz", SAMPLE_PLAYERS)
    assert result["intent"] == "INFO_QUERY"

def test_classify_enemy_action():
    result = classify_intent("ambush players from the east", SAMPLE_PLAYERS)
    assert result["intent"] == "ENEMY_ACTION"

def test_classify_phase_advance():
    result = classify_intent("skip to next phase", SAMPLE_PLAYERS)
    assert result["intent"] == "PHASE_ADVANCE"

def test_classify_operation_mod_abort():
    result = classify_intent("abort the operation", SAMPLE_PLAYERS)
    assert result["intent"] == "OPERATION_MOD"
    assert result["mod_action"] == "abort"

def test_classify_new_operation():
    result = classify_intent("start a new operation", SAMPLE_PLAYERS)
    assert result["intent"] == "NEW_OPERATION"

def test_resolve_player_faction_found():
    faction = resolve_player_faction("gaz", SAMPLE_PLAYERS)
    assert faction == "US"

def test_resolve_player_faction_not_found():
    faction = resolve_player_faction("unknown", SAMPLE_PLAYERS)
    assert faction is None

def test_get_friendly_units_by_faction():
    units = get_friendly_units("US", SAMPLE_CATALOG)
    names = [u["name"] for u in units]
    assert "Group_US_Rifle_Squad" in names
    assert "Group_US_Sniper" in names
    assert "Vehicle_US_Humvee" not in names  # vehicles excluded by default
    assert "Group_USSR_Rifle_Squad" not in names

def test_get_friendly_units_excludes_civ():
    units = get_friendly_units("CIV", SAMPLE_CATALOG)
    assert units == []  # CIV never spawned as combat

def test_classify_respects_message_case():
    result = classify_intent("SEND GAZ BACKUP", SAMPLE_PLAYERS)
    assert result["intent"] == "FRIENDLY_SUPPORT"
    assert result["target_player"]["name"] == "gaz"


def test_pick_support_grid_basic():
    """Returns a string in NNN-NNN format."""
    result = pick_support_grid({"x": 4500, "z": 6200})
    parts = result.split("-")
    assert len(parts) == 2, f"Expected NNN-NNN format, got: {result!r}"
    assert parts[0].isdigit() and parts[1].isdigit(), f"Non-numeric parts in: {result!r}"


def test_pick_support_grid_edge_clamp():
    """Player at near-origin: x offset must not go negative."""
    result = pick_support_grid({"x": 1, "z": 1})
    parts = result.split("-")
    assert len(parts) == 2
    assert int(parts[0]) >= 0, f"x grid went negative: {result!r}"
    assert int(parts[1]) >= 0, f"z grid went negative: {result!r}"


def test_get_enemy_units_excludes_player_faction_and_civ():
    """Player faction US — should get USSR only, not CIV."""
    catalog = [
        {"name": "Group_US_Rifle_Squad", "faction": "US", "category": "group", "role": "BLUFOR"},
        {"name": "Group_USSR_Rifle_Squad", "faction": "USSR", "category": "group", "role": "OPFOR"},
        {"name": "CIV_Pedestrian", "faction": "CIV", "category": "character", "role": "CIV"},
    ]
    units = get_enemy_units({"US"}, catalog)
    factions = {u["faction"] for u in units}
    assert "USSR" in factions
    assert "US" not in factions
    assert "CIV" not in factions


def test_build_friendly_support_commands_basic():
    """Valid target with position and matching catalog entry returns SPAWN + BROADCAST."""
    import random as _random
    _random.seed(0)
    catalog = [
        {"name": "Group_US_Rifle_Squad", "faction": "US", "category": "group", "role": "BLUFOR"},
    ]
    players = [{"name": "gaz", "faction": "US", "pos": {"x": 4500, "z": 6200}, "status": "alive"}]
    target = players[0]
    result = build_friendly_support_commands(target, players, catalog)
    assert len(result) == 2
    assert result[0]["type"] == "SPAWN"
    assert result[1]["type"] == "BROADCAST"


def test_classify_abort_not_hijacked_by_what():
    """'what the hell, abort everything' must return OPERATION_MOD, not INFO_QUERY."""
    result = classify_intent("what the hell, abort everything", [])
    assert result["intent"] == "OPERATION_MOD"


def test_classify_enemy_action_empty_players():
    """'attack' with empty player list returns ENEMY_ACTION with no crash."""
    result = classify_intent("attack", [])
    assert result["intent"] == "ENEMY_ACTION"
    assert result["target_player"] is None


def test_classify_info_query_no_question_mark():
    """INFO_QUERY should fire for _INFO_KW terms even without '?'."""
    assert classify_intent("give me a sitrep", [])["intent"] == "INFO_QUERY"
    assert classify_intent("gaz location", SAMPLE_PLAYERS)["intent"] == "INFO_QUERY"
