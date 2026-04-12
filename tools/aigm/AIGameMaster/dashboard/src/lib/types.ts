// ─── Game State Types ────────────────────────────────────────────────────

export interface PlayerPos {
  x: number;
  y: number;
}

export interface Player {
  name: string;
  status: "alive" | "dead";
  faction: string;
  pos: PlayerPos;
}

export interface AIUnits {
  active: number;
  max: number;
  groups: AIGroup[];
}

export interface AIGroup {
  type: string;
  count: number;
  grid: string;
  behavior: string;
}

export interface CatalogEntry {
  name: string;
  display_name: string;
  faction: string;
  category: "group" | "vehicle" | "character" | "static_weapon" | "composition";
}

export interface Faction {
  key: string;
  role: "OPFOR" | "BLUFOR" | "INDFOR" | "CIV";
}

export interface TerrainData {
  player: string;
  grid: string;
  elevation: number;
  surroundings: Record<string, string>;
}

export interface GameState {
  map: string;
  map_size: number;
  map_offset_x: number;
  map_offset_z: number;
  player_count: number;
  players: Player[];
  ai_units: AIUnits;
  catalog: CatalogEntry[];
  factions: Faction[];
  valid_spawn_grids: string[];
  engagement_intensity: number;
  casualties_last_10min: number;
  terrain_map: {
    grid: string;
    grid_size: number;
    cell_meters: number;
    min_elevation: number;
    max_elevation: number;
  };
  terrain: TerrainData[];
  available_behaviors: string[];
  session_time_minutes: number;
}

// ─── Command Types ───────────────────────────────────────────────────────

export interface Command {
  type: "SPAWN" | "MOVE" | "DELETE" | "DELETE_ALL" | "REINFORCE" | "SET_BEHAVIOR" | "EVENT" | "BROADCAST" | "INTENT" | "PLAN_OP";
  units: string;
  count: number;
  grid: string;
  behavior: string;
  faction: string;
  reasoning: string;
  // BROADCAST-specific
  message?: string;
  // INTENT-specific
  intent?: string;
  posture?: string;
  // PLAN_OP-specific
  name?: string;
}

// ─── Multi-Server Types ─────────────────────────────────────────────────

export interface ServerInfo {
  server_id: string;
  map: string;
  player_count: number;
  last_seen: number;
  online: boolean;
}

export interface ConsoleLogEntry {
  time: string;
  level: string;
  msg: string;
  source: "game" | "bridge";
  server_id: string;
}

// ─── WebSocket Events ────────────────────────────────────────────────────

export interface ServerLog {
  time: string;
  level: "INFO" | "WARNING" | "ERROR" | "DEBUG";
  msg: string;
}

export interface WSMessage {
  event: string;
  data: unknown;
  ts: number;
  server_id?: string;
}

export interface InitData {
  state: GameState;
  ai_enabled: boolean;
  difficulty: number;
  gm_mode: "on_demand" | "autonomous";
  escalation: number;
  decisions: Decision[];
  mission: string;
  chat_history: ChatEntry[];
  server_logs: ServerLog[];
  console_logs?: ConsoleLogEntry[];
  servers: ServerInfo[];
  server_id: string;
}

export interface Decision {
  timestamp: string;
  player_count: number;
  escalation: number;
  difficulty: number;
  commands: Command[];
  latency_ms: number;
}

export interface ChatEntry {
  role: "user" | "assistant";
  content: string;
}

// ─── API Status ──────────────────────────────────────────────────────────

export interface BridgeStatus {
  bridge: string;
  version: string;
  ai_enabled: boolean;
  ai_thinking: boolean;
  difficulty: number;
  gm_mode: string;
  spark_ip: string;
  model: string;
  escalation: number;
  escalation_name: string;
  uptime_seconds: number;
  last_state_age: number;
  last_ai_latency_ms: number;
  total_commands: number;
  total_spawns: number;
  total_heartbeats: number;
  total_decisions: number;
  pending_commands: number;
  mission_briefing: string;
  heartbeat_interval: number;
  connected_dashboards: number;
  valid_grids_count: number;
  catalog_count: number;
}

export const ESCALATION_NAMES = ["QUIET", "PROBING", "ENGAGED", "ASSAULT", "OVERWHELM"] as const;
export const ESCALATION_COLORS = ["text-tactical-green", "text-tactical-yellow", "text-tactical-yellow", "text-tactical-red", "text-tactical-red"] as const;
