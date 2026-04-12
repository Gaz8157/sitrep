# tests/test_operation.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import time
from data.operation import Operation, OperationPhase, OperationStateMachine

SAMPLE_PHASE = {
    "name": "Recon Screen",
    "objective": "Patrol presence at grid 450-620",
    "duration_minutes": 10,
    "forces": [
        {"units": "Group_USSR_Rifle_Squad", "count": 2,
         "grid": "448-622", "behavior": "patrol", "group_id": None}
    ],
    "broadcasts": [
        {"message": "INTEL: Checkpoint active.", "visibility": "command", "trigger": "phase_start"}
    ],
    "advance_trigger": "time_elapsed",
    "escalation": None,
}

def test_operation_creation():
    op = Operation(
        name="Operation Iron Gate",
        source="ai_generated",
        phases=[OperationPhase(**SAMPLE_PHASE)],
    )
    assert op.state == "STAGING"
    assert op.phase_index == 0
    assert op.operation_id.startswith("op_")

def test_phase_advance():
    op = Operation(
        name="Test Op",
        source="ai_generated",
        phases=[OperationPhase(**SAMPLE_PHASE),
                OperationPhase(**{**SAMPLE_PHASE, "name": "Phase 2"})],
    )
    op.state = "ACTIVE"
    op.advance_phase("time_elapsed")
    assert op.phase_index == 1
    assert len(op.phase_results) == 1
    assert op.phase_results[0]["phase"] == "Recon Screen"

def test_operation_completes_on_last_phase():
    op = Operation(
        name="Test Op",
        source="ai_generated",
        phases=[OperationPhase(**SAMPLE_PHASE)],
    )
    op.state = "ACTIVE"
    op.advance_phase("time_elapsed")
    assert op.state == "COMPLETE"

def test_state_machine_transition_idle_to_planning():
    sm = OperationStateMachine("server-1")
    assert sm.state == "IDLE"
    sm.begin_planning()
    assert sm.state == "PLANNING"

def test_state_machine_no_active_op_initially():
    sm = OperationStateMachine("server-1")
    assert sm.active_operation is None

def test_phase_advance_trigger_time_elapsed():
    phase = OperationPhase(**SAMPLE_PHASE)
    # Backdating phase_start so elapsed > duration
    op = Operation(name="T", source="ai_generated", phases=[phase])
    op.state = "ACTIVE"
    op.phase_start_time = time.time() - 700  # 11+ minutes ago, phase is 10 min
    assert op.should_advance_by_time() is True

def test_phase_not_advance_too_early():
    phase = OperationPhase(**SAMPLE_PHASE)
    op = Operation(name="T", source="ai_generated", phases=[phase])
    op.state = "ACTIVE"
    op.phase_start_time = time.time() - 30  # 30s ago, phase is 10 min
    assert op.should_advance_by_time() is False
