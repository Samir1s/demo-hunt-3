// ══════════════════════════════════════════════════════════════════════════════
//  HAWKINS LAB — Room State Machine
//  Blocks 1 & 2: Room Lifecycle, Host Promotion, Character Locking, Role Engine
//  + Fix 1: Room Code Generation
//  + Fix 3: Disconnect Grace Period & Session Resume
// ══════════════════════════════════════════════════════════════════════════════

import {
  GamePhase,
  PlayerState,
  PlayerRole,
  CharacterId,
  SecretPacket,
  ALL_CHARACTERS,
  CONFIG,
} from './types.js';

// ── Room Code Generator ────────────────────────────────────────────────────
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export class Room {
  readonly code: string;
  phase: GamePhase = GamePhase.LOBBY;
  players: Map<string, PlayerState> = new Map();          // keyed by playerId
  lockedCharacters: Map<CharacterId, string> = new Map(); // character → playerId
  demogorgonId: string | null = null;                     // playerId of the monster
  startedAt: number = 0;
  createdAt: number = Date.now();

  // ── Disconnect Grace Period ─────────────────────────────────────────────
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private static readonly GRACE_PERIOD_MS = 30_000; // 30 seconds to reconnect

  constructor(code: string) {
    this.code = code;
  }

  // ── Player Management ────────────────────────────────────────────────────

  /** Add a player. First player becomes host. Returns the PlayerState or null if full. */
  addPlayer(id: string, socketId: string, name: string): PlayerState | null {
    // ── Session Resume: If player already exists, reconnect them ───────
    const existing = this.players.get(id);
    if (existing) {
      return this.reconnectPlayer(id, socketId);
    }

    if (this.players.size >= CONFIG.MAX_PLAYERS) return null;
    if (this.phase !== GamePhase.LOBBY && this.phase !== GamePhase.CHARACTER_SELECT) return null;

    const isFirst = this.players.size === 0;
    const player: PlayerState = {
      id,
      socketId,
      name,
      character: null,
      role: null,
      x: 0,
      y: 0,
      status: 'safe',
      score: 0,
      isHost: isFirst,
      isAlerted: false,
      joinedAt: Date.now(),
      survivalTime: 0,
    };

    this.players.set(id, player);
    return player;
  }

  /** Reconnect a previously disconnected player — re-link socketId, cancel grace timer */
  reconnectPlayer(playerId: string, newSocketId: string): PlayerState | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    // Cancel the grace period timer
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }

    // Re-link the new socket
    player.socketId = newSocketId;
    console.log(`[room:${this.code}] 🔄 ${player.name} reconnected`);
    return player;
  }

  /**
   * Mark a player as disconnected with a grace period.
   * If they don't reconnect within GRACE_PERIOD_MS, they are removed.
   * Returns a cleanup function that should be called if they DO reconnect.
   */
  markDisconnected(playerId: string, onExpire: () => void): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // During active games, give 30s grace. In lobby, remove immediately.
    if (this.phase === GamePhase.PLAYING || this.phase === GamePhase.ROLE_REVEAL) {
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        onExpire();
      }, Room.GRACE_PERIOD_MS);

      this.disconnectTimers.set(playerId, timer);
      console.log(`[room:${this.code}] ⏳ ${player.name} disconnected — ${Room.GRACE_PERIOD_MS / 1000}s grace period`);
    } else {
      // In lobby: remove immediately
      onExpire();
    }
  }

  /** Remove a player for real. Auto-promote next oldest to host. Returns the new host ID or null. */
  removePlayer(playerId: string): string | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    // Cancel any pending grace timer
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }

    // Release their character lock
    if (player.character) {
      this.lockedCharacters.delete(player.character);
    }

    const wasHost = player.isHost;
    this.players.delete(playerId);

    // Auto host promotion
    if (wasHost && this.players.size > 0) {
      const nextHost = [...this.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];
      nextHost.isHost = true;
      return nextHost.id;
    }

    return null;
  }

  getHost(): PlayerState | undefined {
    return [...this.players.values()].find(p => p.isHost);
  }

  getPlayerBySocket(socketId: string): PlayerState | undefined {
    return [...this.players.values()].find(p => p.socketId === socketId);
  }

  // ── Character Locking (Block 2) ──────────────────────────────────────────

  /** First-come-first-served character lock. Returns true on success. */
  lockCharacter(playerId: string, character: CharacterId): boolean {
    if (this.phase !== GamePhase.LOBBY && this.phase !== GamePhase.CHARACTER_SELECT) return false;
    if (!ALL_CHARACTERS.includes(character)) return false;
    if (this.lockedCharacters.has(character)) return false; // already taken

    const player = this.players.get(playerId);
    if (!player) return false;

    // Release previous character if switching
    if (player.character) {
      this.lockedCharacters.delete(player.character);
    }

    player.character = character;
    this.lockedCharacters.set(character, playerId);
    return true;
  }

  /** Get list of available (unlocked) characters */
  getAvailableCharacters(): CharacterId[] {
    return ALL_CHARACTERS.filter(c => !this.lockedCharacters.has(c));
  }

  // ── Phase Transitions ────────────────────────────────────────────────────

  /** Host locks the lobby — transitions to CHARACTER_SELECT */
  transitionToCharacterSelect(requesterId: string): boolean {
    const requester = this.players.get(requesterId);
    if (!requester?.isHost) return false;
    if (this.phase !== GamePhase.LOBBY) return false;
    if (this.players.size < 2) return false; // need at least 2 players

    this.phase = GamePhase.CHARACTER_SELECT;
    return true;
  }

  /** All characters selected — transition to ROLE_REVEAL */
  transitionToRoleReveal(requesterId: string): boolean {
    const requester = this.players.get(requesterId);
    if (!requester?.isHost) return false;
    if (this.phase !== GamePhase.CHARACTER_SELECT) return false;

    // Check all players have a character
    for (const player of this.players.values()) {
      if (!player.character) return false;
    }

    this.phase = GamePhase.ROLE_REVEAL;
    return true;
  }

  // ── Cryptographic Role Assignment (Block 2) ──────────────────────────────

  /**
   * Randomly select the Demogorgon from among all players.
   * Generate a SecretPacket for each player:
   *  - Security players receive ally IDs (other security, NO demogorgon)
   *  - Demogorgon receives hunt instructions
   */
  assignRoles(): SecretPacket[] {
    if (this.phase !== GamePhase.ROLE_REVEAL) return [];

    const playerIds = [...this.players.keys()];
    if (playerIds.length < 2) return [];

    // Cryptographic-ish random selection — pick a random index
    const demoIndex = Math.floor(Math.random() * playerIds.length);
    this.demogorgonId = playerIds[demoIndex];

    // Assign roles
    const packets: SecretPacket[] = [];

    for (const [id, player] of this.players) {
      if (id === this.demogorgonId) {
        player.role = 'demogorgon';
        packets.push({
          playerId: id,
          role: 'demogorgon',
          allyIds: [],  // Demogorgon has no allies
          objective: '🔴 YOU ARE THE DEMOGORGON. Hunt them all. Phase through walls. Leave no survivor.',
        });
      } else {
        player.role = 'security';
        // Ally list = all other security players (excludes demogorgon)
        const allyIds = playerIds.filter(pid => pid !== id && pid !== this.demogorgonId);
        packets.push({
          playerId: id,
          role: 'security',
          allyIds,
          objective: '🔵 SECURITY PROTOCOL ACTIVE. Watch the radar. Collect energy orbs. Survive 5 minutes.',
        });
      }
    }

    return packets;
  }

  /** Transition to PLAYING — game starts now */
  startGame(): boolean {
    if (this.phase !== GamePhase.ROLE_REVEAL) return false;
    if (!this.demogorgonId) return false;

    this.phase = GamePhase.PLAYING;
    this.startedAt = Date.now();
    return true;
  }

  /** Transition to FINISHED */
  finishGame(): void {
    this.phase = GamePhase.FINISHED;

    // Compute survival times for all players still alive
    const now = Date.now();
    for (const player of this.players.values()) {
      if (player.status !== 'caught' && player.role !== 'demogorgon') {
        player.survivalTime = now - this.startedAt;
      }
    }

    // Cancel all grace timers
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }

  // ── Win Condition Checks ─────────────────────────────────────────────────

  /** Returns winner if game should end, null otherwise */
  checkWinCondition(): 'demogorgon' | 'security' | null {
    if (this.phase !== GamePhase.PLAYING) return null;

    // All security players caught → Demogorgon wins
    const aliveSecurity = [...this.players.values()].filter(
      p => p.role === 'security' && p.status !== 'caught'
    );
    if (aliveSecurity.length === 0) return 'demogorgon';

    // Time expired → Security wins (survived)
    if (Date.now() - this.startedAt >= CONFIG.GAME_DURATION_MS) return 'security';

    return null;
  }

  // ── Serialization ────────────────────────────────────────────────────────

  /** Get lobby-safe player list (no role info leaked — NO demogorgonId, NO socketIds) */
  getLobbyState() {
    return {
      code: this.code,
      phase: this.phase,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        character: p.character,
        isHost: p.isHost,
        score: p.score,
      })),
      lockedCharacters: Object.fromEntries(this.lockedCharacters),
      availableCharacters: this.getAvailableCharacters(),
    };
  }
}
