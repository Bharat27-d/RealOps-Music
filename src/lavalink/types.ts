import { type Node, type Stats } from 'shoukaku';

// ─── Node roles & preferences ─────────────────────────────────────────────────

export type NodeRole = 'primary' | 'residential';

export type NodePreference = 'default' | 'youtube' | 'primary' | 'residential';

export interface NodeMetadata {
  name: string;
  host: string;
  port: number;
  role: NodeRole;
  secure: boolean;
}

// ─── Status & Telemetry Types ─────────────────────────────────────────────────

export type NodeConnectionState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTING'
  | 'DISCONNECTED'
  | 'UNKNOWN';

export interface LavalinkNodeStats {
  name: string;
  role: NodeRole;
  state: NodeConnectionState;
  isHealthy: boolean;
  penalties: number;
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: Stats['memory'] | null;
  cpu: Stats['cpu'] | null;
}

export interface LavalinkServiceStats {
  healthy: boolean;
  totalNodes: number;
  connectedNodes: number;
  totalPlayers: number;
  nodes: LavalinkNodeStats[];
}

export interface PlayerMigrationResult {
  guildId: string;
  fromNode: string;
  toNode: string;
  position: number;
  trackTitle?: string;
  success: boolean;
  error?: Error;
}

