import sys
import time
import unittest.mock as mock
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

with mock.patch('builtins.open', mock.mock_open()), \
     mock.patch('sqlite3.connect') as _mc:
    _mc.return_value.__enter__ = lambda s: s
    _mc.return_value.__exit__ = mock.Mock(return_value=False)
    _mc.return_value.executescript = mock.Mock()
    _mc.return_value.commit = mock.Mock()
    _mc.return_value.execute = mock.Mock(
        return_value=mock.Mock(fetchall=lambda: [], fetchone=lambda: [0]))
    _mc.return_value.close = mock.Mock()
    import main as app_main


def _reset_tracker():
    with app_main._TRACKER_STATE_LOCK:
        app_main._TRACKER_LATEST_SNAPSHOTS.clear()
        app_main._TRACKER_RECENT_EVENTS.clear()
        app_main._TRACKER_LAST_RX.clear()


def _fake_request(server: dict | None):
    req = mock.Mock()
    req.state.server = server
    return req


def test_snapshot_partitioned_by_mod_id():
    """Two servers with different mod_server_ids must not see each other's snapshots."""
    _reset_tracker()
    with app_main._TRACKER_STATE_LOCK:
        app_main._TRACKER_LATEST_SNAPSHOTS["10.0.0.1:2001"] = {
            "gaz_uid": {"name": "gaz", "status": "alive"}
        }
        app_main._TRACKER_LAST_RX["10.0.0.1:2001"] = time.time()
    snap_a = app_main._TRACKER_LATEST_SNAPSHOTS.get("10.0.0.1:2001", {})
    snap_b = app_main._TRACKER_LATEST_SNAPSHOTS.get("10.0.0.2:2001", {})
    assert "gaz_uid" in snap_a
    assert snap_b == {}


def test_events_partitioned_by_mod_id():
    """Events for one mod server don't show up in another mod server's deque."""
    _reset_tracker()
    dq_a = app_main._tracker_events_deque("10.0.0.1:2001")
    dq_a.append({"event_type": "player_killed", "_rx_ts": time.time()})
    assert len(app_main._TRACKER_RECENT_EVENTS["10.0.0.1:2001"]) == 1
    assert "10.0.0.2:2001" not in app_main._TRACKER_RECENT_EVENTS


def test_panel_mod_id_reads_from_request_state():
    """_tracker_panel_mod_id returns the current panel server's tracker_mod_id, or ''."""
    _reset_tracker()
    assert app_main._tracker_panel_mod_id(_fake_request(None)) == ""
    assert app_main._tracker_panel_mod_id(_fake_request({"id": 1})) == ""
    assert app_main._tracker_panel_mod_id(
        _fake_request({"id": 1, "tracker_mod_id": "10.0.0.1:2001"})
    ) == "10.0.0.1:2001"
    # Whitespace is stripped.
    assert app_main._tracker_panel_mod_id(
        _fake_request({"id": 1, "tracker_mod_id": "  10.0.0.1:2001  "})
    ) == "10.0.0.1:2001"


def test_recent_mod_ids_marks_assigned_vs_unassigned():
    """_tracker_recent_mod_ids distinguishes mod_ids already mapped to a panel server
    from ones that aren't — the frontend's auto-detect relies on this."""
    _reset_tracker()
    now = time.time()
    with app_main._TRACKER_STATE_LOCK:
        app_main._TRACKER_LAST_RX["10.0.0.1:2001"] = now
        app_main._TRACKER_LAST_RX["10.0.0.9:2001"] = now
    with mock.patch.object(
        app_main, "load_servers",
        return_value={"servers": [{"id": 1, "tracker_mod_id": "10.0.0.1:2001"}]},
    ):
        rows = app_main._tracker_recent_mod_ids()
    ids = {r["mod_server_id"]: r["assigned"] for r in rows}
    assert ids["10.0.0.1:2001"] is True
    assert ids["10.0.0.9:2001"] is False


def test_recent_mod_ids_drops_stale_entries():
    """mod_ids that haven't reported in > max_age_sec are excluded."""
    _reset_tracker()
    with app_main._TRACKER_STATE_LOCK:
        app_main._TRACKER_LAST_RX["fresh:1"] = time.time()
        app_main._TRACKER_LAST_RX["stale:1"] = time.time() - 3600
    with mock.patch.object(app_main, "load_servers", return_value={"servers": []}):
        rows = app_main._tracker_recent_mod_ids(max_age_sec=300)
    seen = {r["mod_server_id"] for r in rows}
    assert "fresh:1" in seen
    assert "stale:1" not in seen


def test_events_deque_respects_cap():
    """_tracker_events_deque uses _tracker_events_cap() for maxlen."""
    _reset_tracker()
    with mock.patch.object(app_main, "_tracker_load_settings",
                            return_value={"events_cap": 3}):
        dq = app_main._tracker_events_deque("host:1")
        for i in range(10):
            dq.append({"n": i})
    assert len(dq) == 3
    assert [e["n"] for e in dq] == [7, 8, 9]
