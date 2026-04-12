"use client";

import { useEffect, useState, useRef } from "react";
import type { ServerInfo } from "@/lib/types";
import { cleanMapName } from "@/lib/utils";

interface HeaderProps {
  connected: boolean;
  sparkOnline: boolean;
  serverOnline: boolean;
  aiThinking: boolean;
  streamTokens: number;
  activeView: string;
  onViewChange: (view: string) => void;
  onLogout: () => void;
  servers: ServerInfo[];
  activeServerId: string | null;
  onServerChange: (serverId: string) => void;
  leftPanelCollapsed?: boolean;
  rightPanelCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
}

function StatusIndicator({
  on,
  busy,
  label,
}: {
  on: boolean;
  busy?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.02] border border-white/[0.04]">
      <div className="relative shrink-0">
        <div
          className={`w-2 h-2 rounded-full transition-colors duration-300 ${
            busy
              ? "bg-tactical-yellow animate-pulse-glow"
              : on
              ? "bg-tactical-green"
              : "bg-tactical-red"
          }`}
        />
        {(on || busy) && (
          <div
            className={`absolute inset-0 rounded-full blur-[4px] ${
              busy ? "bg-tactical-yellow/60" : "bg-tactical-green/60"
            }`}
          />
        )}
      </div>
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground hidden lg:inline">
        {label}
      </span>
    </div>
  );
}

const NAV_ITEMS = [
  { id: "game-master", label: "Game Master" },
  { id: "server", label: "Server" },
  { id: "mods", label: "Mods" },
];


export function Header({
  connected,
  sparkOnline,
  serverOnline,
  aiThinking,
  streamTokens,
  activeView,
  onViewChange,
  onLogout,
  servers,
  activeServerId,
  onServerChange,
  leftPanelCollapsed,
  rightPanelCollapsed,
  onToggleLeft,
  onToggleRight,
}: HeaderProps) {
  const [clock, setClock] = useState("");
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const serverDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (serverDropdownRef.current && !serverDropdownRef.current.contains(e.target as Node)) {
        setServerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const update = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", { hour12: false })
      );
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <header className="flex flex-col bg-card/80 border-b border-white/[0.04] sticky top-0 z-50 backdrop-blur-xl">
      <div className="flex items-center justify-between px-5 py-2.5 relative min-w-0">
      {/* Left — Panel toggle + Logo */}
      <div className="flex items-center gap-4 min-w-0 overflow-hidden">
        {/* Stats panel toggle — visible in all views on desktop */}
        {onToggleLeft && (
          <button
            onClick={onToggleLeft}
            title={leftPanelCollapsed ? "Show AI GM panel" : "Hide AI GM panel"}
            className={`hidden md:flex shrink-0 items-center justify-center w-8 h-8 rounded-md border transition-all duration-200 ${
              leftPanelCollapsed
                ? "text-white/50 border-white/[0.08] hover:text-white hover:bg-white/[0.08] hover:border-white/[0.18]"
                : "text-white/80 bg-white/[0.07] border-white/[0.14] hover:bg-white/[0.12] hover:border-white/[0.2]"
            }`}
          >
            <svg className="w-[17px] h-[17px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <rect x="1.5" y="2.5" width="5" height="15" rx="1.5" opacity={leftPanelCollapsed ? 0.45 : 0.95} />
              <rect x="8.5" y="2.5" width="10" height="15" rx="1.5" opacity={leftPanelCollapsed ? 0.18 : 0.28} />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/15 to-cyan/5 border border-cyan/15 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-[18px] h-[18px] text-cyan"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-tight text-cyan">
              TACTICAL ZEUS
            </span>
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              v8.0
            </span>
          </div>
        </div>

        {/* Server Selector */}
        {servers.length > 0 && (
          <div className="relative" ref={serverDropdownRef}>
            {(() => {
              const activeServer = servers.find(s => s.server_id === activeServerId);
              const showDropdown = servers.length > 1;
              return (
                <>
                  <button
                    onClick={() => showDropdown && setServerDropdownOpen(!serverDropdownOpen)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono transition-colors ${
                      showDropdown ? "hover:bg-white/[0.06] cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${activeServer?.online ? "bg-tactical-green" : "bg-tactical-red"}`} />
                    <span className="text-muted-foreground/80 font-semibold">
                      {activeServer?.server_id || "No Server"}
                    </span>
                    {activeServer && (
                      <>
                        <span className="text-muted-foreground/30 hidden sm:inline">·</span>
                        <span className="text-muted-foreground/50 hidden sm:inline truncate max-w-[100px]">{cleanMapName(activeServer.map)}</span>
                        <span className="text-muted-foreground/30 hidden lg:inline">·</span>
                        <span className="text-muted-foreground/50 hidden lg:inline">{activeServer.player_count}p</span>
                      </>
                    )}
                    {showDropdown && (
                      <svg className={`w-3 h-3 text-muted-foreground/40 transition-transform ${serverDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    )}
                  </button>
                  {serverDropdownOpen && showDropdown && (
                    <div className="absolute top-full left-0 mt-1 min-w-[280px] rounded-lg bg-card/95 border border-white/[0.08] backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
                      {servers.map(server => (
                        <button
                          key={server.server_id}
                          onClick={() => {
                            onServerChange(server.server_id);
                            setServerDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-mono transition-colors hover:bg-white/[0.06] ${
                            server.server_id === activeServerId ? "bg-white/[0.04]" : ""
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${server.online ? "bg-tactical-green" : "bg-tactical-red"}`} />
                          <span className={`font-semibold ${server.server_id === activeServerId ? "text-cyan" : "text-muted-foreground/80"}`}>
                            {server.server_id}
                          </span>
                          <span className="text-muted-foreground/30">—</span>
                          <span className="text-muted-foreground/50">{cleanMapName(server.map)}</span>
                          <span className="text-muted-foreground/30 ml-auto">({server.player_count} players)</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 ml-2 shrink-0">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                activeView === item.id
                  ? "bg-white/[0.08] text-white"
                  : "text-[#6b6b80] hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Center — AI Thinking */}
      <div className="absolute left-1/2 -translate-x-1/2">
        {aiThinking && (
          <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-tactical-yellow/[0.08] border border-tactical-yellow/20 animate-fade-in">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-tactical-yellow animate-pulse-glow"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono font-semibold text-tactical-yellow">
              {streamTokens > 0
                ? `Generating · ${streamTokens} tokens`
                : "AI Processing..."}
            </span>
          </div>
        )}
      </div>

      {/* Right — Status + Clock */}
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <StatusIndicator on={sparkOnline} busy={aiThinking} label="Spark" />
        <StatusIndicator on={connected} label="Bridge" />
        <StatusIndicator on={serverOnline} label="Server" />
        <div className="ml-2 pl-3 border-l border-white/[0.06]">
          <span className="font-mono text-sm font-bold text-cyan tracking-wide">
            {clock}
          </span>
        </div>
        {/* Chat panel toggle — visible in all views on desktop */}
        {onToggleRight && (
          <button
            onClick={onToggleRight}
            title={rightPanelCollapsed ? "Show chat panel" : "Hide chat panel"}
            className={`hidden md:flex shrink-0 items-center justify-center w-8 h-8 rounded-md border transition-all duration-200 ${
              rightPanelCollapsed
                ? "text-white/50 border-white/[0.08] hover:text-white hover:bg-white/[0.08] hover:border-white/[0.18]"
                : "text-white/80 bg-white/[0.07] border-white/[0.14] hover:bg-white/[0.12] hover:border-white/[0.2]"
            }`}
          >
            <svg className="w-[17px] h-[17px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <rect x="1.5" y="2.5" width="10" height="15" rx="1.5" opacity={rightPanelCollapsed ? 0.18 : 0.28} />
              <rect x="13.5" y="2.5" width="5" height="15" rx="1.5" opacity={rightPanelCollapsed ? 0.45 : 0.95} />
            </svg>
          </button>
        )}
        <button
          onClick={onLogout}
          className="ml-2 p-1.5 rounded-md text-[#55556a] hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Logout"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
        </button>
      </div>
      </div>

      {/* Mobile Navigation — appears below header row on mobile only */}
      <div className="flex md:hidden items-center gap-1 px-4 pb-2 overflow-x-auto">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
              activeView === item.id
                ? "bg-white/[0.08] text-white"
                : "text-[#6b6b80] hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
}
