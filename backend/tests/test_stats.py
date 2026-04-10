import json, sqlite3, tempfile, time
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

# We import only the pure functions we need; avoid triggering the full app startup
# by importing selectively after patching the module-level init calls.
import unittest.mock as mock

# Patch the module-level init calls before import so they don't touch the filesystem
with mock.patch('builtins.open', mock.mock_open()), \
     mock.patch('sqlite3.connect') as _mc:
    _mc.return_value.__enter__ = lambda s: s
    _mc.return_value.__exit__ = mock.Mock(return_value=False)
    _mc.return_value.executescript = mock.Mock()
    _mc.return_value.commit = mock.Mock()
    _mc.return_value.execute = mock.Mock(return_value=mock.Mock(fetchall=lambda: [], fetchone=lambda: [0]))
    _mc.return_value.close = mock.Mock()
    import main as app_main


def make_stats_db(tmp: Path) -> sqlite3.Connection:
    """Create a fresh in-memory stats DB using the real init function."""
    # Point the init at tmp dir
    app_main._init_stats_db(tmp)
    conn = sqlite3.connect(str(tmp / "stats.db"))
    conn.row_factory = sqlite3.Row
    return conn


def test_init_creates_tables(tmp_path):
    conn = make_stats_db(tmp_path)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert 'kill_events' in tables
    assert 'player_sessions' in tables
    assert 'server_sessions' in tables
    conn.close()


def test_sync_kill_events_parses_valid_line(tmp_path):
    mat_dir = tmp_path / "Misfits_Logging"
    (mat_dir / "logs").mkdir(parents=True)
    kill_log = mat_dir / "logs/kill_logs.json"
    kill_log.write_text(
        '{"timestamp":1000001,"event":"game_start","version":"1.0"}\n'
        '{"timestamp":1000100,"event":"player_killed","killer_name":"Alice","killer_guid":"guid-alice",'
        '"victim_name":"Bob","victim_guid":"guid-bob","weapon":"M4A1","distance":"42.5",'
        '"friendly_fire":false,"team_kill":false}\n'
        '======\n'
    )
    app_main._init_stats_db(tmp_path)
    app_main._sync_kill_events(mat_dir, tmp_path)
    conn = sqlite3.connect(str(tmp_path / "stats.db"))
    rows = conn.execute("SELECT * FROM kill_events").fetchall()
    assert len(rows) == 1
    r = rows[0]
    assert r[1] == 1000100   # ts
    assert r[2] == 'Alice'   # killer
    assert r[4] == 'Bob'     # victim
    assert r[6] == 'M4A1'   # weapon
    assert abs(r[7] - 42.5) < 0.01  # distance
    conn.close()


def test_sync_kill_events_deduplicates(tmp_path):
    mat_dir = tmp_path / "Misfits_Logging"
    (mat_dir / "logs").mkdir(parents=True)
    line = '{"timestamp":1000100,"event":"player_killed","killer_name":"Alice","killer_guid":"guid-alice","victim_name":"Bob","victim_guid":"guid-bob","weapon":"M4A1","distance":"10","friendly_fire":false,"team_kill":false}\n'
    (mat_dir / "logs/kill_logs.json").write_text(line + line)  # duplicate
    app_main._init_stats_db(tmp_path)
    app_main._sync_kill_events(mat_dir, tmp_path)
    conn = sqlite3.connect(str(tmp_path / "stats.db"))
    count = conn.execute("SELECT COUNT(*) FROM kill_events").fetchone()[0]
    assert count == 1   # INSERT OR IGNORE deduplicates
    conn.close()


def test_sync_player_sessions(tmp_path):
    mat_dir = tmp_path / "Misfits_Logging"
    (mat_dir / "logs").mkdir(parents=True)
    (mat_dir / "logs/connection_logs.json").write_text(
        '{"timestamp":2000,"event":"player_connected","player_name":"Gaz","player_guid":""}\n'
        '{"timestamp":3000,"event":"player_disconnected","player_name":"Gaz","player_guid":"abc-123"}\n'
    )
    app_main._init_stats_db(tmp_path)
    app_main._sync_player_sessions(mat_dir, tmp_path)
    conn = sqlite3.connect(str(tmp_path / "stats.db"))
    rows = conn.execute("SELECT * FROM player_sessions").fetchall()
    assert len(rows) == 1
    assert rows[0][1] == 'Gaz'          # player_name
    assert rows[0][3] == 2000           # connect_ts
    assert rows[0][4] == 3000           # disconnect_ts
    conn.close()


def test_sync_server_sessions(tmp_path):
    mat_dir = tmp_path / "Misfits_Logging"
    (mat_dir / "logs").mkdir(parents=True)
    (mat_dir / "logs/kill_logs.json").write_text(
        '{"timestamp":1000,"event":"game_start","version":"1.0"}\n'
        '{"timestamp":2000,"event":"game_start","version":"1.0"}\n'
    )
    app_main._init_stats_db(tmp_path)
    app_main._sync_server_sessions(mat_dir, tmp_path)
    conn = sqlite3.connect(str(tmp_path / "stats.db"))
    rows = conn.execute("SELECT start_ts, end_ts FROM server_sessions ORDER BY start_ts").fetchall()
    assert len(rows) == 2
    assert rows[0][0] == 1000 and rows[0][1] == 2000   # first session ends at second start
    assert rows[1][0] == 2000 and rows[1][1] is None    # latest session has no end
    conn.close()
