// ══════════════════════════════════════════════════════════════════════════════
//  HAWKINS LAB — Shared Server Types
// ══════════════════════════════════════════════════════════════════════════════

// ── Game Phase State Machine ─────────────────────────────────────────────────
export enum GamePhase {
  LOBBY            = 'LOBBY',
  CHARACTER_SELECT = 'CHARACTER_SELECT',
  ROLE_REVEAL      = 'ROLE_REVEAL',
  PLAYING          = 'PLAYING',
  FINISHED         = 'FINISHED',
}

// ── Character Roster ─────────────────────────────────────────────────────────
export type CharacterId = 'eleven' | 'hopper' | 'joyce' | 'mike' | 'dustin' | 'max';

export const ALL_CHARACTERS: CharacterId[] = [
  'eleven', 'hopper', 'joyce', 'mike', 'dustin', 'max',
];

// ── Player ───────────────────────────────────────────────────────────────────
export type PlayerRole = 'security' | 'demogorgon';
export type PlayerStatus = 'safe' | 'danger' | 'caught' | 'unknown';

export interface PlayerState {
  id: string;
  socketId: string;
  name: string;
  character: CharacterId | null;
  role: PlayerRole | null;
  x: number;
  y: number;
  status: PlayerStatus;
  score: number;
  isHost: boolean;
  isAlerted: boolean;           // proximity hysteresis flag
  joinedAt: number;             // Unix ms — used for host promotion ordering
  survivalTime: number;         // ms survived (set at catch or game end)
}

// ── Orb ──────────────────────────────────────────────────────────────────────
export interface OrbState {
  id: string;
  x: number;
  y: number;
  active: boolean;
  respawnAt: number | null;     // Unix ms when this orb respawns (null = active)
}

// ── Compressed Snapshot (bandwidth-friendly) ─────────────────────────────────
//  [playerId, x, y, status-code, score]
//  status-code:  0=safe  1=danger  2=caught  3=unknown
export type CompressedPlayer = [string, number, number, number, number];

export interface GameSnapshot {
  tick: number;
  players: CompressedPlayer[];
  phase: GamePhase;
  elapsed: number;              // ms since game start
  remainingMs: number;          // ms until timeout
}

// ── Secret Role Packet ───────────────────────────────────────────────────────
export interface SecretPacket {
  playerId: string;
  role: PlayerRole;
  allyIds: string[];            // Security gets ally list (excluding Demogorgon)
  objective: string;            // Thematic text
}

// ── Post-Game Analytics ──────────────────────────────────────────────────────
export interface PlayerReport {
  id: string;
  name: string;
  character: CharacterId | null;
  role: PlayerRole | null;
  status: PlayerStatus;
  score: number;
  survivalTime: number;
  finalPosition: { x: number; y: number };
}

export interface PostGameReport {
  winner: 'demogorgon' | 'security';
  durationMs: number;
  longestSurvivor: string;      // player name
  topCollector: string;         // player name (most orbs)
  demogorgonName: string;
  demogorgonFinalPos: { x: number; y: number };
  playerReports: PlayerReport[];
}

// ── Proximity Event ──────────────────────────────────────────────────────────
export interface ProximityEvent {
  playerId: string;
  value: number;                // 0.0 – 1.0 intensity
  entering: boolean;            // true = just entered alert zone
  leaving: boolean;             // true = just left alert zone
}

// ── Wall Bump Event ──────────────────────────────────────────────────────────
export interface WallBumpEvent {
  playerId: string;
  resetX: number;
  resetY: number;
  intensity: number;            // 0.0 – 1.0 thud force
}

// ── Room Configuration Constants ─────────────────────────────────────────────
export const CONFIG = {
  MAX_PLAYERS: 6,
  GAME_DURATION_MS: 5 * 60 * 1000,       // 5 minutes
  TICK_RATE_MS: 100,                       // 10Hz game loop
  MOVEMENT_VALIDATION_MS: 50,             // 20Hz spatial check
  ALERT_TRIGGER_RADIUS: 8,                // proximity trigger distance (tiles)
  ALERT_RELEASE_RADIUS: 10,               // proximity release distance (hysteresis, tiles)
  ORB_COUNT_MIN: 8,
  ORB_COUNT_MAX: 12,
  ORB_PICKUP_RADIUS: 5,
  ORB_RESPAWN_MS: 30_000,                 // 30 seconds
  ORB_BROADCAST_MS: 500,                  // orb sync interval
  POSITION_THROTTLE_MS: 50,              // 20Hz position validation
  WORLD_SIZE: 40,                          // 40×40 tile grid
} as const;

// ── Status Encoding (for compressed snapshots) ───────────────────────────────
export const STATUS_CODE: Record<PlayerStatus, number> = {
  safe: 0,
  danger: 1,
  caught: 2,
  unknown: 3,
};

export const CODE_STATUS: Record<number, PlayerStatus> = {
  0: 'safe',
  1: 'danger',
  2: 'caught',
  3: 'unknown',
};
