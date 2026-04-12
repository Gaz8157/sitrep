import json
import pytest
import pytest_asyncio
import tempfile
import os
from pathlib import Path
from httpx import AsyncClient, ASGITransport

TEST_API_KEY = "test-key"

@pytest.fixture(scope="session")
def tmp_db(tmp_path_factory):
    return str(tmp_path_factory.mktemp("data") / "test.db")

@pytest.fixture(scope="session", autouse=True)
def patch_server_config(tmp_db):
    """Override server globals before any test imports trigger config load."""
    os.environ["PT_API_KEY"] = TEST_API_KEY
    os.environ["PT_DB_PATH"] = tmp_db
    os.environ["PT_MERCURY_URL"] = ""
    os.environ["PT_SESSION_GAP"] = "300"
    os.environ["PT_PORT"] = "5557"

@pytest_asyncio.fixture
async def client(patch_server_config, tmp_db):
    import importlib
    import sys
    # Fresh import so env vars are picked up
    if "server" in sys.modules:
        del sys.modules["server"]
    sys.path.insert(0, str(Path(__file__).parent.parent))
    import server
    await server.init_db()
    async with AsyncClient(
        transport=ASGITransport(app=server.app),
        base_url="http://test"
    ) as ac:
        yield ac

VALID_SNAPSHOT = {
    "server_id": "test-server",
    "api_key": "test-key",
    "game": "ArmaReforger",
    "timestamp": 1744300800,
    "map": "Everon",
    "session_time": 100,
    "players_alive": 1,
    "players_total": 1,
    "players": [{
        "uid": "uid-001",
        "name": "TestPlayer",
        "status": "alive",
        "grid": "0628-0628",
        "x": 6283.4,
        "z": 6281.7,
        "elevation": 45,
        "heading": 270.5,
        "heading_dir": "W",
        "faction": "US",
        "health": 0.87,
        "in_vehicle": False,
        "vehicle_type": "",
        "is_squad_leader": False,
        "squad_id": 1,
        "squad_name": "Squad 1",
        "is_admin": False,
        "nearest_location": {"name": "Entre Due", "type": "village", "dist": 340}
    }]
}
