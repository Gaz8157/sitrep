import sys
from pathlib import Path
import unittest.mock as mock
import json
import io

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


def test_load_user_profiles_missing_file(tmp_path):
    result = app_main.load_user_profiles(tmp_path)
    assert result == {}


def test_save_and_load_user_profiles(tmp_path):
    data = {"mark": {"display_name": "Mark", "default_tab": "dashboard"}}
    app_main.save_user_profiles(data, tmp_path)
    loaded = app_main.load_user_profiles(tmp_path)
    assert loaded == data


def test_save_user_profiles_atomic(tmp_path):
    data = {"mark": {"display_name": "Mark"}}
    app_main.save_user_profiles(data, tmp_path)
    # tmp file must not remain after save
    assert not (tmp_path / "user_profiles.tmp").exists()
    assert (tmp_path / "user_profiles.json").exists()


def test_load_user_profiles_corrupted(tmp_path):
    (tmp_path / "user_profiles.json").write_text("not json")
    result = app_main.load_user_profiles(tmp_path)
    assert result == {}


import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "PANEL_DATA", tmp_path)
    # Create a test user
    users = {"users": [{"username": "mark", "password_hash": app_main.hash_password("pass"), "role": "admin", "tokens_valid_after": 0}]}
    (tmp_path / "panel_users.json").write_text(json.dumps(users))
    # Patch decode_token so auth_middleware passes; patch get_default_server for revocation check
    monkeypatch.setattr(app_main, "decode_token", lambda token: {"sub": "mark", "role": "admin", "iat": 9999999999})
    monkeypatch.setattr(app_main, "get_default_server", lambda: {"data_dir": str(tmp_path), "id": 1})
    # Patch current_user to return mark
    monkeypatch.setattr(app_main, "current_user", lambda req: {"username": "mark", "role": "admin"})
    monkeypatch.setattr(app_main, "srv_data_dir", lambda req: tmp_path)
    c = TestClient(app_main.app)
    c.cookies.set("sitrep-access", "test-token")
    return c


def test_get_profile_empty(client):
    r = client.get("/api/users/profile")
    assert r.status_code == 200
    data = r.json()
    assert data["display_name"] == ""
    assert data["default_tab"] == "dashboard"
    assert data["avatar_ext"] == ""
    assert data["preferences"] == {"theme": "", "text_size": "", "custom_accent": None, "bg_type": "none", "custom_bg_color": None}
    assert data["panel_defaults"] == {"order": [], "hidden": []}


def test_put_profile_display_name(client, tmp_path):
    r = client.put("/api/users/profile", json={"display_name": "Mark T"})
    assert r.status_code == 200
    assert r.json()["message"] == "Profile saved"
    profiles = app_main.load_user_profiles(tmp_path)
    assert profiles["mark"]["display_name"] == "Mark T"


def test_put_profile_display_name_truncated(client, tmp_path):
    r = client.put("/api/users/profile", json={"display_name": "A" * 50})
    assert r.status_code == 200
    profiles = app_main.load_user_profiles(tmp_path)
    assert len(profiles["mark"]["display_name"]) == 32


def test_put_profile_preferences(client, tmp_path):
    r = client.put("/api/users/profile", json={"preferences": {"theme": "green", "text_size": "L"}})
    assert r.status_code == 200
    profiles = app_main.load_user_profiles(tmp_path)
    assert profiles["mark"]["preferences"]["theme"] == "green"
    assert profiles["mark"]["preferences"]["text_size"] == "L"


def test_put_profile_unknown_pref_keys_filtered(client, tmp_path):
    r = client.put("/api/users/profile", json={"preferences": {"theme": "green", "evil_key": "injected"}})
    assert r.status_code == 200
    profiles = app_main.load_user_profiles(tmp_path)
    assert "evil_key" not in profiles["mark"].get("preferences", {})
    assert profiles["mark"]["preferences"]["theme"] == "green"


def test_upload_avatar_invalid_type(client):
    data = {"file": ("avatar.txt", io.BytesIO(b"hello"), "text/plain")}
    r = client.post("/api/users/avatar", files=data)
    assert r.status_code == 400
    assert "allowed" in r.json()["error"]


def test_upload_avatar_too_large(client):
    big = io.BytesIO(b"x" * (10 * 1024 * 1024 + 1))
    data = {"file": ("avatar.jpg", big, "image/jpeg")}
    r = client.post("/api/users/avatar", files=data)
    assert r.status_code == 400
    assert "large" in r.json()["error"]


def test_upload_and_serve_avatar(client, tmp_path):
    img = io.BytesIO(b"\xff\xd8\xff" + b"\x00" * 100)  # minimal jpeg-like bytes
    data = {"file": ("avatar.jpg", img, "image/jpeg")}
    r = client.post("/api/users/avatar", files=data)
    assert r.status_code == 200
    assert r.json()["ext"] == "jpg"
    # profile updated
    profiles = app_main.load_user_profiles(tmp_path)
    assert profiles["mark"]["avatar_ext"] == "jpg"
    # file exists
    assert (tmp_path / "avatars" / "mark.jpg").exists()


def test_delete_avatar(client, tmp_path):
    (tmp_path / "avatars").mkdir()
    (tmp_path / "avatars" / "mark.jpg").write_bytes(b"img")
    app_main.save_user_profiles({"mark": {"avatar_ext": "jpg"}}, tmp_path)
    r = client.delete("/api/users/avatar")
    assert r.status_code == 200
    assert not (tmp_path / "avatars" / "mark.jpg").exists()
    assert app_main.load_user_profiles(tmp_path)["mark"]["avatar_ext"] == ""


def test_serve_avatar_returns_file(client, tmp_path):
    # Upload first
    img = io.BytesIO(b"\xff\xd8\xff" + b"\x00" * 100)
    r = client.post("/api/users/avatar", files={"file": ("a.jpg", img, "image/jpeg")})
    assert r.status_code == 200
    # Serve
    r2 = client.get("/api/users/mark/avatar")
    assert r2.status_code == 200
    assert r2.headers["content-type"].startswith("image/jpeg")


def test_serve_avatar_404_when_missing(client):
    r = client.get("/api/users/nobody/avatar")
    assert r.status_code == 404


def test_upload_background_too_large(client):
    big = io.BytesIO(b"x" * (5 * 1024 * 1024 + 1))
    data = {"file": ("bg.jpg", big, "image/jpeg")}
    r = client.post("/api/users/background", files=data)
    assert r.status_code == 400
    assert "large" in r.json()["error"]


def test_upload_and_delete_background(client, tmp_path):
    img = io.BytesIO(b"\x89PNG" + b"\x00" * 100)
    data = {"file": ("bg.png", img, "image/png")}
    r = client.post("/api/users/background", files=data)
    assert r.status_code == 200
    assert r.json()["ext"] == "png"
    assert (tmp_path / "backgrounds" / "mark.png").exists()
    r2 = client.delete("/api/users/background")
    assert r2.status_code == 200
    assert not (tmp_path / "backgrounds" / "mark.png").exists()


def test_change_password_wrong_current(client):
    r = client.put("/api/users/password", json={"current_password": "wrong", "new_password": "newpass123"})
    assert r.status_code == 400
    assert "incorrect" in r.json()["error"]


def test_change_password_too_short(client):
    r = client.put("/api/users/password", json={"current_password": "pass", "new_password": "short"})
    assert r.status_code == 400
    assert "8 characters" in r.json()["error"]


def test_change_password_success(client, tmp_path):
    r = client.put("/api/users/password", json={"current_password": "pass", "new_password": "newpass123"})
    assert r.status_code == 200
    assert r.json()["message"] == "Password changed"
    data = app_main.load_panel_users(tmp_path)
    u = next(x for x in data["users"] if x["username"] == "mark")
    assert app_main.verify_password("newpass123", u["password_hash"])
