"use client";

import { Badge } from "@/components/ui/badge";
import { formatUptime } from "@/lib/utils";
import type { GameState, CatalogEntry } from "@/lib/types";
import { ESCALATION_NAMES } from "@/lib/types";
import { worldToGrid6 } from "@/lib/grid";
import { useState, useRef, useCallback, useEffect } from "react";

interface StatsPanelProps {
  gameState: GameState | null;
  aiEnabled: boolean;
  gmMode: "on_demand" | "autonomous";
  difficulty: number;
  escalation: number;
  totalSpawns: number;
  totalDecisions: number;
  totalHeartbeats: number;
  uptime: number;
  heartbeatInterval: number;
  activeMission: string;
  onSetConfig: (config: { ai_enabled?: boolean; difficulty?: number; gm_mode?: string; escalation?: number }) => void;
  onTrigger: () => void;
  onWarmup: () => void;
  onDeleteAll: () => void;
  onClearQueue: () => void;
  onManualSpawn: (units: string, count: number, grid: string, behavior: string) => void;
  onSendMission: (briefing: string) => void;
  onClearMission: () => void;
  onClose?: () => void;
  model?: string;
  lastLatencyMs?: number;
  pendingCommands?: number;
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[11px] font-bold tracking-wider text-muted-foreground/70 uppercase">
        {children}
      </h3>
      {action}
    </div>
  );
}

function MetricCard({ label, value, color = "text-cyan" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="glass-card rounded-lg p-3 text-center relative overflow-hidden group hover:border-white/[0.1] transition-colors">
      <div className="metric-shimmer absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className={`font-mono text-xl font-bold ${color} leading-none relative z-10`}>
        {value}
      </div>
      <div className="text-[9px] font-semibold tracking-wide text-muted-foreground/60 mt-1.5 relative z-10">
        {label}
      </div>
    </div>
  );
}

function TacticalButton({
  children,
  onClick,
  variant = "cyan",
  className = "",
  disabled = false,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "cyan" | "red" | "green" | "yellow" | "purple";
  className?: string;
  disabled?: boolean;
  active?: boolean;
}) {
  const colors = {
    cyan: "bg-cyan/[0.06] text-cyan border-cyan/20 hover:bg-cyan/[0.12] hover:border-cyan/30",
    red: "bg-tactical-red/[0.06] text-tactical-red border-tactical-red/20 hover:bg-tactical-red/[0.12] hover:border-tactical-red/30",
    green: "bg-tactical-green/[0.06] text-tactical-green border-tactical-green/20 hover:bg-tactical-green/[0.12] hover:border-tactical-green/30",
    yellow: "bg-tactical-yellow/[0.06] text-tactical-yellow border-tactical-yellow/20 hover:bg-tactical-yellow/[0.12] hover:border-tactical-yellow/30",
    purple: "bg-tactical-purple/[0.06] text-tactical-purple border-tactical-purple/20 hover:bg-tactical-purple/[0.12] hover:border-tactical-purple/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`tactical-btn px-3 py-2 rounded-md text-[11px] font-semibold tracking-wide border transition-all duration-200 disabled:opacity-30 ${
        colors[variant]
      } ${active ? "ring-1 ring-current shadow-[0_0_12px_rgba(34,211,238,0.1)]" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function StatsPanel({
  gameState,
  aiEnabled,
  gmMode,
  difficulty,
  escalation,
  totalSpawns,
  totalDecisions,
  totalHeartbeats,
  uptime,
  heartbeatInterval,
  activeMission,
  onSetConfig,
  onTrigger,
  onWarmup,
  onDeleteAll,
  onClearQueue,
  onManualSpawn,
  onSendMission,
  onClearMission,
  onClose,
  model,
  lastLatencyMs = 0,
  pendingCommands = 0,
}: StatsPanelProps) {
  const s = gameState;
  const players = s?.players || [];

  const [spawnUnit, setSpawnUnit] = useState("");
  const [spawnCount, setSpawnCount] = useState(4);
  const [spawnGrid, setSpawnGrid] = useState("");
  const [spawnBehavior, setSpawnBehavior] = useState("patrol");
  const [missionText, setMissionText] = useState("");
  const [localDifficulty, setLocalDifficulty] = useState(difficulty);
  const [localEscalation, setLocalEscalation] = useState(escalation * 20); // 0-4 → 0-80
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const escalationDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const draggingRef = useRef(false);
  const escalationDraggingRef = useRef(false);

  // Sync difficulty from server when not dragging
  useEffect(() => {
    if (!draggingRef.current) setLocalDifficulty(difficulty);
  }, [difficulty]);

  // Sync escalation from server when not dragging (escalation is 0-4, slider is 0-100)
  useEffect(() => {
    if (!escalationDraggingRef.current) setLocalEscalation(escalation * 25);
  }, [escalation]);

  // Seed mission textarea from bridge state when it changes
  useEffect(() => {
    setMissionText(activeMission);
  }, [activeMission]);

  // Debounced config update — only fires 300ms after user stops dragging
  const debouncedSetConfig = useCallback((val: number) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSetConfig({ difficulty: val });
    }, 300);
  }, [onSetConfig]);

  const debouncedSetEscalation = useCallback((val: number) => {
    clearTimeout(escalationDebounceRef.current);
    escalationDebounceRef.current = setTimeout(() => {
      onSetConfig({ escalation: val });
    }, 300);
  }, [onSetConfig]);

  const catalog = s?.catalog || [];
  const byFaction: Record<string, CatalogEntry[]> = {};
  catalog.forEach((e) => {
    const f = e.faction || "Unknown";
    if (!byFaction[f]) byFaction[f] = [];
    byFaction[f].push(e);
  });

  return (
    <div className="h-full flex flex-col">
      {/* Panel header strip */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] shrink-0 bg-card/30">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase">AI GM Panel</span>
        {onClose && (
          <button
            onClick={onClose}
            title="Hide panel"
            className="p-1 rounded text-muted-foreground/40 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
      {/* Metrics Grid */}
      <div className="p-4 border-b border-white/[0.04]">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Total Spawns" value={totalSpawns} />
          <MetricCard label="AI Decisions" value={totalDecisions} />
          <MetricCard
            label={heartbeatInterval ? `Heartbeats / ${heartbeatInterval}s` : "Heartbeats"}
            value={totalHeartbeats}
          />
          <MetricCard label="Bridge Up" value={formatUptime(uptime)} />
        </div>
      </div>

      {/* AI Engine */}
      <div className="p-4 border-b border-white/[0.04]">
        <SectionTitle>AI Engine</SectionTitle>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">Model</span>
          <span className="font-mono text-[11px] font-bold text-cyan truncate max-w-[160px]">
            {model || "—"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Last Decision" value={lastLatencyMs > 0 ? (lastLatencyMs / 1000).toFixed(1) + "s" : "—"} />
          <MetricCard label="Queue" value={pendingCommands ?? 0} />
        </div>
      </div>

      {/* Escalation */}
      <div className="p-4 border-b border-white/[0.04]">
        <SectionTitle>Threat Level</SectionTitle>
        {/* Live escalation dots — shows server state */}
        <div className="flex gap-1 h-2 mb-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-500 ${
                i <= escalation
                  ? escalation <= 1
                    ? "bg-tactical-green shadow-[0_0_8px] shadow-tactical-green/30"
                    : escalation <= 2
                    ? "bg-tactical-yellow shadow-[0_0_8px] shadow-tactical-yellow/30"
                    : escalation <= 3
                    ? "bg-tactical-red shadow-[0_0_8px] shadow-tactical-red/30"
                    : "bg-purple-500 shadow-[0_0_12px] shadow-purple-500/40"
                  : "bg-white/[0.04]"
              }`}
            />
          ))}
        </div>
        {/* Escalation override slider */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Override</span>
          <span
            className={`font-mono text-xs font-bold ${
              escalation <= 1 ? "text-tactical-green"
              : escalation <= 2 ? "text-tactical-yellow"
              : "text-tactical-red"
            }`}
          >
            {ESCALATION_NAMES[escalation] || "QUIET"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={25}
          value={localEscalation}
          onPointerDown={() => { escalationDraggingRef.current = true; }}
          onPointerUp={() => { escalationDraggingRef.current = false; }}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            setLocalEscalation(val);
            debouncedSetEscalation(val);
          }}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-tactical-yellow [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(234,179,8,0.4)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-tactical-yellow/50"
          style={{
            background: `linear-gradient(to right, ${
              localEscalation <= 25 ? "#22c55e" : localEscalation <= 50 ? "#eab308" : "#ef4444"
            } ${localEscalation}%, rgba(255,255,255,0.06) ${localEscalation}%)`,
          }}
        />
        <div className="flex justify-between mt-1">
          {["QUIET", "PROBE", "ENGAGE", "ASSAULT", "OVERWHELM"].map((label, i) => (
            <span key={label} className={`text-[8px] font-mono ${i * 25 === localEscalation ? "text-white/60" : "text-white/20"}`}>
              {label.slice(0, 3)}
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-white/[0.04]">
        <SectionTitle>Controls</SectionTitle>
        <div className="space-y-4">
          {/* Difficulty Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Difficulty</span>
              <span className="font-mono text-xl font-bold text-cyan">{localDifficulty}</span>
            </div>
            <div className="difficulty-slider">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={localDifficulty}
                onPointerDown={() => { draggingRef.current = true; }}
                onPointerUp={() => { draggingRef.current = false; }}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setLocalDifficulty(val);
                  debouncedSetConfig(val);
                }}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.4)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-cyan/50
                  bg-gradient-to-r from-tactical-green via-tactical-yellow to-tactical-red"
                style={{
                  background: `linear-gradient(to right, #22c55e ${localDifficulty}%, rgba(255,255,255,0.06) ${localDifficulty}%)`,
                }}
              />
            </div>
          </div>

          {/* GM Mode */}
          <div className="grid grid-cols-2 gap-2">
            <TacticalButton
              onClick={() => onSetConfig({ gm_mode: "on_demand" })}
              active={gmMode === "on_demand"}
            >
              On-Demand
            </TacticalButton>
            <TacticalButton
              onClick={() => onSetConfig({ gm_mode: "autonomous" })}
              active={gmMode === "autonomous"}
            >
              Autonomous
            </TacticalButton>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <TacticalButton
              onClick={() => onSetConfig({ ai_enabled: !aiEnabled })}
              variant={aiEnabled ? "red" : "green"}
            >
              {aiEnabled ? "Disable AI" : "Enable AI"}
            </TacticalButton>
            <TacticalButton onClick={onTrigger} variant="cyan">
              Trigger Now
            </TacticalButton>
          </div>

          <TacticalButton onClick={onWarmup} variant="purple" className="w-full">
            Warm Up Model
          </TacticalButton>
        </div>
      </div>

      {/* Admin */}
      <div className="p-4 border-b border-white/[0.04]">
        <SectionTitle>Admin</SectionTitle>
        <div className="grid grid-cols-2 gap-2 mb-5">
          <TacticalButton onClick={onDeleteAll} variant="red">
            Delete All AI
          </TacticalButton>
          <TacticalButton onClick={onClearQueue} variant="cyan">
            Clear Queue
          </TacticalButton>
        </div>

        {/* Manual Spawn */}
        <SectionTitle>Spawn Units</SectionTitle>
        <div className="space-y-2">
          <select
            value={spawnUnit}
            onChange={(e) => setSpawnUnit(e.target.value)}
            className="w-full tactical-input rounded-md px-2.5 py-2 text-[11px] font-mono truncate"
          >
            {Object.keys(byFaction)
              .sort()
              .map((faction) => (
                <optgroup key={faction} label={faction}>
                  {byFaction[faction]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((e, idx) => (
                      <option key={`${e.name}-${idx}`} value={e.name}>
                        {e.name}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-muted-foreground/50 mb-1 block">Amount</label>
              <input
                type="number"
                value={spawnCount}
                onChange={(e) => setSpawnCount(parseInt(e.target.value) || 1)}
                min={1}
                max={20}
                className="w-full tactical-input rounded-md px-2 py-2 text-[11px] font-mono text-center"
              />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground/50 mb-1 block">Grid</label>
              <input
                type="text"
                value={spawnGrid}
                onChange={(e) => setSpawnGrid(e.target.value)}
                placeholder="450-680"
                className="w-full tactical-input rounded-md px-2.5 py-2 text-[11px] font-mono placeholder:text-muted-foreground/40"
              />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground/50 mb-1 block">Behavior</label>
              <select
                value={spawnBehavior}
                onChange={(e) => setSpawnBehavior(e.target.value)}
                className="w-full tactical-input rounded-md px-2.5 py-2 text-[11px] font-mono"
              >
                {["patrol", "defend", "ambush", "move", "flank", "hunt", "attack", "search"].map(
                  (b) => (
                    <option key={b} value={b}>
                      {b.charAt(0).toUpperCase() + b.slice(1)}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
          <TacticalButton
            onClick={() =>
              onManualSpawn(spawnUnit, spawnCount, spawnGrid || "450-680", spawnBehavior)
            }
            variant="green"
            className="w-full"
          >
            Spawn
          </TacticalButton>
        </div>
      </div>

      {/* Mission Briefing */}
      <div className="p-4 border-b border-white/[0.04]">
        <SectionTitle
          action={
            <button
              onClick={onClearMission}
              className="text-[9px] font-bold text-tactical-red/60 hover:text-tactical-red uppercase tracking-widest transition-colors"
            >
              Clear
            </button>
          }
        >
          Mission Briefing
        </SectionTitle>
        <textarea
          value={missionText}
          onChange={(e) => setMissionText(e.target.value)}
          placeholder="Describe the scenario..."
          className="w-full tactical-input rounded-md px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 resize-y min-h-[70px] leading-relaxed"
          rows={3}
        />
        <TacticalButton
          onClick={() => {
            if (missionText.trim()) onSendMission(missionText.trim());
          }}
          variant="cyan"
          className="w-full mt-2"
        >
          Send to Zeus
        </TacticalButton>
      </div>

      {/* Players */}
      <div className="p-4">
        <SectionTitle>
          Online Players ({players.filter((p) => p.status === "alive").length}/{players.length})
        </SectionTitle>
        <div className="space-y-1.5">
          {players.map((p) => {
            const grid = worldToGrid6(p.pos.x, p.pos.y, gameState?.map_offset_x ?? 0, gameState?.map_offset_z ?? 0);
            const isAlive = p.status === "alive";
            return (
              <div
                key={p.name}
                className="flex items-center justify-between px-3 py-2.5 glass-card rounded-lg group hover:border-white/[0.1] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isAlive ? "bg-tactical-green" : "bg-tactical-red"
                    }`}
                  />
                  <div>
                    <span className="text-xs font-semibold">{p.name}</span>
                    <div className="text-[10px] font-mono text-muted-foreground/60">
                      {grid}
                      {p.faction && p.faction !== "Unknown" && (
                        <span className="ml-2 text-cyan/60">{p.faction}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge
                  className={`text-[9px] font-semibold tracking-wide border ${
                    isAlive
                      ? "bg-tactical-green/[0.08] text-tactical-green border-tactical-green/20"
                      : "bg-tactical-red/[0.08] text-tactical-red border-tactical-red/20"
                  }`}
                >
                  {p.status.toUpperCase()}
                </Badge>
              </div>
            );
          })}
          {players.length === 0 && (
            <div className="text-center py-6">
              <div className="text-muted-foreground/40 text-xs">No players online</div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
