"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatEntry, Command, ServerLog, ConsoleLogEntry } from "@/lib/types";

interface ChatPanelProps {
  chatHistory: ChatEntry[];
  commandLog: Command[];
  serverLogs: ServerLog[];
  consoleLogs: ConsoleLogEntry[];
  onSendChat: (message: string) => void;
  aiThinking: boolean;
  onClose?: () => void;
}

const QUICK_COMMANDS = [
  {
    group: "SPAWN",
    color: "text-tactical-red",
    cmds: [
      { label: "QRF", cmd: "Deploy QRF — 8-12 infantry near players, hunt behavior, aggressive", icon: "+" },
      { label: "Ambush", cmd: "Set up ambush on nearest road to players with 2 fireteams and MG", icon: "+" },
      { label: "Snipers", cmd: "Deploy 2 sniper teams 500-800m from players on high ground", icon: "+" },
      { label: "Assault", cmd: "Full combined arms assault on player positions from multiple directions", icon: "+" },
      { label: "Motorized", cmd: "Deploy motorized patrol with 2 vehicles near players", icon: "+" },
      { label: "Checkpoint", cmd: "Set up defensive checkpoint with infantry and MG on nearest road", icon: "+" },
      { label: "Armor", cmd: "Deploy light armor with infantry escort toward players", icon: "+" },
      { label: "Recon", cmd: "Deploy recon element — 2 small fireteams scouting player area", icon: "+" },
    ],
  },
  {
    group: "TACTICAL",
    color: "text-tactical-yellow",
    cmds: [
      { label: "Pincer", cmd: "Flank from east while element approaches from west — pincer", icon: "+" },
      { label: "Reinforce", cmd: "Reinforce current OPFOR positions with additional infantry", icon: "+" },
      { label: "Retreat", cmd: "Retreat all AI to defensive positions away from players", icon: "+" },
      { label: "Encircle", cmd: "Encircle player positions, cut off escape routes", icon: "+" },
    ],
  },
  {
    group: "OPERATIONS",
    color: "text-tactical-purple",
    cmds: [
      { label: "Phased Op", cmd: "Multi-phase op: recon probes, then fire support, then assault from two directions", icon: "+" },
      { label: "Guerrilla", cmd: "Guerrilla campaign — small hit-and-run teams from different directions", icon: "+" },
      { label: "Populate", cmd: "Populate area with ambient military presence — patrols, guards, checkpoints", icon: "+" },
      { label: "HVT", cmd: "Spawn HVT — command vehicle or officer with security detail", icon: "+" },
    ],
  },
  {
    group: "MANAGE",
    color: "text-cyan",
    cmds: [
      { label: "Reinforce", cmd: "Reinforce the closest group to players with additional units", icon: "↑" },
      { label: "Hunt Mode", cmd: "Set all AI groups to hunt behavior — pursue players aggressively", icon: "→" },
      { label: "Hold Fire", cmd: "Set all AI groups to defend behavior — hold current positions", icon: "■" },
      { label: "Delete OPFOR", cmd: "Delete all OPFOR units from the map", icon: "×" },
      { label: "Overwatch", cmd: "Set up overwatch positions on high ground overlooking players", icon: "◎" },
      { label: "Pull Back", cmd: "Move all AI groups to retreat away from players", icon: "←" },
    ],
  },
];

export function ChatPanel({
  chatHistory,
  commandLog,
  serverLogs,
  consoleLogs,
  onSendChat,
  aiThinking,
  onClose,
}: ChatPanelProps) {
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "commands" | "logs" | "console">("chat");
  const [showQuickCmds, setShowQuickCmds] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrolledUpRef = useRef(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const consoleContainerRef = useRef<HTMLDivElement>(null);
  const [consoleScrolledUp, setConsoleScrolledUp] = useState(false);
  const consoleScrolledUpRef = useRef(false);
  const [consoleFilter, setConsoleFilter] = useState<string>("ALL");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Only auto-scroll logs if user hasn't scrolled up
  useEffect(() => {
    if (activeTab === "logs" && !scrolledUpRef.current) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverLogs, activeTab]);

  // Auto-scroll console logs
  useEffect(() => {
    if (activeTab === "console" && !consoleScrolledUpRef.current) {
      consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs, activeTab]);

  // Reset scroll tracking when switching tabs
  useEffect(() => {
    scrolledUpRef.current = false;
    setIsScrolledUp(false);
  }, [activeTab]);

  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    scrolledUpRef.current = !atBottom;
    setIsScrolledUp(!atBottom);
  };

  const handleConsoleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    consoleScrolledUpRef.current = !atBottom;
    setConsoleScrolledUp(!atBottom);
  };

  const filteredConsoleLogs = consoleLogs.filter(l =>
    consoleFilter === "ALL" || l.level === consoleFilter
  );

  const handleSend = () => {
    if (!message.trim() || aiThinking) return;
    onSendChat(message.trim());
    setMessage("");
  };

  const tabs = [
    { id: "chat" as const, label: "Zeus Comms", count: 0 },
    { id: "commands" as const, label: "Commands", count: commandLog.length },
    { id: "logs" as const, label: "Bridge Logs", count: 0 },
    { id: "console" as const, label: "Console", count: 0 },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div className="flex items-stretch border-b border-white/[0.04] shrink-0 bg-card/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 px-2 py-3 text-[11px] font-semibold tracking-wide transition-colors ${
              activeTab === tab.id
                ? "text-cyan"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              {tab.label}
              {tab.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-cyan/10 text-cyan text-[8px] font-mono font-bold min-w-[18px] text-center">
                  {tab.count}
                </span>
              )}
            </span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-cyan rounded-full" />
            )}
          </button>
        ))}
        {onClose && (
          <button
            onClick={onClose}
            title="Hide panel"
            className="px-3 text-muted-foreground/40 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ─── Chat Tab ─── */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Quick Commands */}
          <div className="shrink-0 border-b border-white/[0.04]">
            <button
              onClick={() => setShowQuickCmds(!showQuickCmds)}
              className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${showQuickCmds ? "rotate-90" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                Quick Commands
              </span>
              <span className="text-cyan/50 text-[9px]">
                {showQuickCmds ? "HIDE" : "SHOW"}
              </span>
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ${
                showQuickCmds ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="px-3 pb-3 space-y-3">
                {QUICK_COMMANDS.map((group) => (
                  <div key={group.group}>
                    <span className={`text-[10px] font-bold tracking-wider ${group.color}`}>
                      {group.group}
                    </span>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      {group.cmds.map((c) => (
                        <button
                          key={c.label}
                          onClick={() => onSendChat(c.cmd)}
                          disabled={aiThinking}
                          className="flex items-center gap-1.5 px-2.5 py-2 glass-card rounded-md text-[10px] font-semibold text-muted-foreground/70 hover:text-foreground hover:border-white/[0.12] transition-all duration-200 disabled:opacity-30 group"
                        >
                          <span className="text-cyan text-xs opacity-50 group-hover:opacity-100 transition-opacity">
                            {c.icon}
                          </span>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-4 space-y-4">
              {chatHistory.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-cyan/[0.05] border border-cyan/[0.1] flex items-center justify-center">
                    <svg className="w-6 h-6 text-cyan/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  </div>
                  <p className="text-xs text-muted-foreground/40">
                    Send a command to Zeus AI
                  </p>
                  <p className="text-[10px] text-muted-foreground/25 mt-1">
                    Try &quot;Deploy infantry patrol near me&quot;
                  </p>
                </div>
              )}
              {chatHistory.map((h, i) => (
                <div key={i} className="chat-message">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold ${
                        h.role === "user"
                          ? "bg-cyan/10 text-cyan border border-cyan/20"
                          : "bg-tactical-red/10 text-tactical-red border border-tactical-red/20"
                      }`}
                    >
                      {h.role === "user" ? "U" : "Z"}
                    </div>
                    <span
                      className={`text-[10px] font-bold tracking-wider ${
                        h.role === "user" ? "text-cyan" : "text-tactical-red"
                      }`}
                    >
                      {h.role === "user" ? "YOU" : "ZEUS AI"}
                    </span>
                  </div>
                  <div
                    className={`ml-7 text-[13px] leading-relaxed ${
                      h.role === "user"
                        ? "text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {h.content}
                  </div>
                </div>
              ))}
              {aiThinking && (
                <div className="chat-message ml-7">
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse-glow"
                          style={{ animationDelay: `${i * 0.2}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground/40 italic">
                      Zeus is thinking...
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-white/[0.04] shrink-0 bg-card/30">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Talk to Zeus..."
                disabled={aiThinking}
                className="flex-1 tactical-input rounded-lg px-4 py-2.5 text-sm font-mono placeholder:text-muted-foreground/30 disabled:opacity-40"
              />
              <button
                onClick={handleSend}
                disabled={aiThinking || !message.trim()}
                className="px-4 py-2.5 rounded-lg bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 hover:border-cyan/30 text-xs font-bold tracking-wider uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed tactical-btn"
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Commands Tab ─── */}
      {activeTab === "commands" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-3 space-y-1">
            {commandLog.length === 0 && (
              <div className="text-center py-12">
                <p className="text-xs text-muted-foreground/40">No commands executed yet</p>
              </div>
            )}
            {commandLog.map((cmd, i) => {
              const isBroadcast = cmd.type === "BROADCAST";
              const isIntent = cmd.type === "INTENT";
              const isPlanOp = cmd.type === "PLAN_OP";
              const isDelete = cmd.type === "DELETE_ALL" || cmd.type === "DELETE";
              const badgeClass = cmd.type === "SPAWN"
                ? "bg-tactical-green/10 text-tactical-green border-tactical-green/20"
                : cmd.type === "REINFORCE" || cmd.type === "MOVE"
                ? "bg-tactical-yellow/10 text-tactical-yellow border-tactical-yellow/20"
                : isDelete
                ? "bg-tactical-red/10 text-tactical-red border-tactical-red/20"
                : cmd.type === "SET_BEHAVIOR"
                ? "bg-tactical-purple/10 text-tactical-purple border-tactical-purple/20"
                : isBroadcast
                ? "bg-cyan/10 text-cyan border-cyan/20"
                : isIntent
                ? "bg-tactical-yellow/10 text-tactical-yellow border-tactical-yellow/20"
                : isPlanOp
                ? "bg-tactical-purple/10 text-tactical-purple border-tactical-purple/20"
                : "bg-white/5 text-white/50 border-white/10";
              return (
                <div
                  key={i}
                  className="flex items-start gap-2.5 px-3 py-2.5 glass-card rounded-lg animate-fade-in"
                >
                  <div className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider border ${badgeClass}`}>
                    {cmd.type}
                  </div>
                  <div className="min-w-0 flex-1">
                    {isBroadcast ? (
                      <div className="text-[11px] text-cyan/90 italic leading-snug">
                        &ldquo;{cmd.message || cmd.reasoning || "—"}&rdquo;
                      </div>
                    ) : isIntent ? (
                      <>
                        <div className="text-[11px] font-mono text-foreground/80 truncate">
                          {cmd.intent || cmd.reasoning || "—"}
                        </div>
                        <div className="text-[9px] text-muted-foreground/40 font-mono">
                          posture: {cmd.posture || "balanced"}
                        </div>
                      </>
                    ) : isPlanOp ? (
                      <>
                        <div className="text-[11px] font-mono text-tactical-purple/90 truncate">
                          {cmd.name || "Operation"}
                        </div>
                        <div className="text-[9px] text-muted-foreground/40 font-mono italic">
                          {cmd.reasoning?.slice(0, 80)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] font-mono text-foreground/80 truncate">
                          {cmd.units}
                          {cmd.count > 0 && <span className="text-muted-foreground/50"> ×{cmd.count}</span>}
                          {cmd.grid && cmd.grid !== "000-000" && <span className="text-muted-foreground/50"> @ {cmd.grid}</span>}
                        </div>
                        <div className="text-[9px] text-muted-foreground/40 font-mono">
                          {cmd.behavior && <span>[{cmd.behavior}] </span>}
                          {cmd.reasoning && <span className="italic">{cmd.reasoning.slice(0, 60)}</span>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Logs Tab ─── */}
      {activeTab === "logs" && (
        <div className="flex-1 min-h-0 relative">
          <div
            ref={logsContainerRef}
            onScroll={handleLogsScroll}
            className="h-full overflow-y-auto"
          >
            <div className="p-1">
              {serverLogs.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-xs text-muted-foreground/40">Waiting for server logs...</p>
                </div>
              )}
              {serverLogs.map((log, i) => (
                <div
                  key={i}
                  className="px-3 py-1 text-[10px] font-mono leading-relaxed border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-muted-foreground/40 mr-2 select-none">{log.time}</span>
                  <span
                    className={`font-bold mr-2 ${
                      log.level === "ERROR"
                        ? "text-tactical-red"
                        : log.level === "WARNING"
                        ? "text-tactical-yellow"
                        : "text-cyan/60"
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-muted-foreground/60 break-all">{log.msg}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Scroll to bottom button — visible when user has scrolled up */}
          {isScrolledUp && (
            <button
              onClick={() => {
                scrolledUpRef.current = false;
                setIsScrolledUp(false);
                logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-cyan/10 border border-cyan/20 text-[10px] font-bold text-cyan hover:bg-cyan/20 transition-all shadow-lg backdrop-blur-sm"
            >
              ↓ Latest
            </button>
          )}
        </div>
      )}

      {/* ─── Console Tab ─── */}
      {activeTab === "console" && (
        <div className="flex-1 min-h-0 relative flex flex-col">
          {/* Filter bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.04] shrink-0">
            {["ALL", "ERROR", "WARNING"].map(level => (
              <button
                key={level}
                onClick={() => setConsoleFilter(level)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
                  consoleFilter === level
                    ? "bg-cyan/10 text-cyan border border-cyan/20"
                    : "text-muted-foreground/40 hover:text-muted-foreground/60"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          {/* Log entries */}
          <div
            ref={consoleContainerRef}
            onScroll={handleConsoleScroll}
            className="flex-1 min-h-0 overflow-y-auto"
          >
            <div className="p-1">
              {filteredConsoleLogs.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-xs text-muted-foreground/40">No console logs available</p>
                  <p className="text-[10px] text-muted-foreground/25 mt-1">
                    Game server logs will appear here when streaming is enabled
                  </p>
                </div>
              )}
              {filteredConsoleLogs.map((log, i) => (
                <div
                  key={i}
                  className="px-3 py-1 text-[10px] font-mono leading-relaxed border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-muted-foreground/40 mr-2 select-none">{log.time}</span>
                  <span
                    className={`font-bold mr-2 ${
                      log.level === "ERROR"
                        ? "text-tactical-red"
                        : log.level === "WARNING"
                        ? "text-tactical-yellow"
                        : "text-tactical-green/60"
                    }`}
                  >
                    {log.source === "game" ? "GAME" : log.level}
                  </span>
                  <span className="text-muted-foreground/60 break-all">{log.msg}</span>
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          </div>
          {/* Scroll to bottom button */}
          {consoleScrolledUp && (
            <button
              onClick={() => {
                consoleScrolledUpRef.current = false;
                setConsoleScrolledUp(false);
                consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-cyan/10 border border-cyan/20 text-[10px] font-bold text-cyan hover:bg-cyan/20 transition-all shadow-lg backdrop-blur-sm"
            >
              ↓ Latest
            </button>
          )}
        </div>
      )}
    </div>
  );
}
