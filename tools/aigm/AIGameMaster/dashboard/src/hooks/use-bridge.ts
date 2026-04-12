"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  GameState,
  Command,
  ServerLog,
  ChatEntry,
  InitData,
  WSMessage,
  ServerInfo,
  ConsoleLogEntry,
} from "@/lib/types";

// Use relative URLs so Next.js rewrites proxy to bridge.py
// This works both locally and over Tailscale
const BRIDGE_URL = "";

interface BridgeState {
  connected: boolean;
  sparkOnline: boolean;
  serverOnline: boolean;
  aiThinking: boolean;
  aiEnabled: boolean;
  gmMode: "on_demand" | "autonomous";
  difficulty: number;
  escalation: number;
  gameState: GameState | null;
  chatHistory: ChatEntry[];
  commandLog: Command[];
  serverLogs: ServerLog[];
  streamTokens: number;
  totalSpawns: number;
  totalDecisions: number;
  totalHeartbeats: number;
  uptime: number;
  heartbeatInterval: number;
  activeMission: string;
  servers: ServerInfo[];
  activeServerId: string | null;
  consoleLogs: ConsoleLogEntry[];
  model: string;
  lastLatencyMs: number;
  pendingCommands: number;
}

export function useBridge() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeServerRef = useRef<string | null>(null);

  const [state, setState] = useState<BridgeState>({
    connected: false,
    sparkOnline: false,
    serverOnline: false,
    aiThinking: false,
    aiEnabled: true,
    gmMode: "on_demand",
    difficulty: 50,
    escalation: 0,
    gameState: null,
    chatHistory: [],
    commandLog: [],
    serverLogs: [],
    streamTokens: 0,
    totalSpawns: 0,
    totalDecisions: 0,
    totalHeartbeats: 0,
    uptime: 0,
    heartbeatInterval: 90,
    activeMission: "",
    servers: [],
    activeServerId: null,
    consoleLogs: [],
    model: "",
    lastLatencyMs: 0,
    pendingCommands: 0,
  });

  const handleMessage = useCallback((msg: WSMessage) => {
    const activeId = activeServerRef.current;
    const msgServerId = msg.server_id;

    // Helper: check if this message is for the active server
    const isActiveServer = () => !activeId || !msgServerId || msgServerId === activeId;

    switch (msg.event) {
      case "init": {
        const d = msg.data as InitData;
        const serverId = d.server_id || null;
        // Filter out the "default" placeholder — only show real connected servers
        const realServers = (d.servers || []).filter(s => s.server_id !== "default");
        // Auto-select first real server if the current selection is "default" or missing
        const resolvedId = (serverId && serverId !== "default") ? serverId
          : realServers.length > 0 ? realServers[0].server_id
          : null;
        activeServerRef.current = resolvedId;
        setState((prev) => ({
          ...prev,
          gameState: d.state || null,
          aiEnabled: d.ai_enabled,
          gmMode: d.gm_mode,
          difficulty: d.difficulty,
          escalation: d.escalation,
          chatHistory: prev.chatHistory.length > 0 ? prev.chatHistory : (d.chat_history || []).map((h: { role: string; content: string }) => ({
            role: h.role as "user" | "assistant",
            content: h.content,
          })),
          serverLogs: d.server_logs || [],
          consoleLogs: d.console_logs || prev.consoleLogs,
          sparkOnline: true,
          serverOnline: (d.state?.player_count ?? 0) > 0,
          servers: realServers,
          activeServerId: resolvedId,
          activeMission: d.mission || "",
        }));
        // If we auto-selected a different server, tell the bridge
        if (resolvedId && resolvedId !== serverId) {
          wsRef.current?.send(JSON.stringify({ action: "select_server", server_id: resolvedId }));
        }
        break;
      }
      case "state_update": {
        if (!isActiveServer()) break;
        const gs = msg.data as GameState;
        setState((prev) => ({
          ...prev,
          gameState: gs,
          serverOnline: (gs?.player_count ?? 0) > 0,
        }));
        break;
      }
      case "ai_thinking": {
        if (!isActiveServer()) break;
        const d = msg.data as { thinking: boolean };
        setState((prev) => ({
          ...prev,
          aiThinking: d.thinking,
          streamTokens: d.thinking ? 0 : prev.streamTokens,
        }));
        break;
      }
      case "ai_streaming": {
        if (!isActiveServer()) break;
        const d = msg.data as { tokens: number };
        setState((prev) => ({ ...prev, streamTokens: d.tokens }));
        break;
      }
      case "ai_decision": {
        if (!isActiveServer()) break;
        const d = msg.data as { commands: Command[] };
        if (d.commands) {
          setState((prev) => ({
            ...prev,
            commandLog: [...d.commands, ...prev.commandLog].slice(0, 100),
            totalDecisions: prev.totalDecisions + 1,
            totalSpawns:
              prev.totalSpawns +
              d.commands.filter((c) => c.type === "SPAWN").reduce((sum, c) => sum + c.count, 0),
          }));
        }
        break;
      }
      case "config_update": {
        if (!isActiveServer()) break;
        const d = msg.data as { ai_enabled: boolean; gm_mode: string; difficulty: number };
        setState((prev) => ({
          ...prev,
          aiEnabled: d.ai_enabled,
          gmMode: d.gm_mode as "on_demand" | "autonomous",
          difficulty: d.difficulty,
        }));
        break;
      }
      case "mission_update": {
        if (!isActiveServer()) break;
        const d = msg.data as { briefing: string };
        setState((prev) => ({ ...prev, activeMission: d.briefing || "" }));
        break;
      }
      case "chat_response": {
        if (!isActiveServer()) break;
        const d = msg.data as { message: string; reply: string; commands: Command[] };
        setState((prev) => {
          // Skip if this reply was already added by the API response
          const lastMsg = prev.chatHistory[prev.chatHistory.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg?.content === d.reply) {
            return { ...prev, aiThinking: false };
          }
          return {
            ...prev,
            aiThinking: false,
            chatHistory: [
              ...prev.chatHistory,
              { role: "assistant" as const, content: d.reply },
            ],
            commandLog: d.commands
              ? [...d.commands, ...prev.commandLog].slice(0, 100)
              : prev.commandLog,
          };
        });
        break;
      }
      case "server_log": {
        if (!isActiveServer()) break;
        const d = msg.data as ServerLog;
        setState((prev) => ({
          ...prev,
          serverLogs: [...prev.serverLogs, d].slice(-200),
        }));
        break;
      }
      case "console_log": {
        if (!isActiveServer()) break;
        const d = msg.data as ConsoleLogEntry;
        setState((prev) => ({
          ...prev,
          consoleLogs: [...prev.consoleLogs, d].slice(-500),
        }));
        break;
      }
      case "server_list": {
        const d = msg.data as ServerInfo[];
        // Filter out the "default" placeholder
        const realServers = d.filter(s => s.server_id !== "default");
        setState((prev) => {
          const currentId = prev.activeServerId;
          // If no server selected yet (or selected one disappeared), auto-select first real one
          const needsAutoSelect = !currentId || currentId === "default" ||
            !realServers.some(s => s.server_id === currentId);
          const newActiveId = needsAutoSelect && realServers.length > 0
            ? realServers[0].server_id
            : currentId;

          if (needsAutoSelect && newActiveId && newActiveId !== currentId) {
            activeServerRef.current = newActiveId;
            wsRef.current?.send(JSON.stringify({ action: "select_server", server_id: newActiveId }));
          }

          return {
            ...prev,
            servers: realServers,
            activeServerId: newActiveId,
          };
        });
        break;
      }
    }
  }, []);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const d = await res.json();
        const servers = (d.servers || []).filter((s: { server_id: string }) => s.server_id !== "default");
        const resolvedId = servers.length > 0 ? servers[0].server_id : null;
        if (resolvedId) activeServerRef.current = resolvedId;
        setState((prev) => ({
          ...prev,
          connected: true,
          sparkOnline: !!d.ai_enabled,
          bridgeOnline: d.bridge === "online",
          serverOnline: (d.current_state?.player_count ?? 0) > 0,
          gameState: d.current_state || prev.gameState,
          aiEnabled: d.ai_enabled ?? prev.aiEnabled,
          aiThinking: d.ai_thinking ?? d.query_in_flight ?? prev.aiThinking,
          gmMode: (d.gm_mode as "on_demand" | "autonomous") ?? prev.gmMode,
          difficulty: d.difficulty ?? prev.difficulty,
          escalation: d.escalation ?? prev.escalation,
          totalSpawns: d.total_spawns ?? prev.totalSpawns,
          totalDecisions: d.total_decisions ?? prev.totalDecisions,
          totalHeartbeats: d.total_heartbeats ?? prev.totalHeartbeats,
          uptime: d.uptime_seconds ?? prev.uptime,
          heartbeatInterval: d.heartbeat_interval ?? prev.heartbeatInterval,
          chatHistory: prev.chatHistory.length > 0 ? prev.chatHistory : (d.chat_history?.map((h: { role: string; content: string }) => ({ role: h.role, content: h.content })) ?? prev.chatHistory),
          commandLog: d.recent_commands ?? prev.commandLog,
          consoleLogs: d.console_logs ?? prev.consoleLogs,
          serverLogs: d.server_logs ?? prev.serverLogs,
          servers,
          activeServerId: resolvedId || prev.activeServerId,
          model: d.model ?? prev.model,
          lastLatencyMs: d.last_ai_latency_ms ?? prev.lastLatencyMs,
          pendingCommands: d.pending_commands ?? prev.pendingCommands,
        }));
      } catch {
        setState((prev) => ({ ...prev, connected: false }));
      }
    }, 1500);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Always use /ws through the server proxy (works for both HTTP and HTTPS)
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
      // Keep polling running alongside WS — polling fills in console logs
      // and any data missed during WS reconnects
      if (!pollingRef.current) startPolling();
    };

    ws.onerror = () => {
      // WS failed — start HTTP polling fallback
      if (!pollingRef.current) startPolling();
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, connected: false, sparkOnline: false }));
      // Start polling immediately on close as fallback
      if (!pollingRef.current) startPolling();
      reconnectTimer.current = setTimeout(connect, 5000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg: WSMessage = JSON.parse(ev.data);
        handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    wsRef.current = ws;
  }, [handleMessage, startPolling]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [connect]);

  // Keep activeServerRef in sync with state
  useEffect(() => {
    activeServerRef.current = state.activeServerId;
  }, [state.activeServerId]);

  const selectServer = useCallback((serverId: string) => {
    setState(prev => ({
      ...prev,
      activeServerId: serverId,
      consoleLogs: [],
      commandLog: [],
      chatHistory: [],
      totalSpawns: 0,
      totalDecisions: 0,
      totalHeartbeats: 0,
    }));
    wsRef.current?.send(JSON.stringify({ action: "select_server", server_id: serverId }));
  }, []);

  // ─── API Calls ──────────────────────────────────────────────────────────

  const api = useCallback(async (path: string, body?: unknown) => {
    try {
      const res = await fetch(`${BRIDGE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json();
    } catch {
      // Bridge offline — silently ignore
      return {};
    }
  }, []);

  const thinkingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sendChat = useCallback(
    async (message: string) => {
      setState((prev) => ({
        ...prev,
        chatHistory: [...prev.chatHistory, { role: "user", content: message }],
        aiThinking: true,
      }));
      clearTimeout(thinkingTimeout.current);
      thinkingTimeout.current = setTimeout(() => {
        setState((prev) => prev.aiThinking ? { ...prev, aiThinking: false } : prev);
      }, 90000);
      const result = await api("/api/chat", { message, server_id: activeServerRef.current });
      clearTimeout(thinkingTimeout.current);
      // Use API response directly — don't rely on WS event
      if (result?.reply) {
        setState((prev) => ({
          ...prev,
          aiThinking: false,
          chatHistory: [...prev.chatHistory, { role: "assistant", content: result.reply }],
          commandLog: result.commands
            ? [...result.commands, ...prev.commandLog].slice(0, 100)
            : prev.commandLog,
        }));
      } else {
        setState((prev) => ({ ...prev, aiThinking: false }));
      }
      return result;
    },
    [api]
  );

  const setConfig = useCallback(
    (config: { ai_enabled?: boolean; difficulty?: number; gm_mode?: string; escalation?: number }) => {
      // Optimistic update — reflect change instantly in UI
      setState((prev) => ({
        ...prev,
        ...(config.ai_enabled !== undefined && { aiEnabled: config.ai_enabled }),
        ...(config.difficulty !== undefined && { difficulty: config.difficulty }),
        ...(config.gm_mode !== undefined && { gmMode: config.gm_mode as "on_demand" | "autonomous" }),
        // escalation from server uses 0-4 levels; slider sends 0-100 so wait for server echo
      }));
      return api("/api/config", { ...config, server_id: activeServerRef.current });
    },
    [api]
  );

  const triggerNow = useCallback(async () => {
    setState((prev) => ({ ...prev, aiThinking: true }));
    clearTimeout(thinkingTimeout.current);
    thinkingTimeout.current = setTimeout(() => {
      setState((prev) => prev.aiThinking ? { ...prev, aiThinking: false } : prev);
    }, 90000);
    const result = await api("/api/trigger", { server_id: activeServerRef.current });
    if (!result || Object.keys(result).length === 0) {
      setState((prev) => ({ ...prev, aiThinking: false }));
      clearTimeout(thinkingTimeout.current);
    }
    return result;
  }, [api]);
  const warmup = useCallback(() => api("/api/warmup", { server_id: activeServerRef.current }), [api]);
  const deleteAllAI = useCallback(() => api("/api/admin", { command: "delete_all", server_id: activeServerRef.current }), [api]);
  const clearQueue = useCallback(() => api("/api/admin", { command: "clear_queue", server_id: activeServerRef.current }), [api]);

  const sendMission = useCallback(
    (briefing: string) => api("/api/mission", { briefing, server_id: activeServerRef.current }),
    [api]
  );

  const clearMission = useCallback(async () => {
    await fetch(`${BRIDGE_URL}/api/mission`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: activeServerRef.current }),
    });
  }, []);

  const manualSpawn = useCallback(
    (units: string, count: number, grid: string, behavior: string) =>
      api("/api/admin", { command: "spawn", units, count, grid, behavior, server_id: activeServerRef.current }),
    [api]
  );

  const wsTrigger = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: "trigger" }));
  }, []);

  return {
    ...state,
    sendChat,
    setConfig,
    triggerNow,
    warmup,
    deleteAllAI,
    clearQueue,
    sendMission,
    clearMission,
    manualSpawn,
    wsTrigger,
    selectServer,
  };
}
