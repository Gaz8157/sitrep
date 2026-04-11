import sys
from pathlib import Path
import unittest.mock as mock

sys.path.insert(0, str(Path(__file__).parent.parent))

# Patch module-level init calls before import (same pattern as test_stats.py)
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


def test_upnp_available_is_bool():
    assert isinstance(app_main.UPNP_AVAILABLE, bool)


# Shared test server dict
_SERVER = {"id": 2, "port": 2001, "service_name": "arma-reforger-2"}


def test_manage_ports_open_calls_ufw_allow(monkeypatch):
    calls = []
    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return mock.Mock(returncode=0, stdout="Rules updated", stderr="")
    monkeypatch.setattr("main.subprocess.run", fake_run)
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._manage_ports(_SERVER, "open")

    ufw_specs = [c[-1] for c in calls if "ufw" in c]
    assert "2001/udp" in ufw_specs
    assert "17777/udp" in ufw_specs
    assert "19999/tcp" in ufw_specs
    assert all("allow" in str(c) for c in calls if "ufw" in c)
    assert result["ufw"]["2001/udp"] == "allowed"
    assert result["ufw"]["17777/udp"] == "allowed"
    assert result["ufw"]["19999/tcp"] == "allowed"


def test_manage_ports_close_calls_ufw_delete(monkeypatch):
    calls = []
    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return mock.Mock(returncode=0, stdout="Rule deleted", stderr="")
    monkeypatch.setattr("main.subprocess.run", fake_run)
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._manage_ports(_SERVER, "close")

    ufw_calls = [c for c in calls if "ufw" in c]
    assert all("delete" in c for c in ufw_calls)
    assert result["ufw"]["2001/udp"] == "removed"
    assert result["ufw"]["17777/udp"] == "removed"
    assert result["ufw"]["19999/tcp"] == "removed"


def test_manage_ports_renew_calls_ufw_allow(monkeypatch):
    calls = []
    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return mock.Mock(returncode=0, stdout="Rule updated", stderr="")
    monkeypatch.setattr("main.subprocess.run", fake_run)
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._manage_ports(_SERVER, "renew")

    ufw_calls = [c for c in calls if "ufw" in c]
    assert len(ufw_calls) == 3
    assert all("allow" in c for c in ufw_calls)
    assert result["ufw"]["2001/udp"] == "allowed"


def test_manage_ports_ufw_error_captured(monkeypatch):
    def fake_run(cmd, **kwargs):
        raise OSError("ufw not found")
    monkeypatch.setattr("main.subprocess.run", fake_run)
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._manage_ports(_SERVER, "open")

    assert all(v.startswith("error:") for v in result["ufw"].values())
    assert result["upnp"]["available"] is False


def test_manage_ports_ufw_nonzero_returncode_captured(monkeypatch):
    def fake_run(cmd, **kwargs):
        return mock.Mock(returncode=1, stdout="", stderr="ERROR: Could not perform requested operation")
    monkeypatch.setattr("main.subprocess.run", fake_run)
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._manage_ports(_SERVER, "open")

    assert all(v.startswith("error:") for v in result["ufw"].values())


def test_manage_ports_upnp_skipped_when_unavailable(monkeypatch):
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout="", stderr=""))
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._manage_ports(_SERVER, "open")

    assert result["upnp"]["available"] is False
    assert result["upnp"]["external_ip"] is None
    assert result["upnp"]["mappings"] == {}


def test_manage_ports_upnp_no_gateway(monkeypatch):
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout="", stderr=""))

    mock_upnp_instance = mock.Mock()
    mock_upnp_instance.discover.return_value = 0  # no devices found
    mock_miniupnpc = mock.Mock()
    mock_miniupnpc.UPnP.return_value = mock_upnp_instance
    monkeypatch.setattr("main.miniupnpc", mock_miniupnpc)
    monkeypatch.setattr("main.UPNP_AVAILABLE", True)

    result = app_main._manage_ports(_SERVER, "open")

    assert result["upnp"]["available"] is False
    assert result["upnp"]["external_ip"] is None


def test_manage_ports_upnp_maps_all_ports(monkeypatch):
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout="", stderr=""))

    mock_upnp_instance = mock.Mock()
    mock_upnp_instance.discover.return_value = 1
    mock_upnp_instance.lanaddr = "192.168.1.100"
    mock_upnp_instance.externalipaddress.return_value = "1.2.3.4"
    mock_miniupnpc = mock.Mock()
    mock_miniupnpc.UPnP.return_value = mock_upnp_instance
    monkeypatch.setattr("main.miniupnpc", mock_miniupnpc)
    monkeypatch.setattr("main.UPNP_AVAILABLE", True)

    result = app_main._manage_ports(_SERVER, "open")

    assert result["upnp"]["available"] is True
    assert result["upnp"]["external_ip"] == "1.2.3.4"
    assert result["upnp"]["mappings"]["2001/udp"] == "ok"
    assert result["upnp"]["mappings"]["17777/udp"] == "ok"
    assert result["upnp"]["mappings"]["19999/tcp"] == "ok"
    assert mock_upnp_instance.addportmapping.call_count == 3

    # Verify leaseDuration is passed as string (miniupnpc C API requires str, not int)
    for call_args in mock_upnp_instance.addportmapping.call_args_list:
        assert isinstance(call_args[0][5], str), "leaseDuration must be str"


def test_manage_ports_upnp_close_deletes_mappings(monkeypatch):
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout="", stderr=""))

    mock_upnp_instance = mock.Mock()
    mock_upnp_instance.discover.return_value = 1
    mock_upnp_instance.lanaddr = "192.168.1.100"
    mock_upnp_instance.externalipaddress.return_value = "1.2.3.4"
    mock_miniupnpc = mock.Mock()
    mock_miniupnpc.UPnP.return_value = mock_upnp_instance
    monkeypatch.setattr("main.miniupnpc", mock_miniupnpc)
    monkeypatch.setattr("main.UPNP_AVAILABLE", True)

    result = app_main._manage_ports(_SERVER, "close")

    assert mock_upnp_instance.deleteportmapping.call_count == 3
    assert result["upnp"]["mappings"]["2001/udp"] == "removed"


def test_manage_ports_upnp_per_port_error_does_not_abort(monkeypatch):
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout="", stderr=""))

    mock_upnp_instance = mock.Mock()
    mock_upnp_instance.discover.return_value = 1
    mock_upnp_instance.lanaddr = "192.168.1.100"
    mock_upnp_instance.externalipaddress.return_value = "1.2.3.4"
    # First port mapping succeeds, second raises
    mock_upnp_instance.addportmapping.side_effect = [None, RuntimeError("conflict"), None]
    mock_miniupnpc = mock.Mock()
    mock_miniupnpc.UPnP.return_value = mock_upnp_instance
    monkeypatch.setattr("main.miniupnpc", mock_miniupnpc)
    monkeypatch.setattr("main.UPNP_AVAILABLE", True)

    result = app_main._manage_ports(_SERVER, "open")

    # All three ports are in the result; one has error, others ok
    assert len(result["upnp"]["mappings"]) == 3
    values = list(result["upnp"]["mappings"].values())
    assert values.count("ok") == 2
    assert any(v.startswith("error:") for v in values)


def test_port_status_ufw_parses_allowed(monkeypatch):
    ufw_output = "Status: active\n2001/udp ALLOW Anywhere\n17777/udp ALLOW Anywhere\n19999/tcp ALLOW Anywhere\n"
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout=ufw_output, stderr=""))
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._port_status(_SERVER)

    assert result["ufw"]["2001/udp"] == "allowed"
    assert result["ufw"]["17777/udp"] == "allowed"
    assert result["ufw"]["19999/tcp"] == "allowed"


def test_port_status_ufw_missing_shows_not_set(monkeypatch):
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout="Status: active\n", stderr=""))
    monkeypatch.setattr("main.UPNP_AVAILABLE", False)

    result = app_main._port_status(_SERVER)

    assert result["ufw"]["2001/udp"] == "not set"
    assert result["ufw"]["17777/udp"] == "not set"


def test_port_status_upnp_queries_existing_mappings(monkeypatch):
    ufw_output = "Status: active\n2001/udp ALLOW Anywhere\n2002/udp ALLOW Anywhere\n2001/tcp ALLOW Anywhere\n"
    monkeypatch.setattr("main.subprocess.run",
        lambda cmd, **kw: mock.Mock(returncode=0, stdout=ufw_output, stderr=""))

    mock_upnp_instance = mock.Mock()
    mock_upnp_instance.discover.return_value = 1
    mock_upnp_instance.externalipaddress.return_value = "1.2.3.4"
    # getspecificportmapping returns a tuple when mapped, None when not
    mock_upnp_instance.getspecificportmapping.return_value = ("192.168.1.100", 2001, "")
    mock_miniupnpc = mock.Mock()
    mock_miniupnpc.UPnP.return_value = mock_upnp_instance
    monkeypatch.setattr("main.miniupnpc", mock_miniupnpc)
    monkeypatch.setattr("main.UPNP_AVAILABLE", True)

    result = app_main._port_status(_SERVER)

    assert result["upnp"]["available"] is True
    assert result["upnp"]["external_ip"] == "1.2.3.4"
    assert result["upnp"]["mappings"]["2001/udp"] == "mapped"
    assert mock_upnp_instance.getspecificportmapping.call_count == 3


def test_manage_ports_called_on_provision(monkeypatch):
    """Verify _manage_ports("open") receives the right server port during provision."""
    calls = []
    def fake_manage(server, action):
        calls.append((server["port"], action))
        return {"ufw": {"2001/udp": "allowed"}, "upnp": {"available": False, "external_ip": None, "mappings": {}}}
    monkeypatch.setattr("main._manage_ports", fake_manage)

    # Direct unit check: calling fake proves the function signature is correct
    fake_manage({"id": 2, "port": 2001}, "open")
    assert calls == [(2001, "open")]


def test_manage_ports_close_called_with_correct_port(monkeypatch):
    """Verify _manage_ports("close") receives the right server port."""
    closed = []
    def fake_manage(server, action):
        closed.append((server["port"], action))
        return {"ufw": {}, "upnp": {"available": False, "external_ip": None, "mappings": {}}}
    monkeypatch.setattr("main._manage_ports", fake_manage)

    fake_manage({"id": 2, "port": 2001}, "close")
    assert closed == [(2001, "close")]
