"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ConsoleLogEntry } from "@/lib/types";

interface ServerProcessStatus {
  status: string;
  running: boolean;
  pid: number | null;
  exe_path: string;
  exe_exists: boolean;
  config_path: string;
  config_exists: boolean;
  install_dir: string;
  steamcmd_exists: boolean;
}

interface OllamaHealth {
  status: string;
  reachable: boolean;
  latency_ms?: number;
  model_name?: string;
  model_found?: boolean;
  model_root?: string;
  max_model_len?: number;
  model_size_gb?: number;
  total_models?: number;
  ollama_url?: string;
  engine?: string;
  kv_cache_type?: string;
  flash_attention?: boolean;
  features?: string[];
  hardware?: string;
  spark_ip?: string;
  message?: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20",
    stopped: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20",
    starting: "bg-[#eab308]/10 text-[#eab308] border-[#eab308]/20",
    stopping: "bg-[#eab308]/10 text-[#eab308] border-[#eab308]/20",
    updating: "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20",
    unknown: "bg-white/5 text-[#6b6b80] border-white/10",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${colors[status] || colors.unknown}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "running" ? "bg-[#22c55e] animate-pulse" : status === "stopped" ? "bg-[#ef4444]" : status === "updating" ? "bg-[#8b5cf6] animate-pulse" : "bg-[#eab308] animate-pulse"}`} />
      {status}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "default",
  disabled = false,
  loading = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "green" | "red" | "yellow" | "purple";
  disabled?: boolean;
  loading?: boolean;
}) {
  const colors = {
    default: "bg-white/[0.04] text-[#c8c8d0] border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12]",
    green: "bg-[#22c55e]/[0.08] text-[#22c55e] border-[#22c55e]/20 hover:bg-[#22c55e]/[0.15] hover:border-[#22c55e]/30",
    red: "bg-[#ef4444]/[0.08] text-[#ef4444] border-[#ef4444]/20 hover:bg-[#ef4444]/[0.15] hover:border-[#ef4444]/30",
    yellow: "bg-[#eab308]/[0.08] text-[#eab308] border-[#eab308]/20 hover:bg-[#eab308]/[0.15] hover:border-[#eab308]/30",
    purple: "bg-[#8b5cf6]/[0.08] text-[#8b5cf6] border-[#8b5cf6]/20 hover:bg-[#8b5cf6]/[0.15] hover:border-[#8b5cf6]/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-4 py-2.5 rounded-lg text-[11px] font-bold tracking-wide border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.49 8.49l2.83 2.83" />
          </svg>
          Working...
        </span>
      ) : children}
    </button>
  );
}

// ─── Scheduler Types ──────────────────────────────────────────────────────

type ScheduleType = "daily" | "weekly" | "interval" | "one_time";
type ScheduleAction =
  | "RESTART" | "RESTART_UPDATE" | "BROADCAST" | "WARMUP"
  | "CLEAR_AI" | "RESET_ESCALATION" | "SET_DIFFICULTY" | "MISSION_RESET" | "AI_TOGGLE";

interface ScheduleConfig {
  type: ScheduleType;
  time?: string;          // "HH:MM"
  timezone?: string;      // IANA name
  days?: string[];        // ["mon","tue","wed","thu","fri","sat","sun"]
  interval_hours?: number;
  datetime_utc?: string;  // ISO-8601 for one_time
}

interface WarningConfig {
  enabled: boolean;
  minutes: number[];      // [15, 5, 1]
  message: string;
}

interface PlayerGateConfig {
  enabled: boolean;
  defer_minutes: number;
}

interface ScheduleLogEntry {
  ts: string;
  action: string;
  status: "ok" | "skipped" | "error";
  message: string;
}

interface ScheduledEvent {
  id: string;
  name: string;
  enabled: boolean;
  action: ScheduleAction;
  params: Record<string, unknown>;
  schedule: ScheduleConfig;
  warnings: WarningConfig;
  player_gate: PlayerGateConfig;
  next_run_utc: string | null;
  last_run: ScheduleLogEntry | null;
  log: ScheduleLogEntry[];
}

const ACTION_LABELS: Record<ScheduleAction, string> = {
  RESTART: "Restart Server",
  RESTART_UPDATE: "Update + Restart",
  BROADCAST: "Broadcast Message",
  WARMUP: "AI Model Warmup",
  CLEAR_AI: "Clear All AI",
  RESET_ESCALATION: "Reset Escalation",
  SET_DIFFICULTY: "Set Difficulty",
  MISSION_RESET: "Reset Mission",
  AI_TOGGLE: "Toggle AI GM",
};

const ACTION_COLORS: Record<ScheduleAction, string> = {
  RESTART: "text-[#eab308] border-[#eab308]/20 bg-[#eab308]/[0.08]",
  RESTART_UPDATE: "text-[#8b5cf6] border-[#8b5cf6]/20 bg-[#8b5cf6]/[0.08]",
  BROADCAST: "text-[#22d3ee] border-[#22d3ee]/20 bg-[#22d3ee]/[0.08]",
  WARMUP: "text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/[0.08]",
  CLEAR_AI: "text-[#ef4444] border-[#ef4444]/20 bg-[#ef4444]/[0.08]",
  RESET_ESCALATION: "text-[#f97316] border-[#f97316]/20 bg-[#f97316]/[0.08]",
  SET_DIFFICULTY: "text-[#22d3ee] border-[#22d3ee]/20 bg-[#22d3ee]/[0.08]",
  MISSION_RESET: "text-[#6b6b80] border-white/[0.1] bg-white/[0.04]",
  AI_TOGGLE: "text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/[0.08]",
};

const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S"
};

const COMMON_TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Europe/Moscow", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
];

function formatTimeUntil(isoUtc: string | null): string {
  if (!isoUtc) return "—";
  const diff = new Date(isoUtc).getTime() - Date.now();
  if (diff <= 0) return "Due now";
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatUtcAsLocal(isoUtc: string | null, tz: string): string {
  if (!isoUtc) return "—";
  try {
    return new Date(isoUtc).toLocaleString("en-US", {
      timeZone: tz,
      hour: "2-digit", minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
  } catch {
    return isoUtc;
  }
}

function scheduleLabel(event: ScheduledEvent): string {
  const { schedule } = event;
  const tz = schedule.timezone || "UTC";
  switch (schedule.type) {
    case "daily":
      return `Daily at ${schedule.time} ${tz}`;
    case "weekly": {
      const days = (schedule.days || []).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
      return `${days} at ${schedule.time} ${tz}`;
    }
    case "interval":
      return `Every ${schedule.interval_hours}h`;
    case "one_time":
      return `Once: ${formatUtcAsLocal(schedule.datetime_utc || null, tz)}`;
    default:
      return "Unknown schedule";
  }
}

interface ServerConfigProps {
  consoleLogs?: ConsoleLogEntry[];
}

export function ServerConfig({ consoleLogs = [] }: ServerConfigProps) {
  const [processStatus, setProcessStatus] = useState<ServerProcessStatus | null>(null);
  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealth | null>(null);
  // ─── RCON state ──────────────────────────────────────────────────────────
  const [rconStatus, setRconStatus] = useState<{
    connected: boolean;
    authenticated: boolean;
    host: string;
    port: number;
    error: string | null;
    log: { ts: number; direction: string; text: string }[];
  } | null>(null);
  const [rconInput, setRconInput] = useState("");
  const [rconLoading, setRconLoading] = useState(false);
  const rconLogEndRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configText, setConfigText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"controls" | "scheduler" | "config" | "ollama" | "console" | "files" | "rcon">("controls");
  const [updateLog, setUpdateLog] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ─── Fetch server process status ──────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/server/status");
      if (res.ok) {
        setProcessStatus(await res.json());
      }
    } catch { /* bridge offline */ }
  }, []);

  // ─── Fetch Ollama health ──────────────────────────────────────────
  const fetchOllamaHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/ollama/health");
      if (res.ok) {
        setOllamaHealth(await res.json());
      }
    } catch { /* bridge offline */ }
  }, []);

  const fetchRconStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/rcon/status");
      if (res.ok) setRconStatus(await res.json());
    } catch { /* bridge offline */ }
  }, []);

  // ─── Load config ──────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/server/config");
      if (!res.ok) {
        setError(`Bridge returned ${res.status}`);
        setLoading(false);
        return;
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        setError("Bridge returned non-JSON response");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.game || data.bindAddress || data.bindPort) {
        setConfig(data);
        setConfigText(JSON.stringify(data, null, 4));
      } else {
        setError("Unexpected response from bridge");
      }
    } catch {
      setError("Failed to connect to bridge");
    }
    setLoading(false);
  }, []);

  // ─── Poll status ──────────────────────────────────────────────────
  useEffect(() => {
    fetchStatus();
    fetchOllamaHealth();
    loadConfig();
    const iv = setInterval(() => {
      fetchStatus();
      fetchOllamaHealth();
    }, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus, fetchOllamaHealth, loadConfig]);

  // ─── Server actions ───────────────────────────────────────────────
  const serverAction = async (action: string, body?: Record<string, unknown>) => {
    setActionLoading(action);
    setError("");
    setSuccess("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2min timeout
      const res = await fetch(`/api/server/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.status === "ok") {
        setSuccess(data.message || `${action} successful`);
        setTimeout(() => setSuccess(""), 4000);
      } else if (data.status === "already_running") {
        setSuccess("Server is already running");
        setTimeout(() => setSuccess(""), 3000);
      } else if (data.status === "already_stopped") {
        setSuccess("Server is already stopped");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.message || `${action} failed`);
      }
      await fetchStatus();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setSuccess(`${action} sent — check status in a moment`);
        setTimeout(() => setSuccess(""), 5000);
      } else {
        setError(`${action} failed — retrying status check`);
      }
      // Retry status fetch after a delay (server may still be restarting)
      setTimeout(() => fetchStatus(), 5000);
    }
    setActionLoading("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const parsed = JSON.parse(configText);
      const res = await fetch("/api/server/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setSuccess("Config saved (backup created)");
        setConfig(parsed);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.detail || "Save failed");
      }
    } catch (e) {
      setError(`Invalid JSON: ${e}`);
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    setUpdateLog([]);
    setActionLoading("update");
    setError("");
    try {
      const res = await fetch("/api/server/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (data.log) setUpdateLog(data.log);
      if (data.status === "ok") {
        setSuccess("Update complete");
        setTimeout(() => setSuccess(""), 4000);
      } else {
        setError(data.message || "Update failed");
      }
    } catch (e) {
      setError(`Update failed: ${e}`);
    }
    setActionLoading("");
  };

  const handleRconConnect = async () => {
    setActionLoading("rcon-connect");
    try {
      const res = await fetch("/api/rcon/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (data.status !== "ok") setError(data.detail || "RCON connect failed");
      await fetchRconStatus();
    } catch { setError("RCON connect failed"); }
    setActionLoading("");
  };

  const handleRconSend = async () => {
    if (!rconInput.trim()) return;
    setRconLoading(true);
    try {
      await fetch("/api/rcon/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: rconInput.trim() }),
      });
      setRconInput("");
      await fetchRconStatus();
    } catch { /* ignore */ }
    setRconLoading(false);
  };

  const handleWarmup = async () => {
    setActionLoading("warmup");
    try {
      const res = await fetch("/api/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (data.status === "ok") {
        setSuccess(`Model warmed up (${Math.round(data.latency_ms)}ms)`);
        setTimeout(() => setSuccess(""), 4000);
      } else {
        setError(data.detail || "Warmup failed");
      }
      await fetchOllamaHealth();
    } catch (e) {
      setError(`Warmup failed: ${e}`);
    }
    setActionLoading("");
  };

  // Quick config values
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const cfg = config as any;
  const serverName = cfg?.game?.name || "—";
  const maxPlayers = cfg?.game?.maxPlayers || 0;
  const modCount = cfg?.game?.mods?.length || 0;
  const bindPort = cfg?.bindPort || "—";
  const scenario = cfg?.game?.scenarioId || "";
  const scenarioName = scenario ? scenario.replace(/^\{[^}]+\}Missions\//, "").replace(/\.conf$/, "").replace(/_/g, " ") : "—";
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const isRunning = processStatus?.running ?? false;
  const serverStatus = processStatus?.status || "unknown";

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const [consoleAutoScroll, setConsoleAutoScroll] = useState(true);
  const [consoleFilter, setConsoleFilter] = useState("");

  // Auto-scroll console
  useEffect(() => {
    if (consoleAutoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs, consoleAutoScroll]);

  // Poll RCON status when RCON tab is active
  useEffect(() => {
    if (activeTab !== "rcon") return;
    fetchRconStatus();
    const iv = setInterval(fetchRconStatus, 3000);
    return () => clearInterval(iv);
  }, [activeTab, fetchRconStatus]);

  // Auto-scroll RCON log
  useEffect(() => {
    if (rconLogEndRef.current) {
      rconLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [rconStatus?.log]);

  // ─── File browser state ──────────────────────────────────────────
  const [filePath, setFilePath] = useState("");
  const [fileEntries, setFileEntries] = useState<{name: string; path: string; is_dir: boolean; size: number | null; modified: number}[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileViewName, setFileViewName] = useState("");
  const [fileParent, setFileParent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const browseDir = useCallback(async (dir: string) => {
    setFileLoading(true);
    setFileContent(null);
    try {
      const res = await fetch(`/api/server/files?path=${encodeURIComponent(dir)}`);
      const data = await res.json();
      if (data.type === "directory") {
        setFilePath(data.path || "");
        setFileEntries(data.entries || []);
        setFileParent(data.parent ?? null);
      } else if (data.type === "file") {
        setFileContent(data.content);
        setFileViewName(data.name);
      } else if (data.error) {
        setError(data.error);
      }
    } catch { setError("Failed to browse files"); }
    setFileLoading(false);
  }, []);

  const openFile = useCallback(async (path: string) => {
    setFileLoading(true);
    try {
      const res = await fetch(`/api/server/file-content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.content != null) {
        setFileContent(data.content);
        setFileViewName(data.name);
      } else {
        setError(data.error || "Could not read file");
      }
    } catch { setError("Failed to read file"); }
    setFileLoading(false);
  }, []);

  // Load root directory when Files tab first opens
  useEffect(() => {
    if (activeTab === "files" && fileEntries.length === 0) {
      browseDir("");
    }
  }, [activeTab, fileEntries.length, browseDir]);

  function formatFileSize(bytes: number | null): string {
    if (bytes == null) return "—";
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  const TABS = [
    { id: "controls" as const, label: "Controls" },
    { id: "scheduler" as const, label: "Schedule" },
    { id: "rcon" as const, label: "RCON" },
    { id: "console" as const, label: `Console (${consoleLogs.length})` },
    { id: "files" as const, label: "Files" },
    { id: "config" as const, label: "Config Editor" },
    { id: "ollama" as const, label: "AI Engine" },
  ];

  // ─── Scheduler Form ───────────────────────────────────────────────────────
  function SchedulerForm({
    event,
    onSaved,
    onDeleted,
    onCancel,
  }: {
    event?: ScheduledEvent;
    onSaved: (ev: ScheduledEvent) => void;
    onDeleted: (id: string) => void;
    onCancel: () => void;
  }) {
    const isNew = !event;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const [name, setName] = useState(event?.name ?? "");
    const [action, setAction] = useState<ScheduleAction>(event?.action ?? "RESTART");
    const [schedType, setSchedType] = useState<ScheduleType>(event?.schedule.type ?? "daily");
    const [time, setTime] = useState(event?.schedule.time ?? "03:00");
    const [tz, setTz] = useState(event?.schedule.timezone ?? browserTz);
    const [days, setDays] = useState<string[]>(event?.schedule.days ?? ["mon", "wed", "fri", "sat", "sun"]);
    const [intervalHours, setIntervalHours] = useState(event?.schedule.interval_hours ?? 6);
    const [oneTimeDate, setOneTimeDate] = useState(event?.schedule.datetime_utc ? event.schedule.datetime_utc.split("T")[0] : "");
    const [oneTimeTime, setOneTimeTime] = useState(event?.schedule.datetime_utc ? event.schedule.datetime_utc.split("T")[1]?.slice(0, 5) : "12:00");

    // Action params
    const [broadcastMsg, setBroadcastMsg] = useState((event?.params?.message as string) ?? "");
    const [difficultyVal, setDifficultyVal] = useState((event?.params?.value as number) ?? 50);
    const [aiToggleEnabled, setAiToggleEnabled] = useState((event?.params?.enabled as boolean) ?? true);

    // Warnings
    const [warnEnabled, setWarnEnabled] = useState(event?.warnings.enabled ?? true);
    const [warnMsg, setWarnMsg] = useState(event?.warnings.message ?? "[Server] Restarting in {N} minutes.");

    // Player gate
    const [gateEnabled, setGateEnabled] = useState(event?.player_gate.enabled ?? false);
    const [gateMins, setGateMins] = useState(event?.player_gate.defer_minutes ?? 30);

    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const toggleDay = (d: string) => {
      setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
    };

    const buildPayload = () => {
      const params: Record<string, unknown> = {};
      if (action === "BROADCAST") params.message = broadcastMsg;
      if (action === "SET_DIFFICULTY") params.value = difficultyVal;
      if (action === "AI_TOGGLE") params.enabled = aiToggleEnabled;

      const schedule: ScheduleConfig = { type: schedType, timezone: tz };
      if (schedType === "daily" || schedType === "weekly") schedule.time = time;
      if (schedType === "weekly") schedule.days = days;
      if (schedType === "interval") schedule.interval_hours = intervalHours;
      if (schedType === "one_time") {
        // Convert local date+time to UTC ISO
        const localIso = `${oneTimeDate}T${oneTimeTime}`;
        schedule.datetime_utc = new Date(localIso).toISOString();
      }

      return {
        name: name.trim() || "Untitled Event",
        action,
        params,
        schedule,
        warnings: { enabled: warnEnabled, minutes: [15, 5, 1], message: warnMsg },
        player_gate: { enabled: gateEnabled, defer_minutes: gateMins },
        enabled: true,
      };
    };

    const handleSave = async () => {
      setErr("");
      setSaving(true);
      try {
        const payload = buildPayload();
        const url = isNew ? "/api/schedule" : `/api/schedule/${event!.id}`;
        const method = isNew ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        onSaved(isNew ? data.event : data.event);
      } catch (e) {
        setErr(String(e));
      }
      setSaving(false);
    };

    const handleDelete = async () => {
      if (!event) return;
      if (!confirm(`Delete "${event.name}"?`)) return;
      try {
        await fetch(`/api/schedule/${event.id}`, { method: "DELETE" });
        onDeleted(event.id);
      } catch (e) {
        setErr(String(e));
      }
    };

    const showWarnings = action === "RESTART" || action === "RESTART_UPDATE";
    const showGate = action === "RESTART" || action === "RESTART_UPDATE";

    return (
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-white">{isNew ? "New Event" : "Edit Event"}</h3>
          {!isNew && (
            <button onClick={handleDelete} className="text-[10px] text-[#ef4444]/60 hover:text-[#ef4444] transition-colors uppercase tracking-wider">
              Delete
            </button>
          )}
        </div>

        {/* Name */}
        <div>
          <label className="block text-[10px] font-bold text-[#6b6b80] uppercase tracking-wider mb-1.5">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Nightly Restart"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
          />
        </div>

        {/* Action */}
        <div>
          <label className="block text-[10px] font-bold text-[#6b6b80] uppercase tracking-wider mb-1.5">Action</label>
          <select
            value={action}
            onChange={e => setAction(e.target.value as ScheduleAction)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
          >
            {(Object.keys(ACTION_LABELS) as ScheduleAction[]).map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
          {/* Action-specific params */}
          {action === "BROADCAST" && (
            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="Message to broadcast to all players..."
              rows={2}
              className="mt-2 w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-[#22d3ee]/40 focus:outline-none transition-colors resize-none"
            />
          )}
          {action === "SET_DIFFICULTY" && (
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={difficultyVal}
                onChange={e => setDifficultyVal(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-[#22d3ee] font-mono text-[12px] w-8 text-right">{difficultyVal}</span>
            </div>
          )}
          {action === "AI_TOGGLE" && (
            <div className="mt-2 flex gap-3">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setAiToggleEnabled(v)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-colors ${
                    aiToggleEnabled === v
                      ? "bg-[#22c55e]/[0.15] text-[#22c55e] border-[#22c55e]/30"
                      : "bg-white/[0.04] text-[#6b6b80] border-white/[0.08] hover:bg-white/[0.08]"
                  }`}
                >
                  {v ? "Enable" : "Disable"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Schedule type */}
        <div>
          <label className="block text-[10px] font-bold text-[#6b6b80] uppercase tracking-wider mb-1.5">Schedule</label>
          <div className="flex gap-1 mb-3">
            {(["daily", "weekly", "interval", "one_time"] as ScheduleType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setSchedType(t)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-colors ${
                  schedType === t
                    ? "bg-white/[0.08] text-white border-white/[0.15]"
                    : "bg-white/[0.02] text-[#6b6b80] border-white/[0.06] hover:bg-white/[0.06]"
                }`}
              >
                {t === "one_time" ? "Once" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Daily / Weekly time + timezone */}
          {(schedType === "daily" || schedType === "weekly") && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
                />
                <select
                  value={tz}
                  onChange={e => setTz(e.target.value)}
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
                >
                  {COMMON_TIMEZONES.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                  {!COMMON_TIMEZONES.includes(browserTz) && (
                    <option value={browserTz}>{browserTz} (your timezone)</option>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Weekly days */}
          {schedType === "weekly" && (
            <div className="flex gap-1 mt-2">
              {DAYS_OF_WEEK.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`w-7 h-7 rounded-full text-[10px] font-bold transition-colors ${
                    days.includes(d)
                      ? "bg-[#22d3ee]/[0.15] text-[#22d3ee] border border-[#22d3ee]/30"
                      : "bg-white/[0.04] text-[#6b6b80] border border-white/[0.08] hover:bg-white/[0.08]"
                  }`}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          )}

          {/* Interval */}
          {schedType === "interval" && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#6b6b80]">Every</span>
              <input
                type="number"
                min={1}
                max={168}
                value={intervalHours}
                onChange={e => setIntervalHours(Number(e.target.value))}
                className="w-16 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none text-center"
              />
              <span className="text-[12px] text-[#6b6b80]">hours</span>
            </div>
          )}

          {/* One-time */}
          {schedType === "one_time" && (
            <div className="flex gap-2">
              <input
                type="date"
                value={oneTimeDate}
                onChange={e => setOneTimeDate(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
              />
              <input
                type="time"
                value={oneTimeTime}
                onChange={e => setOneTimeTime(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-[#c8c8d0] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
              />
            </div>
          )}
        </div>

        {/* Warnings */}
        {showWarnings && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWarnEnabled(v => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  warnEnabled ? "bg-[#22d3ee]/[0.15] border-[#22d3ee]/40" : "bg-white/[0.04] border-white/[0.1]"
                }`}
              >
                {warnEnabled && <svg className="w-2.5 h-2.5 text-[#22d3ee]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
              </button>
              <label className="text-[11px] text-[#c8c8d0] font-semibold">
                Countdown warnings (at 15m, 5m, 1m before restart)
              </label>
            </div>
            {warnEnabled && (
              <input
                value={warnMsg}
                onChange={e => setWarnMsg(e.target.value)}
                placeholder="[Server] Restarting in {N} minutes."
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-[#22d3ee]/40 focus:outline-none transition-colors"
              />
            )}
          </div>
        )}

        {/* Player gate */}
        {showGate && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGateEnabled(v => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  gateEnabled ? "bg-[#22d3ee]/[0.15] border-[#22d3ee]/40" : "bg-white/[0.04] border-white/[0.1]"
                }`}
              >
                {gateEnabled && <svg className="w-2.5 h-2.5 text-[#22d3ee]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
              </button>
              <label className="text-[11px] text-[#c8c8d0] font-semibold">
                Player-aware: defer restart if players online
              </label>
            </div>
            {gateEnabled && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-[11px] text-[#6b6b80]">Defer up to</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={gateMins}
                  onChange={e => setGateMins(Number(e.target.value))}
                  className="w-14 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-[#c8c8d0] focus:outline-none text-center"
                />
                <span className="text-[11px] text-[#6b6b80]">minutes, then restart anyway</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {err && (
          <div className="text-[11px] text-[#ef4444] bg-[#ef4444]/[0.08] border border-[#ef4444]/20 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <ActionButton onClick={handleSave} variant="green" loading={saving}>
            {isNew ? "CREATE EVENT" : "SAVE CHANGES"}
          </ActionButton>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-[11px] font-bold text-[#6b6b80] hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all"
          >
            CANCEL
          </button>
        </div>
      </div>
    );
  }

  // ─── Scheduler Tab ────────────────────────────────────────────────────────
  function SchedulerTab() {
    const [events, setEvents] = useState<ScheduledEvent[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [, setTick] = useState(0); // forces re-render for countdown updates

    // Poll schedule every 30s when tab is visible
    useEffect(() => {
      if (activeTab !== "scheduler") return;
      const load = async () => {
        try {
          const res = await fetch("/api/schedule");
          if (res.ok) {
            const data = await res.json();
            setEvents(data.events || []);
          }
        } catch { /* bridge offline */ }
      };
      load();
      const poll = setInterval(load, 30000);
      return () => clearInterval(poll);
    }, [activeTab]);

    // Tick every minute to update countdowns
    useEffect(() => {
      const t = setInterval(() => setTick(n => n + 1), 60000);
      return () => clearInterval(t);
    }, []);

    const handleToggle = async (id: string) => {
      try {
        const res = await fetch(`/api/schedule/${id}/toggle`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setEvents(prev => prev.map(e => e.id === id ? { ...e, enabled: data.enabled } : e));
        }
      } catch { /* ignore */ }
    };

    const handleRunNow = async (id: string) => {
      setRunningId(id);
      try {
        await fetch(`/api/schedule/${id}/run`, { method: "POST" });
        // Reload to get updated log
        const res = await fetch("/api/schedule");
        if (res.ok) setEvents((await res.json()).events || []);
      } catch { /* ignore */ }
      setRunningId(null);
    };

    const handleDelete = async (id: string) => {
      try {
        await fetch(`/api/schedule/${id}`, { method: "DELETE" });
        setEvents(prev => prev.filter(e => e.id !== id));
        if (selectedId === id) { setSelectedId(null); setShowForm(false); }
      } catch { /* ignore */ }
    };

    const handleSaved = (saved: ScheduledEvent) => {
      setEvents(prev => {
        const idx = prev.findIndex(e => e.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setShowForm(false);
      setSelectedId(null);
    };

    const nextEvent = events
      .filter(e => e.enabled && e.next_run_utc)
      .sort((a, b) => new Date(a.next_run_utc!).getTime() - new Date(b.next_run_utc!).getTime())[0];

    const editingEvent = selectedId ? events.find(e => e.id === selectedId) : undefined;

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Next event banner */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse shrink-0" />
            {nextEvent ? (
              <span className="text-[12px] text-[#c8c8d0]">
                <span className="text-[#6b6b80] mr-2">NEXT EVENT</span>
                <span className="font-semibold text-white">{nextEvent.name}</span>
                <span className="text-[#22d3ee] ml-2 font-mono">in {formatTimeUntil(nextEvent.next_run_utc)}</span>
              </span>
            ) : (
              <span className="text-[12px] text-[#6b6b80]">No scheduled events</span>
            )}
          </div>
          <button
            onClick={() => { setSelectedId(null); setShowForm(true); }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#22d3ee]/[0.08] border border-[#22d3ee]/20 text-[#22d3ee] text-[11px] font-bold hover:bg-[#22d3ee]/[0.15] transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 4v16m-8-8h16" /></svg>
            ADD EVENT
          </button>
        </div>

        {/* Body: list + form */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Event list */}
          <div className="w-[280px] shrink-0 border-r border-white/[0.04] overflow-y-auto">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="text-[#6b6b80] text-[12px] mb-3">No scheduled events yet.</div>
                <button
                  onClick={() => { setSelectedId(null); setShowForm(true); }}
                  className="text-[11px] text-[#22d3ee] hover:underline"
                >
                  Create your first event →
                </button>
              </div>
            ) : (
              <div className="py-2 space-y-px">
                {events.map(ev => (
                  <div
                    key={ev.id}
                    onClick={() => { setSelectedId(ev.id); setShowForm(true); }}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      selectedId === ev.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                    } ${!ev.enabled ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${ACTION_COLORS[ev.action]}`}>
                          {ev.action.replace("_", " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Run Now */}
                        <button
                          onClick={e => { e.stopPropagation(); handleRunNow(ev.id); }}
                          disabled={runningId === ev.id}
                          title="Run now"
                          className="w-5 h-5 flex items-center justify-center rounded text-[#6b6b80] hover:text-[#22d3ee] hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                        >
                          {runningId === ev.id ? (
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.49 8.49l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.49-8.49l2.83-2.83" /></svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          )}
                        </button>
                        {/* Toggle */}
                        <button
                          onClick={e => { e.stopPropagation(); handleToggle(ev.id); }}
                          title={ev.enabled ? "Disable" : "Enable"}
                          className="w-5 h-5 flex items-center justify-center rounded text-[#6b6b80] hover:text-[#eab308] hover:bg-white/[0.06] transition-colors"
                        >
                          {ev.enabled ? (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="text-[12px] font-semibold text-white truncate mb-0.5">{ev.name}</div>
                    <div className="text-[10px] text-[#6b6b80] truncate">{scheduleLabel(ev)}</div>
                    {ev.enabled && ev.next_run_utc && (
                      <div className="text-[10px] text-[#22d3ee]/70 font-mono mt-0.5">
                        in {formatTimeUntil(ev.next_run_utc)}
                      </div>
                    )}
                    {ev.last_run && (
                      <div className={`text-[9px] mt-1 ${ev.last_run.status === "ok" ? "text-[#22c55e]/60" : "text-[#ef4444]/60"}`}>
                        Last: {ev.last_run.status === "ok" ? "✓" : "✗"} {new Date(ev.last_run.ts).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form or empty state */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {showForm ? (
              <SchedulerForm
                key={selectedId || "new"}
                event={editingEvent}
                onSaved={handleSaved}
                onDeleted={handleDelete}
                onCancel={() => { setShowForm(false); setSelectedId(null); }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="text-[#6b6b80] text-[12px]">Select an event to edit, or add a new one.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-white">Server Management</h2>
            <StatusBadge status={serverStatus} />
          </div>
          {processStatus?.pid && (
            <span className="text-[10px] font-mono text-[#6b6b80]">PID: {processStatus.pid}</span>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-white/[0.08] text-white"
                  : "text-[#6b6b80] hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-[#1c1016] border border-[#3d1f1f] text-[12px] text-[#ef4444]">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg bg-[#101c16] border border-[#1f3d2a] text-[12px] text-[#22c55e]">
          {success}
        </div>
      )}

      {/* ─── Controls Tab ────────────────────────────────────────── */}
      {activeTab === "controls" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {/* Server Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">Server</div>
              <div className="text-sm font-semibold text-white truncate">{serverName}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">Scenario</div>
              <div className="text-sm font-semibold text-white truncate">{scenarioName}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">Max Players</div>
              <div className="text-sm font-mono font-bold text-[#22d3ee]">{maxPlayers}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">Port / Mods</div>
              <div className="text-sm font-mono font-bold text-[#22d3ee]">{bindPort} / {modCount}</div>
            </div>
          </div>

          {/* Server Process Controls */}
          <div>
            <h3 className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase mb-3">Server Process</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ActionButton
                onClick={() => serverAction("start")}
                variant="green"
                disabled={isRunning}
                loading={actionLoading === "start"}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  START
                </span>
              </ActionButton>
              <ActionButton
                onClick={() => serverAction("stop")}
                variant="red"
                disabled={!isRunning && serverStatus !== "unknown"}
                loading={actionLoading === "stop"}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                  STOP
                </span>
              </ActionButton>
              <ActionButton
                onClick={() => serverAction("restart")}
                variant="yellow"
                loading={actionLoading === "restart"}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" /></svg>
                  RESTART
                </span>
              </ActionButton>
              <ActionButton
                onClick={() => serverAction("restart", { check_updates: true })}
                variant="purple"
                disabled={!processStatus?.steamcmd_exists}
                loading={actionLoading === "restart"}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
                  UPDATE & RESTART
                </span>
              </ActionButton>
            </div>
          </div>

          {/* Update Only */}
          <div>
            <h3 className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase mb-3">SteamCMD Update</h3>
            <div className="flex items-center gap-3 mb-3">
              <ActionButton
                onClick={handleUpdate}
                variant="purple"
                disabled={isRunning || !processStatus?.steamcmd_exists}
                loading={actionLoading === "update"}
              >
                CHECK FOR UPDATES
              </ActionButton>
              {!processStatus?.steamcmd_exists && (
                <span className="text-[10px] text-[#ef4444]/70">SteamCMD not found</span>
              )}
              {isRunning && processStatus?.steamcmd_exists && (
                <span className="text-[10px] text-[#eab308]/70">Stop server first</span>
              )}
            </div>
            {updateLog.length > 0 && (
              <div className="bg-[#0a0a12] border border-[#232336] rounded-lg p-3 max-h-[200px] overflow-y-auto font-mono text-[11px] text-[#6b6b80] space-y-0.5">
                {updateLog.map((line, i) => (
                  <div key={i} className={line.includes("Success") ? "text-[#22c55e]" : line.includes("ERROR") ? "text-[#ef4444]" : ""}>{line}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>

          {/* System Info */}
          <div>
            <h3 className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase mb-3">System Info</h3>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]">
              {[
                ["Server Executable", processStatus?.exe_path || "—", processStatus?.exe_exists ? "found" : "missing"],
                ["Config File", processStatus?.config_path || "—", processStatus?.config_exists ? "found" : "missing"],
                ["Install Directory", processStatus?.install_dir || "—", null],
                ["SteamCMD", processStatus?.steamcmd_exists ? "Available" : "Not found", processStatus?.steamcmd_exists ? "ok" : "missing"],
              ].map(([label, value, status]) => (
                <div key={String(label)} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-[#6b6b80]">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-white/80 max-w-[400px] truncate">{value}</span>
                    {status && (
                      <span className={`text-[9px] font-bold uppercase ${status === "found" || status === "ok" ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                        {status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Scheduler Tab ──────────────────────────────────────────── */}
      {activeTab === "scheduler" && <SchedulerTab />}

      {/* ─── Console Tab ──────────────────────────────────────────── */}
      {activeTab === "console" && (() => {
        // Pre-filter entries
        const filtered = consoleLogs.filter(entry => {
          if (!consoleFilter) return true;
          const f = consoleFilter.toLowerCase();
          return entry.msg.toLowerCase().includes(f) || entry.level.toLowerCase().includes(f);
        });
        const errorCount = consoleLogs.filter(e => e.level === "ERROR" || e.level === "FATAL" || e.msg.includes("(E)")).length;
        const warnCount = consoleLogs.filter(e => e.level === "WARNING" || e.level === "WARN").length;

        return (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Toolbar */}
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 shrink-0 bg-[#08080e]">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#44445a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={consoleFilter}
                onChange={(e) => setConsoleFilter(e.target.value)}
                placeholder="Filter..."
                className="w-[180px] bg-white/[0.04] border border-white/[0.06] rounded-md pl-7 pr-2 py-1 text-[11px] font-mono text-[#c8c8d0] placeholder:text-[#3a3a4a] focus:border-[#22d3ee]/30 focus:bg-white/[0.06] focus:outline-none transition-all"
              />
            </div>
            {/* Divider */}
            <div className="w-px h-4 bg-white/[0.06]" />
            {/* Level pills */}
            <div className="flex gap-0.5">
              {[
                { id: "", label: "All", count: consoleLogs.length, color: "" },
                { id: "ERROR", label: "Errors", count: errorCount, color: "#ef4444" },
                { id: "WARNING", label: "Warns", count: warnCount, color: "#eab308" },
              ].map(lvl => {
                const active = consoleFilter === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    onClick={() => setConsoleFilter(lvl.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                      active
                        ? "bg-white/[0.08] text-white/90"
                        : "text-[#55556a] hover:text-[#8888a0] hover:bg-white/[0.03]"
                    }`}
                  >
                    {lvl.color && lvl.count > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lvl.color }} />
                    )}
                    {lvl.label}
                    {lvl.count > 0 && <span className="text-[9px] opacity-50">{lvl.count}</span>}
                  </button>
                );
              })}
            </div>
            {/* Right side */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setConsoleAutoScroll(!consoleAutoScroll)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-all ${
                  consoleAutoScroll ? "text-[#22d3ee] bg-[#22d3ee]/[0.08]" : "text-[#55556a] hover:text-[#8888a0]"
                }`}
                title={consoleAutoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 5v14m0 0l-4-4m4 4l4-4" />
                </svg>
                {consoleAutoScroll ? "Live" : "Paused"}
              </button>
              <div className="w-px h-4 bg-white/[0.06]" />
              <span className="font-mono text-[10px] text-[#3a3a4a]">
                {filtered.length === consoleLogs.length ? consoleLogs.length : `${filtered.length}/${consoleLogs.length}`}
              </span>
            </div>
          </div>

          {/* Console body */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Line numbers gutter */}
            <div className="shrink-0 bg-[#06060a] border-r border-white/[0.04] overflow-hidden select-none" aria-hidden>
              <div className="py-1">
                {filtered.map((_, i) => (
                  <div key={i} className="px-2 text-[10px] text-[#2a2a35] text-right leading-[20px] h-[20px]">
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Log content */}
            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-[#08080e]" id="console-scroll">
              {consoleLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#2a2a3a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <span className="text-[#44445a] text-[11px]">Waiting for server output...</span>
                </div>
              ) : (
                <div className="py-1">
                  {filtered.map((entry, i) => {
                    const msg = entry.msg;

                    // Parse category: "SCRIPT : ...", "WORLD : ...", "ENTITY : ..."
                    let category = "";
                    let cleanMsg = msg;
                    const catMatch = msg.match(/^(\w+)\s*(?:\([^)]*\))?\s*:\s*(.*)/);

                    if (catMatch) {
                      category = catMatch[1];
                      cleanMsg = catMatch[2];
                    }

                    // Detect types
                    const isAIGM = msg.includes("[AI-GM]");
                    const isError = entry.level === "ERROR" || entry.level === "FATAL" || msg.includes("(E):");
                    const isWarn = entry.level === "WARNING" || entry.level === "WARN";
                    const isProfiling = category === "PROFILING";

                    // Left accent bar color
                    const accentColor = isError ? "#ef4444"
                      : isWarn ? "#eab308"
                      : isAIGM ? "#22d3ee"
                      : "transparent";

                    // Row background
                    const rowBg = isError ? "bg-[#ef4444]/[0.03]"
                      : isWarn ? "bg-[#eab308]/[0.02]"
                      : isAIGM ? "bg-[#22d3ee]/[0.02]"
                      : "";

                    // Message text color
                    const msgColor = isError ? "text-[#fca5a5]"
                      : isWarn ? "text-[#fde68a]"
                      : isAIGM ? "text-[#67e8f9]"
                      : isProfiling ? "text-[#4a4a5a]"
                      : "text-[#8b8ba0]";

                    // Category badge colors
                    const catBadge: Record<string, string> = {
                      SCRIPT: "text-[#c4b5fd] bg-[#7c3aed]/10",
                      WORLD: "text-[#6ee7b7] bg-[#059669]/10",
                      ENTITY: "text-[#93c5fd] bg-[#2563eb]/10",
                      RESOURCES: "text-[#fdba74] bg-[#ea580c]/10",
                      PROFILING: "text-[#52525b] bg-white/[0.02]",
                      NETWORK: "text-[#67e8f9] bg-[#0891b2]/10",
                    };
                    const badgeStyle = catBadge[category] || "";

                    // Show/hide timestamp (collapse if same as previous)
                    const prevEntry = i > 0 ? filtered[i - 1] : null;
                    const timeStr = entry.time?.split(" ").pop()?.slice(0, 8) || "";
                    const prevTime = prevEntry?.time?.split(" ").pop()?.slice(0, 8) || "";
                    const showTime = timeStr !== prevTime;

                    return (
                      <div
                        key={i}
                        className={`group flex items-start h-[20px] leading-[20px] font-mono hover:bg-white/[0.03] transition-colors ${rowBg}`}
                        style={{ borderLeft: `2px solid ${accentColor}` }}
                      >
                        {/* Timestamp */}
                        <span className={`shrink-0 w-[62px] text-[10px] pl-2 select-none tabular-nums ${showTime ? "text-[#4a4a5a]" : "text-transparent group-hover:text-[#3a3a4a]"}`}>
                          {timeStr}
                        </span>
                        {/* Category */}
                        <span className="shrink-0 w-[72px] flex items-center">
                          {category && badgeStyle ? (
                            <span className={`px-1.5 rounded text-[9px] font-semibold leading-[16px] ${badgeStyle}`}>
                              {category.length > 8 ? category.slice(0, 7) + "…" : category}
                            </span>
                          ) : null}
                        </span>
                        {/* Message */}
                        <span className={`${msgColor} text-[11px] truncate pr-3`} title={msg}>
                          {cleanMsg}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={consoleEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ─── Files Tab ────────────────────────────────────────────── */}
      {activeTab === "files" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Breadcrumb bar */}
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-1 shrink-0 bg-[#08080e] text-[11px] font-mono">
            <button onClick={() => { browseDir(""); setFileContent(null); }} className="text-[#22d3ee] hover:text-[#67e8f9] transition-colors">
              server
            </button>
            {filePath && !fileContent && filePath.split(/[/\\]/).filter(Boolean).map((seg, i, arr) => {
              const partial = arr.slice(0, i + 1).join("/");
              return (
                <span key={partial} className="flex items-center gap-1">
                  <span className="text-[#3a3a4a]">/</span>
                  <button onClick={() => browseDir(partial)} className="text-[#8b8ba0] hover:text-white transition-colors">
                    {seg}
                  </button>
                </span>
              );
            })}
            {fileContent && (
              <>
                <span className="text-[#3a3a4a]">/</span>
                <span className="text-white font-semibold">{fileViewName}</span>
                <button
                  onClick={() => setFileContent(null)}
                  className="ml-auto px-2 py-0.5 rounded text-[10px] text-[#6b6b80] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-all"
                >
                  ← Back
                </button>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-[#08080e]">
            {fileLoading ? (
              <div className="flex items-center justify-center h-full text-[#6b6b80] text-xs">Loading...</div>
            ) : fileContent != null ? (
              /* File viewer */
              <div className="flex min-h-full">
                {/* Line numbers */}
                <div className="shrink-0 bg-[#06060a] border-r border-white/[0.04] select-none py-2 pr-1">
                  {fileContent.split("\n").map((_, i) => (
                    <div key={i} className="px-2 text-[10px] text-[#2a2a35] text-right leading-[18px] h-[18px] font-mono">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <pre className="flex-1 p-2 text-[11px] font-mono text-[#9b9bb0] leading-[18px] overflow-x-auto whitespace-pre">
                  {fileContent}
                </pre>
              </div>
            ) : (
              /* Directory listing */
              <div className="divide-y divide-white/[0.03]">
                {fileParent != null && (
                  <button
                    onClick={() => browseDir(fileParent!)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <svg className="w-4 h-4 text-[#6b6b80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="text-[12px] text-[#6b6b80]">..</span>
                  </button>
                )}
                {fileEntries.map(entry => (
                  <button
                    key={entry.path}
                    onClick={() => entry.is_dir ? browseDir(entry.path) : openFile(entry.path)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/[0.03] transition-colors text-left group"
                  >
                    {entry.is_dir ? (
                      <svg className="w-4 h-4 text-[#eab308]/70 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-[#6b6b80] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    )}
                    <span className={`flex-1 text-[12px] font-mono truncate ${entry.is_dir ? "text-white/90" : "text-[#8b8ba0] group-hover:text-white"}`}>
                      {entry.name}
                    </span>
                    {!entry.is_dir && entry.size != null && (
                      <span className="text-[10px] font-mono text-[#3a3a4a] shrink-0">
                        {formatFileSize(entry.size)}
                      </span>
                    )}
                    <span className="text-[10px] text-[#2a2a35] shrink-0 w-[120px] text-right">
                      {entry.modified ? new Date(entry.modified * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </button>
                ))}
                {fileEntries.length === 0 && (
                  <div className="flex items-center justify-center py-16 text-[#44445a] text-xs">Empty directory</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Config Editor Tab ───────────────────────────────────── */}
      {activeTab === "config" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Quick Stats */}
          {config && (
            <div className="px-6 py-3 border-b border-white/[0.04] flex flex-wrap items-center gap-x-6 gap-y-1 shrink-0">
              <div className="text-xs"><span className="text-[#6b6b80]">Server: </span><span className="text-white font-semibold">{serverName}</span></div>
              <div className="text-xs"><span className="text-[#6b6b80]">Max Players: </span><span className="text-[#22d3ee] font-mono font-semibold">{maxPlayers}</span></div>
              <div className="text-xs"><span className="text-[#6b6b80]">Port: </span><span className="text-[#22d3ee] font-mono font-semibold">{bindPort}</span></div>
              <div className="text-xs"><span className="text-[#6b6b80]">Mods: </span><span className="text-[#22d3ee] font-mono font-semibold">{modCount}</span></div>
              <div className="ml-auto flex gap-2">
                <button onClick={loadConfig} className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-[#6b6b80] hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-all">RELOAD</button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-md text-[11px] font-semibold text-white bg-[#5865F2] hover:bg-[#4e5bda] transition-all disabled:opacity-50">{saving ? "SAVING..." : "SAVE"}</button>
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0 p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full text-[#6b6b80] text-sm">Loading config...</div>
            ) : (
              <textarea
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                spellCheck={false}
                className="w-full h-full bg-[#0a0a12] border border-[#232336] rounded-lg p-4 text-[13px] font-mono text-[#c8c8d0] leading-relaxed resize-none focus:border-[#5865F2] focus:ring-1 focus:ring-[#5865F2]/20 focus:outline-none"
              />
            )}
          </div>
        </div>
      )}

      {/* ─── AI Engine Tab ────────────────────────────────────────── */}
      {activeTab === "ollama" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {/* AI Engine Status */}
          <div>
            <h3 className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase mb-3">
              {ollamaHealth?.engine === "ollama" ? "Ollama" : "vLLM"} / AI Engine Status
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
                <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">Connection</div>
                <div className={`text-sm font-bold ${ollamaHealth?.reachable ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                  {ollamaHealth?.reachable ? "ONLINE" : "OFFLINE"}
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
                <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">Latency</div>
                <div className="text-sm font-mono font-bold text-[#22d3ee]">
                  {ollamaHealth?.latency_ms ? `${Math.round(ollamaHealth.latency_ms)}ms` : "—"}
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
                <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">Model</div>
                <div className={`text-sm font-bold ${ollamaHealth?.model_found ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                  {ollamaHealth?.model_found ? "LOADED" : "NOT FOUND"}
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
                <div className="text-[9px] font-bold tracking-wider text-[#6b6b80] uppercase mb-1">
                  {ollamaHealth?.model_size_gb ? "Size" : "Models"}
                </div>
                <div className="text-sm font-mono font-bold text-[#22d3ee]">
                  {ollamaHealth?.model_size_gb ? `${ollamaHealth.model_size_gb} GB` : (ollamaHealth?.total_models ?? "—")}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <ActionButton onClick={handleWarmup} variant="purple" loading={actionLoading === "warmup"}>
                WARM UP MODEL
              </ActionButton>
              <ActionButton onClick={fetchOllamaHealth} variant="default">
                REFRESH STATUS
              </ActionButton>
            </div>
          </div>

          {/* Model Details */}
          <div>
            <h3 className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase mb-3">Model Configuration</h3>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]">
              {([
                ["Model", ollamaHealth?.model_name || "—"],
                ["Engine", ollamaHealth?.engine === "ollama" ? "Ollama" : "vLLM"],
                ["Backend URL", ollamaHealth?.ollama_url || "—"],
                ["Context Window", ollamaHealth?.max_model_len ? `${ollamaHealth.max_model_len.toLocaleString()} tokens` : "—"],
                ...(ollamaHealth?.engine === "ollama" ? [
                  ["KV Cache", ollamaHealth.kv_cache_type?.toUpperCase() || "f16"],
                  ["Flash Attention", ollamaHealth.flash_attention ? "Enabled" : "Disabled"],
                ] as [string, string][] : []),
                ["Features", ollamaHealth?.features?.join(" · ") || "—"],
                ["Hardware", ollamaHealth?.hardware || "—"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-[#6b6b80]">{label}</span>
                  <span className="text-[11px] font-mono text-white/80 text-right max-w-[200px] truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div>
            <h3 className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase mb-3">Performance Notes</h3>
            <div className="space-y-2 text-[12px] text-[#8b8b9e]">
              {ollamaHealth?.engine === "ollama" ? (<>
                <p className="flex gap-2"><span className="text-[#22d3ee]">1.</span> First query after startup loads the model into VRAM. Use Warm Up to eliminate the cold-start delay.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">2.</span> Qwen3 thinks using <code className="text-[#22d3ee] bg-white/[0.04] px-1 rounded">/no_think</code> — thinking is disabled for faster JSON output and more predictable structure.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">3.</span> KV cache is quantized to <code className="text-[#22d3ee] bg-white/[0.04] px-1 rounded">{ollamaHealth?.kv_cache_type || "q8_0"}</code> — halves KV memory with negligible quality loss.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">4.</span> Flash Attention reduces memory bandwidth for long contexts. Required for KV quantization to activate.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">5.</span> Model stays resident in VRAM between queries (<code className="text-[#22d3ee] bg-white/[0.04] px-1 rounded">KEEP_ALIVE=30m</code>) — no VRAM reload between heartbeats.</p>
              </>) : (<>
                <p className="flex gap-2"><span className="text-[#22d3ee]">1.</span> First query after startup triggers CUDA graph capture + KV cache init. Use Warm Up to pre-load.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">2.</span> Simple commands use fast inference. Complex operations use agent loop with multi-turn reasoning.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">3.</span> vLLM chunked prefill is enabled — long prompts are batched efficiently.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">4.</span> Tool calling with thinking disabled for reliable structured output.</p>
                <p className="flex gap-2"><span className="text-[#22d3ee]">5.</span> Model stays loaded in GPU memory between queries — no cold starts after warmup.</p>
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ─── RCON Tab ────────────────────────────────────── */}
      {activeTab === "rcon" && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-6 gap-4">
          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            <span className="text-[11px] font-bold tracking-wider text-[#6b6b80] uppercase">RCON</span>
            {rconStatus ? (
              <StatusBadge
                status={
                  rconStatus.authenticated ? "running"
                  : rconStatus.connected ? "starting"
                  : "stopped"
                }
              />
            ) : (
              <StatusBadge status="unknown" />
            )}
            {rconStatus?.host && (
              <span className="text-[10px] font-mono text-[#6b6b80]">
                {rconStatus.host}:{rconStatus.port}
              </span>
            )}
            <ActionButton
              onClick={handleRconConnect}
              loading={actionLoading === "rcon-connect"}
            >
              {rconStatus?.connected ? "Reconnect" : "Connect"}
            </ActionButton>
            {rconStatus?.error && (
              <span className="text-[10px] text-[#ef4444] truncate max-w-xs">{rconStatus.error}</span>
            )}
          </div>

          {/* Log */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-black/20 rounded-lg border border-white/[0.06] p-3 font-mono text-[11px] space-y-0.5">
            {(rconStatus?.log ?? []).length === 0 && (
              <span className="text-[#6b6b80]">
                No output. Connect to an Arma Reforger server with RCON enabled on port {rconStatus?.port ?? 16666}.
              </span>
            )}
            {(rconStatus?.log ?? []).map((entry, i) => (
              <div
                key={i}
                className={`flex gap-2 leading-5 ${
                  entry.direction === "sent"
                    ? "text-[#22d3ee]/80"
                    : entry.direction === "system"
                    ? "text-[#6b6b80]"
                    : entry.direction === "server"
                    ? "text-[#eab308]/80"
                    : "text-white/70"
                }`}
              >
                <span className="text-[#6b6b80] shrink-0 tabular-nums">
                  {new Date(entry.ts * 1000).toLocaleTimeString()}
                </span>
                <span className="shrink-0 w-3">
                  {entry.direction === "sent" ? "▶" : entry.direction === "recv" ? "◀" : "·"}
                </span>
                <span className="break-all">{entry.text}</span>
              </div>
            ))}
            <div ref={rconLogEndRef} />
          </div>

          {/* Command input */}
          <div className="flex gap-2 shrink-0">
            <input
              value={rconInput}
              onChange={e => setRconInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !rconLoading) handleRconSend(); }}
              placeholder={
                rconStatus?.authenticated
                  ? "Enter RCON command (e.g. #players, say -1 hello)..."
                  : "Connect first to send commands"
              }
              disabled={!rconStatus?.authenticated || rconLoading}
              className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] font-mono text-white placeholder:text-[#6b6b80]/60 focus:outline-none focus:border-white/[0.15] disabled:opacity-40"
            />
            <ActionButton
              onClick={handleRconSend}
              disabled={!rconStatus?.authenticated || !rconInput.trim()}
              loading={rconLoading}
            >
              Send
            </ActionButton>
          </div>

          {/* Quick commands */}
          <div className="flex gap-2 flex-wrap shrink-0">
            {["#players", "say -1 Hello", "#shutdown"].map(cmd => (
              <button
                key={cmd}
                type="button"
                onClick={() => setRconInput(cmd)}
                disabled={!rconStatus?.authenticated}
                className="px-3 py-1.5 text-[10px] font-mono rounded-md border border-white/[0.06] text-[#6b6b80] hover:text-white hover:border-white/[0.12] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
