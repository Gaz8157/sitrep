# data/operation.py
"""
Operation data model and state machine for AI GM.
Replaces OperationPlanner with a full state machine that persists
operation state, tracks phases, and evaluates advance triggers.
"""
import time
from dataclasses import dataclass, field
from typing import Optional
import json
from pathlib import Path

OPS_DIR = Path(__file__).parent / "operations"
OPS_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class OperationPhase:
    name: str
    objective: str
    duration_minutes: int = 10
    forces: list = field(default_factory=list)
    broadcasts: list = field(default_factory=list)
    advance_trigger: str = "time_elapsed"
    escalation: Optional[str] = None

    def duration_seconds(self) -> int:
        return self.duration_minutes * 60


@dataclass
class Operation:
    name: str
    source: str  # "ai_generated" or "opord"
    phases: list  # list of OperationPhase
    operation_id: str = field(default_factory=lambda: f"op_{int(time.time())}")
    state: str = "STAGING"  # STAGING | ACTIVE | COMPLETE | ABORTED
    phase_index: int = 0
    phase_start_time: float = field(default_factory=time.time)
    start_time: float = field(default_factory=time.time)
    phase_results: list = field(default_factory=list)
    allocated_groups: dict = field(default_factory=dict)  # group_id -> {type, phase}
    player_targets: dict = field(default_factory=dict)  # name -> {faction, last_grid, status}
    code_words: dict = field(default_factory=dict)  # word -> effect
    broadcast_mode: str = "command"  # guided | command | silent
    source_opord: Optional[dict] = None
    commander_intent: str = ""
    roe: str = ""
    created_at: float = field(default_factory=time.time)

    def current_phase(self) -> Optional[OperationPhase]:
        if self.phase_index >= len(self.phases):
            return None
        return self.phases[self.phase_index]

    def should_advance_by_time(self) -> bool:
        phase = self.current_phase()
        if not phase:
            return False
        elapsed = time.time() - self.phase_start_time
        return elapsed >= phase.duration_seconds()

    def advance_phase(self, reason: str = "time_elapsed"):
        phase = self.current_phase()
        if phase:
            self.phase_results.append({
                "phase": phase.name,
                "reason": reason,
                "duration_s": int(time.time() - self.phase_start_time),
            })
        self.phase_index += 1
        self.phase_start_time = time.time()
        if self.phase_index >= len(self.phases):
            self.state = "COMPLETE"

    def time_in_phase(self) -> int:
        return int(time.time() - self.phase_start_time)

    def phase_remaining_seconds(self) -> int:
        phase = self.current_phase()
        if not phase:
            return 0
        return max(0, phase.duration_seconds() - self.time_in_phase())

    def to_dict(self) -> dict:
        return {
            "operation_id": self.operation_id,
            "name": self.name,
            "source": self.source,
            "state": self.state,
            "phase_index": self.phase_index,
            "phase_start_time": self.phase_start_time,
            "start_time": self.start_time,
            "phase_results": self.phase_results,
            "allocated_groups": self.allocated_groups,
            "player_targets": self.player_targets,
            "code_words": self.code_words,
            "broadcast_mode": self.broadcast_mode,
            "commander_intent": self.commander_intent,
            "roe": self.roe,
            "source_opord": self.source_opord,
            "created_at": self.created_at,
            "phases": [
                {
                    "name": p.name, "objective": p.objective,
                    "duration_minutes": p.duration_minutes,
                    "forces": p.forces, "broadcasts": p.broadcasts,
                    "advance_trigger": p.advance_trigger,
                    "escalation": p.escalation,
                }
                for p in self.phases
            ],
        }

    def save(self, server_id: str):
        path = OPS_DIR / f"{server_id}_active.json"
        path.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @staticmethod
    def load(server_id: str) -> Optional["Operation"]:
        path = OPS_DIR / f"{server_id}_active.json"
        if not path.exists():
            return None
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
            if d.get("state") in ("COMPLETE", "ABORTED"):
                return None
            phases = [OperationPhase(**p) for p in d.get("phases", [])]
            op = Operation(
                name=d["name"], source=d["source"], phases=phases,
                operation_id=d["operation_id"], state=d["state"],
                phase_index=d["phase_index"],
                phase_start_time=d["phase_start_time"],
                start_time=d["start_time"],
                phase_results=d.get("phase_results", []),
                allocated_groups=d.get("allocated_groups", {}),
                player_targets=d.get("player_targets", {}),
                code_words=d.get("code_words", {}),
                broadcast_mode=d.get("broadcast_mode", "command"),
                commander_intent=d.get("commander_intent", ""),
                roe=d.get("roe", ""),
                source_opord=d.get("source_opord"),
                created_at=d.get("created_at", d["start_time"]),
            )
            return op
        except Exception:
            return None


class OperationStateMachine:
    """
    Drives the active operation forward. Called by the heartbeat loop.
    Evaluates phase advance triggers every 30s without AI involvement.
    """
    # States for OperationStateMachine.state (Operation.state has its own: STAGING/ACTIVE/COMPLETE/ABORTED)
    VALID_STATES = ("IDLE", "PLANNING", "PARSING", "STAGING", "ACTIVE", "EVALUATING", "ESCALATING")

    def __init__(self, server_id: str):
        self.server_id = server_id
        self.state = "IDLE"
        self.active_operation: Optional[Operation] = None
        self.completed_operations: list = []
        self.last_trigger_check: float = 0
        self.pending_broadcast_queue: list = []
        self._plan_cooldown_until: float = 0.0
        # Restore persisted operation on startup
        saved = Operation.load(server_id)
        if saved:
            self.active_operation = saved
            self.state = "ACTIVE"

    def begin_planning(self):
        self.state = "PLANNING"

    def begin_parsing(self):
        self.state = "PARSING"

    def set_operation(self, op: Operation):
        self.active_operation = op
        self.state = "STAGING"
        op.save(self.server_id)

    def activate(self):
        """Transition from STAGING to ACTIVE after initial forces deployed."""
        if self.state == "STAGING" and self.active_operation:
            self.active_operation.state = "ACTIVE"
            self.state = "ACTIVE"
            self.active_operation.save(self.server_id)

    def evaluate_triggers(self, game_state: dict) -> Optional[str]:
        """
        Check if the active phase should advance. Returns the trigger reason
        if advance should happen, else None. Call every 30s from heartbeat.
        """
        now = time.time()
        if now - self.last_trigger_check < 25:
            return None
        self.last_trigger_check = now

        if not self.active_operation or self.state != "ACTIVE":
            return None
        op = self.active_operation
        phase = op.current_phase()
        if not phase:
            return None

        trigger = phase.advance_trigger

        # Hard maximum: force-advance if stuck at 2x the intended phase duration
        if time.time() - op.phase_start_time >= phase.duration_seconds() * 2:
            return "time_elapsed_max"

        # Time elapsed
        if "time_elapsed" in trigger and op.should_advance_by_time():
            return "time_elapsed"

        # All forces wiped
        if "phase_forces_wiped" in trigger:
            allocated = [gid for gid, info in op.allocated_groups.items()
                         if info.get("phase") == op.phase_index]
            active_groups = [g["group_id"] for g in
                             game_state.get("ai_units", {}).get("groups", [])
                             if g.get("group_id")]
            if allocated and not any(gid in active_groups for gid in allocated):
                return "phase_forces_wiped"

        # Players within Nm of objective grid
        if "players_within_" in trigger:
            proximity_met = False
            try:
                dist_m = int(trigger.split("players_within_")[1].split("m")[0])
                # Try to find a numeric grid reference: prefer "grid XX-ZZ" in objective,
                # fall back to the first force's grid field
                obj_grid = None
                if "grid " in phase.objective:
                    obj_grid = phase.objective.split("grid ")[-1].split(" ")[0]
                if obj_grid is None and phase.forces:
                    obj_grid = phase.forces[0].get("grid")
                if obj_grid:
                    obj_parts = obj_grid.split("-")
                    if len(obj_parts) == 2:
                        ox, oz = int(obj_parts[0]), int(obj_parts[1])
                        players = game_state.get("players", [])
                        for p in players:
                            px = float(p.get("pos", {}).get("x", 0))
                            pz = float(p.get("pos", {}).get("z", p.get("pos", {}).get("y", 0)))
                            pgx = int(px / 100)
                            pgz = int(pz / 100)
                            grid_dist = ((pgx - ox)**2 + (pgz - oz)**2)**0.5 * 100
                            if grid_dist <= dist_m:
                                proximity_met = True
                                break
            except (ValueError, IndexError):
                # Grid reference not parseable as numeric — fall back to time elapsed
                if op.should_advance_by_time():
                    return "time_elapsed"
            if proximity_met:
                return "players_within_range"

        # Engagement intensity spike
        if "players_engaged" in trigger:
            intensity = float(game_state.get("engagement_intensity", 0))
            if intensity > 0.4:
                return "players_engaged"

        return None

    def advance_phase(self, reason: str, pending_commands: list):
        """Advance to next phase, queue phase-start broadcasts."""
        if not self.active_operation:
            return
        op = self.active_operation
        op.advance_phase(reason)
        if op.state == "COMPLETE":
            self.state = "IDLE"
            self.completed_operations.append(op.to_dict())
            self.active_operation = None
            # Clean up persisted file
            path = OPS_DIR / f"{self.server_id}_active.json"
            if path.exists():
                path.unlink()
            return

        # Queue phase-start broadcasts for new phase
        new_phase = op.current_phase()
        if new_phase:
            for bc in new_phase.broadcasts:
                if bc.get("trigger") == "phase_start":
                    pending_commands.append({
                        "type": "BROADCAST",
                        "message": bc["message"],
                        "visibility": bc.get("visibility", op.broadcast_mode),
                    })
        op.save(self.server_id)

    def abort(self):
        if self.active_operation:
            self.active_operation.state = "ABORTED"
            self.active_operation.save(self.server_id)   # persist before clearing
            self.completed_operations.append(self.active_operation.to_dict())
            self.active_operation = None
        self.state = "IDLE"

    def check_code_word(self, message: str) -> Optional[str]:
        """Returns effect if message contains a code word, else None."""
        if not self.active_operation:
            return None
        msg_upper = message.upper()
        for word, effect in self.active_operation.code_words.items():
            if word.upper() in msg_upper:
                return effect
        return None

    def get_status(self) -> dict:
        if not self.active_operation:
            return {"state": self.state, "operation": None}
        op = self.active_operation
        phase = op.current_phase()
        return {
            "state": self.state,
            "operation": {
                "operation_id": op.operation_id,
                "name": op.name,
                "source": op.source,
                "phase_index": op.phase_index,
                "phase_count": len(op.phases),
                "current_phase": phase.name if phase else None,
                "phase_objective": phase.objective if phase else None,
                "phase_remaining_s": op.phase_remaining_seconds(),
                "time_in_phase_s": op.time_in_phase(),
                "broadcast_mode": op.broadcast_mode,
                "allocated_groups": op.allocated_groups,
                "phase_results": op.phase_results,
            }
        }


# Per-server state machines
_state_machines: dict = {}

def get_state_machine(server_id: str = "default") -> OperationStateMachine:
    if server_id not in _state_machines:
        _state_machines[server_id] = OperationStateMachine(server_id)
    return _state_machines[server_id]
