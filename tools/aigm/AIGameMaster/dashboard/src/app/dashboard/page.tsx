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
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
        heartbeatInterval={bridge.heartbeatInterval}
        activeMission={bridge.activeMission}
        onSetConfig={bridge.setConfig}
        onTrigger={bridge.triggerNow}
        onWarmup={bridge.warmup}
        onDeleteAll={bridge.deleteAllAI}
        onClearQueue={bridge.clearQueue}
        onManualSpawn={bridge.manualSpawn}
        onSendMission={bridge.sendMission}
        onClearMission={bridge.clearMission}
        onClose={toggleLeft}
        model={bridge.model}
        lastLatencyMs={bridge.lastLatencyMs}
        pendingCommands={bridge.pendingCommands}
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
        onClose={toggleRight}
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
        activeView={activeView}
        onViewChange={handleViewChange}
        onLogout={handleLogout}
        servers={bridge.servers}
        activeServerId={bridge.activeServerId}
        onServerChange={bridge.selectServer}
        leftPanelCollapsed={leftCollapsed}
        rightPanelCollapsed={rightCollapsed}
        onToggleLeft={toggleLeft}
        onToggleRight={toggleRight}
      />

      {/* ── Mobile: Game Master with FABs and bottom drawers ── */}
      {activeView === "game-master" && isMobile && (
        <div className="flex flex-1 min-h-0 relative overflow-hidden">
          <div className="absolute inset-0">
            <ErrorBoundary label="Tactical Map">
              <TacticalMap gameState={gs} connected={bridge.connected} />
            </ErrorBoundary>
          </div>

          {/* FAB — bottom-left: Stats panel */}
          <button
            type="button"
            onClick={() => setMobileDrawer(mobileDrawer === "left" ? null : "left")}
            aria-label="Toggle stats panel"
            className="absolute bottom-4 left-4 z-50 w-11 h-11 rounded-full glass-card border border-white/[0.1] flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground shadow-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <line x1="4" y1="6" x2="20" y2="6" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
              <line x1="4" y1="12" x2="20" y2="12" /><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
              <line x1="4" y1="18" x2="20" y2="18" /><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
            </svg>
          </button>

          {/* FAB — bottom-right: Chat panel */}
          <button
            type="button"
            onClick={() => setMobileDrawer(mobileDrawer === "right" ? null : "right")}
            aria-label="Toggle chat panel"
            className="absolute bottom-4 right-4 z-50 w-11 h-11 rounded-full glass-card border border-white/[0.1] flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground shadow-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </button>

          <MobileDrawer open={mobileDrawer === "left"} onClose={() => setMobileDrawer(null)}>
            {statsPanel}
          </MobileDrawer>
          <MobileDrawer open={mobileDrawer === "right"} onClose={() => setMobileDrawer(null)}>
            {chatPanel}
          </MobileDrawer>
        </div>
      )}

      {/* ── Desktop: unified 3-column dock layout for ALL views ── */}
      {!isMobile && (
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left dock — AI GM Stats (all views) */}
          <div
            className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out border-r border-white/[0.04] ${
              leftCollapsed ? "w-0" : "w-[320px]"
            }`}
          >
            <div
              className={`w-[320px] h-full transition-opacity duration-200 ${
                leftCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              {statsPanel}
            </div>
          </div>

          {/* Main content — switches by active view */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {activeView === "game-master" && (
              <ErrorBoundary label="Tactical Map">
                <TacticalMap gameState={gs} connected={bridge.connected} />
              </ErrorBoundary>
            )}
            {activeView === "server" && (
              <ErrorBoundary label="Server Config">
                <ServerConfig consoleLogs={bridge.consoleLogs} />
              </ErrorBoundary>
            )}
            {activeView === "mods" && (
              <ErrorBoundary label="Mod Manager">
                <ModManager />
              </ErrorBoundary>
            )}
          </div>

          {/* Right dock — Chat / Comms (all views) */}
          <div
            className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out border-l border-white/[0.04] ${
              rightCollapsed ? "w-0" : "w-[380px]"
            }`}
          >
            <div
              className={`w-[380px] h-full transition-opacity duration-200 ${
                rightCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              {chatPanel}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile: Server and Mods views (full width, no panels) ── */}
      {isMobile && activeView === "server" && (
        <div className="flex-1 min-h-0">
          <ErrorBoundary label="Server Config">
            <ServerConfig consoleLogs={bridge.consoleLogs} />
          </ErrorBoundary>
        </div>
      )}
      {isMobile && activeView === "mods" && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary label="Mod Manager">
            <ModManager />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
