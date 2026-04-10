# /opt/panel/backend/tests/test_auth.py
import sys
from pathlib import Path
import unittest.mock as mock
import time
import json
import secrets

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


def test_create_and_validate_refresh_token(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "REFRESH_TOKENS_FILE", tmp_path / "refresh_tokens.json")
    token_id = app_main.create_refresh_token("mark")
    assert len(token_id) == 64  # secrets.token_hex(32) → 64 hex chars
    assert app_main.validate_refresh_token(token_id) == "mark"


def test_validate_refresh_token_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "REFRESH_TOKENS_FILE", tmp_path / "refresh_tokens.json")
    assert app_main.validate_refresh_token("nonexistent") is None


def test_validate_refresh_token_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "REFRESH_TOKENS_FILE", tmp_path / "refresh_tokens.json")
    assert app_main.validate_refresh_token("") is None


def test_validate_refresh_token_expired(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "REFRESH_TOKENS_FILE", tmp_path / "refresh_tokens.json")
    token_id = secrets.token_hex(32)
    data = {"tokens": [{"id": token_id, "username": "mark", "expires_at": int(time.time()) - 1}]}
    (tmp_path / "refresh_tokens.json").write_text(json.dumps(data))
    assert app_main.validate_refresh_token(token_id) is None
    # Expired entry must be pruned from file
    remaining = json.loads((tmp_path / "refresh_tokens.json").read_text())
    assert len(remaining["tokens"]) == 0


def test_delete_refresh_token(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "REFRESH_TOKENS_FILE", tmp_path / "refresh_tokens.json")
    token_id = app_main.create_refresh_token("mark")
    app_main.delete_refresh_token(token_id)
    assert app_main.validate_refresh_token(token_id) is None


def test_delete_nonexistent_token_noop(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "REFRESH_TOKENS_FILE", tmp_path / "refresh_tokens.json")
    # Should not raise
    app_main.delete_refresh_token("nosuchtoken")
    app_main.delete_refresh_token("")
