# tests/test_prompts.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from data.prompts import (
    build_planner_messages, build_opord_parser_messages,
    build_executor_messages, build_chat_messages,
)

SAMPLE_STATE = {
    "map": "Everon", "player_count": 2, "server_id": "server-1",
    "players": [
        {"name": "gaz", "faction": "US",
         "pos": {"x": 4500, "y": 0, "z": 6200}, "status": "alive"},
        {"name": "price", "faction": "US",
         "pos": {"x": 4600, "y": 0, "z": 6300}, "status": "alive"},
    ],
    "ai_units": {"active": 4, "max": 40, "groups": [
        {"group_id": "grp_001", "type": "Group_USSR_Rifle_Squad",
         "grid": "445-618", "behavior": "patrol", "count": 4},
    ]},
    "catalog": [
        {"name": "Group_USSR_Rifle_Squad", "faction": "USSR",
         "category": "group", "role": "OPFOR"},
        {"name": "Group_US_Rifle_Squad", "faction": "US",
         "category": "group", "role": "BLUFOR"},
    ],
    "factions": [
        {"key": "US", "role": "BLUFOR"},
        {"key": "USSR", "role": "OPFOR"},
    ],
    "valid_spawn_grids": ["445-620", "448-622", "451-619"],
    "engagement_intensity": 0.2,
}

SAMPLE_PHASE = {
    "name": "Recon Screen", "objective": "Patrol grid 450-620",
    "duration_minutes": 10, "forces": [], "broadcasts": [],
    "advance_trigger": "time_elapsed", "escalation": None,
}

SAMPLE_OPORD = {
    "situation": {"enemy_forces": "USSR company at Mista Dolina"},
    "mission": {"statement": "Seize Mista Dolina", "intent": "Disrupt supply lines"},
    "execution": {"concept": "Phased assault", "phases": [SAMPLE_PHASE]},
    "admin": {"resupply": "Grid 440-610"},
    "command": {"code_words": {"CHECKMATE": "operation_complete"}},
}

def test_planner_messages_returns_list():
    msgs = build_planner_messages(SAMPLE_STATE)
    assert isinstance(msgs, list)
    assert msgs[0]["role"] == "system"
    assert msgs[-1]["role"] == "user"

def test_planner_messages_no_enemy_only_restriction():
    msgs = build_planner_messages(SAMPLE_STATE)
    full_text = " ".join(m["content"] for m in msgs)
    assert "NEVER spawn" not in full_text  # old hardblock must be gone
    assert "FRIENDLY" in full_text  # positive hint must be present
    assert "US" in full_text  # player faction should be identified

def test_planner_mentions_player_count():
    msgs = build_planner_messages(SAMPLE_STATE)
    full_text = " ".join(m["content"] for m in msgs)
    assert "2" in full_text  # player count

def test_opord_parser_messages_includes_opord():
    msgs = build_opord_parser_messages(SAMPLE_OPORD, SAMPLE_STATE)
    full_text = " ".join(m["content"] for m in msgs)
    assert "Mista Dolina" in full_text
    assert "Seize" in full_text

def test_opord_parser_includes_catalog():
    msgs = build_opord_parser_messages(SAMPLE_OPORD, SAMPLE_STATE)
    full_text = " ".join(m["content"] for m in msgs)
    assert "Group_USSR_Rifle_Squad" in full_text

def test_executor_messages_includes_phase():
    from data.operation import OperationPhase
    phase = OperationPhase(**SAMPLE_PHASE)
    msgs = build_executor_messages(SAMPLE_STATE, phase, "Disrupt supply lines", "No civilian casualties")
    full_text = " ".join(m["content"] for m in msgs)
    assert "Recon Screen" in full_text
    assert "Patrol grid 450-620" in full_text

def test_executor_messages_no_plan_phase():
    """Executor must be told not to advance phase — state machine handles that."""
    from data.operation import OperationPhase
    phase = OperationPhase(**SAMPLE_PHASE)
    msgs = build_executor_messages(SAMPLE_STATE, phase, "", "")
    full_text = " ".join(m["content"] for m in msgs)
    assert "do not advance" in full_text.lower() or "not advance" in full_text.lower()

def test_chat_messages_includes_player_request():
    msgs = build_chat_messages(SAMPLE_STATE, "attack from the north", None)
    full_text = " ".join(m["content"] for m in msgs)
    assert "attack from the north" in full_text

def test_chat_messages_includes_both_catalogs():
    msgs = build_chat_messages(SAMPLE_STATE, "attack", None)
    full_text = " ".join(m["content"] for m in msgs)
    assert "Group_USSR_Rifle_Squad" in full_text
    assert "Group_US_Rifle_Squad" in full_text
