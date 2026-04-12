# Panel Minimize & UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collapsible side panels to the game-master view with desktop edge handles, mobile bottom drawers, error boundaries around all major panels, and a disconnection overlay on the tactical map.

**Architecture:** Desktop collapse is pure CSS (width + opacity transitions via Tailwind) driven by a `usePanelState` hook that persists to `localStorage`. Mobile replaces the 3-column layout with a full-screen map plus two `MobileDrawer` overlay components toggled by floating action buttons. Error boundaries wrap every major panel as React class components. The tactical map gets a `connected` prop and renders a disconnection badge when the bridge is offline.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript — no new dependencies needed.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/use-panel-state.ts` | **Create** | Collapse state for left/right panels + localStorage persistence |
| `src/components/dashboard/error-boundary.tsx` | **Create** | React class error boundary with tactical-styled fallback UI |
| `src/components/dashboard/mobile-drawer.tsx` | **Create** | Slide-up bottom drawer for mobile panel access |
| `src/app/dashboard/page.tsx` | **Modify** | Wire up all new components, add desktop/mobile layouts |
| `src/components/dashboard/tactical-map.tsx` | **Modify** | Accept `connected` prop, show disconnection overlay |

---

## Task 1: `usePanelState` hook

**Files:**
- Create: `src/hooks/use-panel-state.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useState, useEffect } from "react";

interface PanelState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const STORAGE_KEY = "dashboard-panel-state";
const DEFAULT: PanelState = { leftCollapsed: false, rightCollapsed: false };

export function usePanelState() {
  const [state, setState] = useState<PanelState>(DEFAULT);

  // Load from localStorage on mount (client-only — avoids SSR mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as PanelState);
    } catch {
      // Ignore parse errors — use default
    }
  }, []);

  const set = (next: PanelState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage quota exceeded — still update in-memory state
    }
  };

  return {
    leftCollapsed: state.leftCollapsed,
    rightCollapsed: state.rightCollapsed,
    toggleLeft: () => set({ ...state, leftCollapsed: !state.leftCollapsed }),
    toggleRight: () => set({ ...state, rightCollapsed: !state.rightCollapsed }),
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors involving `use-panel-state.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-panel-state.ts
git commit -m "feat: add usePanelState hook with localStorage persistence"
```

---

## Task 2: `ErrorBoundary` component

**Files:**
- Create: `src/components/dashboard/error-boundary.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-center glass-card rounded-lg p-6 border border-tactical-red/20 max-w-xs">
            <div className="text-tactical-red text-[11px] font-bold tracking-wider uppercase mb-2">
              {this.props.label ?? "Panel Error"}
            </div>
            <div className="text-muted-foreground/50 text-[10px] font-mono break-all">
              {this.state.error?.message ?? "An unexpected error occurred"}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 text-[10px] text-cyan/60 hover:text-cyan transition-colors uppercase tracking-wider"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors involving `error-boundary.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/error-boundary.tsx
git commit -m "feat: add ErrorBoundary component with tactical fallback UI"
```

---

## Task 3: `MobileDrawer` component

**Files:**
- Create: `src/components/dashboard/mobile-drawer.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  return (
    <>
      {/* Backdrop — dims map behind open drawer */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer — slides up from bottom */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Drag handle visual affordance */}
        <div className="flex justify-center pt-2 pb-1 bg-card/95 backdrop-blur-xl border-t border-white/[0.06] rounded-t-2xl shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-card/95 backdrop-blur-xl">
          {children}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors involving `mobile-drawer.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/mobile-drawer.tsx
git commit -m "feat: add MobileDrawer slide-up bottom sheet component"
```

---

## Task 4: Disconnection overlay on `TacticalMap`

**Files:**
- Modify: `src/components/dashboard/tactical-map.tsx`

- [ ] **Step 1: Add `connected` prop to the interface**

In `tactical-map.tsx`, change:

```tsx
interface TacticalMapProps {
  gameState: GameState | null;
}
```

to:

```tsx
interface TacticalMapProps {
  gameState: GameState | null;
  connected: boolean;
}
```

- [ ] **Step 2: Destructure `connected` in the function signature**

Change:

```tsx
export function TacticalMap({ gameState }: TacticalMapProps) {
```

to:

```tsx
export function TacticalMap({ gameState, connected }: TacticalMapProps) {
```

- [ ] **Step 3: Add the disconnection overlay inside the map container**

The map canvas block currently ends with:

```tsx
      {/* Map Canvas */}
      <div ref={containerRef} className="flex-1 relative min-h-0 scan-line">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
```

Change it to:

```tsx
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
```

- [ ] **Step 4: Type-check**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: error about `connected` being missing from `TacticalMap` usage in `page.tsx` — this is expected and will be fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/tactical-map.tsx
git commit -m "feat: add disconnection overlay to TacticalMap"
```

---

## Task 5: Rewire `page.tsx` — desktop collapse + mobile layout + error boundaries

**Files:**
- Modify: `src/app/dashboard/page.tsx`

This is the final integration task. Replace the entire file contents with the following:

- [ ] **Step 1: Replace `page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useBridge } from "@/hooks/use-bridge";
import { usePanelState } from "@/hooks/use-panel-state";
import { Header } from "@/components/dashboard/header";
import { StatsPanel } from "@/components/dashboard/stats-panel";
import { TacticalMap } from "@/components/dashboard/tactical-map";
import { ChatPanel } from "@/components/dashboard/chat-panel";
import { ServerConfig } from "@/components/dashboard/server-config";
import { ModManager } from "@/components/dashboard/mod-manager";
import { ErrorBoundary } from "@/components/dashboard/error-boundary";
import { MobileDrawer } from "@/components/dashboard/mobile-drawer";

const VALID_VIEWS = ["game-master", "server", "mods"];

export default function DashboardPage() {
  const router = useRouter();
  const { status } = useSession();
  const bridge = useBridge();
  const [activeView, setActiveView] = useState("game-master");
  const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight } = usePanelState();
  const [mobileDrawer, setMobileDrawer] = useState<"left" | "right" | null>(null);

  // Restore view from hash on mount (client-only, avoids hydration mismatch)
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (VALID_VIEWS.includes(hash)) setActiveView(hash);

    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (VALID_VIEWS.includes(h)) setActiveView(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleViewChange = (view: string) => {
    setActiveView(view);
    window.location.hash = view;
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  if (status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-[#6b6b80] text-sm">Loading...</div>
      </div>
    );
  }

  const gs = bridge.gameState;

  // Shared panel content — rendered in both desktop and mobile contexts
  const statsPanel = (
    <ErrorBoundary label="Stats Panel">
      <StatsPanel
        gameState={gs}
        aiEnabled={bridge.aiEnabled}
        gmMode={bridge.gmMode}
        difficulty={bridge.difficulty}
        escalation={bridge.escalation}
        totalSpawns={bridge.totalSpawns}
        totalDecisions={bridge.totalDecisions}
        totalHeartbeats={bridge.totalHeartbeats}
        uptime={bridge.uptime}
        onSetConfig={bridge.setConfig}
        onTrigger={bridge.triggerNow}
        onWarmup={bridge.warmup}
        onDeleteAll={bridge.deleteAllAI}
        onClearQueue={bridge.clearQueue}
        onManualSpawn={bridge.manualSpawn}
        onSendMission={bridge.sendMission}
        onClearMission={bridge.clearMission}
      />
    </ErrorBoundary>
  );

  const chatPanel = (
    <ErrorBoundary label="Chat Panel">
      <ChatPanel
        chatHistory={bridge.chatHistory}
        commandLog={bridge.commandLog}
        serverLogs={bridge.serverLogs}
        consoleLogs={bridge.consoleLogs}
        onSendChat={bridge.sendChat}
        aiThinking={bridge.aiThinking}
      />
    </ErrorBoundary>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header
        connected={bridge.connected}
        sparkOnline={bridge.sparkOnline}
        serverOnline={bridge.serverOnline}
        aiThinking={bridge.aiThinking}
        streamTokens={bridge.streamTokens}
        mapName={gs?.map}
        playerCount={gs?.player_count}
        aiActive={gs?.ai_units?.active}
        aiMax={gs?.ai_units?.max}
        activeView={activeView}
        onViewChange={handleViewChange}
        onLogout={handleLogout}
        servers={bridge.servers}
        activeServerId={bridge.activeServerId}
        onServerChange={bridge.selectServer}
      />

      {/* ── Game Master View ── */}
      {activeView === "game-master" && (
        <>
          {/* Desktop Layout — md and above */}
          <div className="hidden md:flex flex-1 min-h-0">

            {/* Left dock — Stats / AI GM panel */}
            <div className="relative flex shrink-0">
              <div
                className={`overflow-hidden transition-[width] duration-300 ease-in-out border-r border-white/[0.04] ${
                  leftCollapsed ? "w-0" : "w-[320px]"
                }`}
              >
                <div
                  className={`w-[320px] h-full transition-opacity duration-200 ${
                    leftCollapsed ? "opacity-0" : "opacity-100"
                  }`}
                >
                  {statsPanel}
                </div>
              </div>
              {/* Edge collapse button — always visible at panel boundary */}
              <button
                onClick={toggleLeft}
                aria-label={leftCollapsed ? "Restore stats panel" : "Collapse stats panel"}
                className="absolute top-1/2 -translate-y-1/2 -right-3 z-20 flex items-center justify-center w-6 h-8 rounded-r-md glass-card border border-white/[0.06] text-muted-foreground/40 hover:text-muted-foreground transition-colors text-[10px]"
              >
                {leftCollapsed ? "▶" : "◀"}
              </button>
            </div>

            {/* Center — Tactical Map */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <ErrorBoundary label="Tactical Map">
                <TacticalMap gameState={gs} connected={bridge.connected} />
              </ErrorBoundary>
            </div>

            {/* Right dock — Chat / Comms panel */}
            <div className="relative flex shrink-0">
              {/* Edge collapse button */}
              <button
                onClick={toggleRight}
                aria-label={rightCollapsed ? "Restore chat panel" : "Collapse chat panel"}
                className="absolute top-1/2 -translate-y-1/2 -left-3 z-20 flex items-center justify-center w-6 h-8 rounded-l-md glass-card border border-white/[0.06] text-muted-foreground/40 hover:text-muted-foreground transition-colors text-[10px]"
              >
                {rightCollapsed ? "◀" : "▶"}
              </button>
              <div
                className={`overflow-hidden transition-[width] duration-300 ease-in-out border-l border-white/[0.04] ${
                  rightCollapsed ? "w-0" : "w-[380px]"
                }`}
              >
                <div
                  className={`w-[380px] h-full transition-opacity duration-200 ${
                    rightCollapsed ? "opacity-0" : "opacity-100"
                  }`}
                >
                  {chatPanel}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Layout — below md */}
          <div className="flex md:hidden flex-1 min-h-0 relative overflow-hidden">
            {/* Map fills full available height */}
            <div className="absolute inset-0">
              <ErrorBoundary label="Tactical Map">
                <TacticalMap gameState={gs} connected={bridge.connected} />
              </ErrorBoundary>
            </div>

            {/* FAB — bottom-left: Stats panel */}
            <button
              onClick={() => setMobileDrawer(mobileDrawer === "left" ? null : "left")}
              aria-label="Toggle stats panel"
              className="absolute bottom-4 left-4 z-50 w-11 h-11 rounded-full glass-card border border-white/[0.1] flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground shadow-lg transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6" />
                <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
                <line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
              </svg>
            </button>

            {/* FAB — bottom-right: Chat panel */}
            <button
              onClick={() => setMobileDrawer(mobileDrawer === "right" ? null : "right")}
              aria-label="Toggle chat panel"
              className="absolute bottom-4 right-4 z-50 w-11 h-11 rounded-full glass-card border border-white/[0.1] flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground shadow-lg transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </button>

            {/* Mobile bottom drawers */}
            <MobileDrawer
              open={mobileDrawer === "left"}
              onClose={() => setMobileDrawer(null)}
            >
              {statsPanel}
            </MobileDrawer>

            <MobileDrawer
              open={mobileDrawer === "right"}
              onClose={() => setMobileDrawer(null)}
            >
              {chatPanel}
            </MobileDrawer>
          </div>
        </>
      )}

      {/* Server Config View */}
      {activeView === "server" && (
        <div className="flex-1 min-h-0">
          <ErrorBoundary label="Server Config">
            <ServerConfig consoleLogs={bridge.consoleLogs} />
          </ErrorBoundary>
        </div>
      )}

      {/* Mods View */}
      {activeView === "mods" && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary label="Mod Manager">
            <ModManager />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check — must be clean**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 3: Dev server smoke test**

```bash
cd /home/mark/AIGameMaster/AIGameMaster/dashboard
npm run dev
```

Open `http://localhost:3000` in a browser and verify:
- Desktop (full width): left `◀` button collapses the stats panel, map expands; right `▶` button collapses chat
- Both panels can be re-expanded with the arrow button that remains at the screen edge
- Collapse state survives a page refresh (localStorage)
- Resize browser to < 768px (or DevTools mobile): map fills full screen, two FABs appear at bottom corners
- Tapping a FAB opens the drawer from below; tapping backdrop closes it; opening one closes the other

- [ ] **Step 4: Final commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: panel collapse, mobile drawers, error boundaries, disconnection overlay"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| Panels collapse fully, map fills vacated space | Task 5 — CSS width transition on desktop docks |
| Edge arrow button always visible at panel boundary | Task 5 — absolutely-positioned button on dock wrapper |
| Collapse state persists across reloads | Task 1 — localStorage in `usePanelState` |
| Mobile: map full screen by default | Task 5 — mobile layout with `absolute inset-0` map |
| Mobile: panels as bottom drawers | Tasks 3 + 5 — `MobileDrawer` + FABs |
| Only one mobile drawer open at a time | Task 5 — `mobileDrawer` state is `"left" \| "right" \| null` |
| Backdrop closes drawer on tap | Task 3 — backdrop `onClick={onClose}` |
| Error boundaries on all panels | Task 2 + 5 — `ErrorBoundary` wraps Stats, Chat, Map, ServerConfig, ModManager |
| Disconnection UX on tactical map | Task 4 — `connected` prop + overlay badge |
| `aria-label` on all collapse/FAB buttons | Tasks 4 + 5 — all buttons have `aria-label` |
