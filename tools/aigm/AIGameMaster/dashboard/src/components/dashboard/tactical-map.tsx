"use client";

import { useEffect, useRef, useCallback } from "react";
import type { GameState } from "@/lib/types";
import { cleanMapName } from "@/lib/utils";

interface TacticalMapProps {
  gameState: GameState | null;
  connected: boolean;
}

export function TacticalMap({ gameState, connected }: TacticalMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const MAP = gameState?.map_size || 12800;

    // ─── Background with subtle gradient ───
    const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.8);
    bgGrad.addColorStop(0, "#0c0c14");
    bgGrad.addColorStop(1, "#08080c");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ─── Grid lines ───
    const divisions = 20;
    const gridStep = MAP / divisions;

    // Minor grid
    ctx.strokeStyle = "rgba(34, 211, 238, 0.03)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= divisions; i++) {
      const x = (i / divisions) * W;
      const y = (i / divisions) * H;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Major grid (every 4)
    ctx.strokeStyle = "rgba(34, 211, 238, 0.08)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= divisions; i += 4) {
      const x = (i / divisions) * W;
      const y = (i / divisions) * H;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Grid labels
    ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    for (let i = 0; i < divisions; i += 4) {
      const gridVal = Math.floor((i * gridStep) / 100);
      const label = String(gridVal).padStart(3, "0");
      const x = (i / divisions) * W;
      const y = (1 - i / divisions) * H;
      ctx.fillText(label, x + 3, H - 5);
      ctx.fillText(label, 3, y - 5);
    }

    // Map origin offsets — converts between world coords and map-relative coords
    const OX = gameState?.map_offset_x ?? 0;
    const OZ = gameState?.map_offset_z ?? 0;

    // toS: world coords → screen. Subtract offset to get map-relative position.
    const toS = (x: number, y: number): [number, number] => [
      ((x - OX) / MAP) * W,
      (1 - (y - OZ) / MAP) * H,
    ];
    // toG: grid world-scale coords → screen. Grid values are already map-relative.
    const toG = (gx: number, gy: number): [number, number] => [
      (gx / MAP) * W,
      (1 - gy / MAP) * H,
    ];

    // ─── Valid spawn grids ───
    const validGrids = gameState?.valid_spawn_grids || [];
    for (const g of validGrids) {
      const [gxs, gzs] = g.split("-");
      const gx = parseInt(gxs) * 100;
      const gz = parseInt(gzs) * 100;
      const [sx, sy] = toG(gx, gz);
      ctx.fillStyle = "rgba(34, 211, 238, 0.05)";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ─── AI Groups ───
    const groups = gameState?.ai_units?.groups || [];
    for (const g of groups) {
      if (!g.grid) continue;
      const [gxs, gzs] = g.grid.split("-");
      const gx = parseInt(gxs) * 100;
      const gz = parseInt(gzs) * 100;
      const [sx, sy] = toG(gx, gz);

      // Threat radius
      ctx.fillStyle = "rgba(239, 68, 68, 0.04)";
      ctx.beginPath();
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.fill();

      // Diamond
      ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
      ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
      ctx.lineWidth = 1.5;
      const ds = 6;
      ctx.beginPath();
      ctx.moveTo(sx, sy - ds);
      ctx.lineTo(sx + ds - 1, sy);
      ctx.lineTo(sx, sy + ds);
      ctx.lineTo(sx - ds + 1, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Label background
      const shortType = g.type.split("_").slice(-2).join(" ");
      const label = `${shortType} x${g.count}`;
      ctx.font = "600 9px 'Inter', sans-serif";
      const metrics = ctx.measureText(label);
      const lx = sx + 10;
      const ly = sy - 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(lx - 2, ly - 9, metrics.width + 4, 13);

      ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
      ctx.fillText(label, lx, ly + 1);

      // Behavior badge
      if (g.behavior) {
        ctx.font = "500 7px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
        ctx.fillText(`[${g.behavior}]`, lx, ly + 11);
      }
    }

    // ─── Players ───
    const players = gameState?.players || [];
    for (const p of players) {
      const [sx, sy] = toS(p.pos.x, p.pos.y);
      const isAlive = p.status === "alive";
      const color = isAlive ? [34, 197, 94] : [239, 68, 68];

      // Outer pulse ring
      if (isAlive) {
        ctx.strokeStyle = `rgba(${color.join(",")}, 0.12)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 18, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(${color.join(",")}, 0.06)`;
        ctx.beginPath();
        ctx.arc(sx, sy, 28, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Inner glow
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
      glow.addColorStop(0, `rgba(${color.join(",")}, 0.3)`);
      glow.addColorStop(1, `rgba(${color.join(",")}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fill();

      // Player dot
      ctx.fillStyle = `rgba(${color.join(",")}, 1)`;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();

      // White center
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Name with shadow
      ctx.font = "bold 11px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillText(p.name, sx + 10 + 1, sy - 3 + 1);
      ctx.fillStyle = `rgba(${color.join(",")}, 1)`;
      ctx.fillText(p.name, sx + 10, sy - 3);

      // Grid coords — 100m squares, matches in-game map and enforce script WorldToGrid6
      const gridX = Math.floor((p.pos.x - OX) / 100);
      const gridZ = Math.floor((p.pos.y - OZ) / 100);
      const gridLabel = `${String(Math.max(0, gridX)).padStart(3, "0")}-${String(Math.max(0, gridZ)).padStart(3, "0")}`;
      ctx.font = "500 9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fillText(gridLabel, sx + 10, sy + 9);
    }

    // ─── Map name watermark ───
    if (gameState?.map) {
      const displayName = cleanMapName(gameState.map);
      ctx.font = "800 16px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(34, 211, 238, 0.06)";
      ctx.fillText(displayName.toUpperCase(), 14, 28);
    }

    // ─── Compass ───
    const cx = W - 30;
    const cy = 30;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = "bold 8px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
    ctx.textAlign = "center";
    ctx.fillText("N", cx, cy - 7);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillText("S", cx, cy + 12);
    ctx.fillText("E", cx + 10, cy + 3);
    ctx.fillText("W", cx - 10, cy + 3);
    ctx.textAlign = "left";
  }, [gameState]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const observer = new ResizeObserver(() => draw());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div className="h-full flex flex-col">
      {/* Map Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] shrink-0 bg-card/50">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-bold tracking-wider text-muted-foreground/70 uppercase">
            Tactical Map
          </h3>
          {gameState?.map && (
            <span className="text-[11px] font-mono text-cyan/40">{cleanMapName(gameState.map)}</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-tactical-green" />
            <span className="text-muted-foreground/50">Players</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rotate-45 bg-tactical-red" />
            <span className="text-muted-foreground/50">AI Groups</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan/30" />
            <span className="text-muted-foreground/50">Spawn Grids</span>
          </div>
        </div>
      </div>

      {/* Map Canvas */}
      <div ref={containerRef} className="flex-1 relative min-h-0 scan-line">
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Disconnection overlay — shown when bridge is offline */}
        {!connected && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full glass-card border border-tactical-red/30 flex items-center gap-2 pointer-events-none">
            <div className="w-1.5 h-1.5 rounded-full bg-tactical-red animate-pulse-glow" />
            <span className="text-[10px] font-bold text-tactical-red/80 tracking-wider uppercase">
              Disconnected — last known state
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
