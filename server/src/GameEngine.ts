// ══════════════════════════════════════════════════════════════════════════════
//  HAWKINS LAB — Game Engine
//  Blocks 3–6: Spatial Engine, Proximity Hysteresis, Energy Orbs, Game Loop
// ══════════════════════════════════════════════════════════════════════════════

import { Server } from 'socket.io';
import { Room } from './Room.js';
import { isWall, randomFloorTile } from './gameMap.js';
import {
  CONFIG,
  GamePhase,
  OrbState,
  CompressedPlayer,
  GameSnapshot,
  ProximityEvent,
  WallBumpEvent,
  PostGameReport,
  PlayerReport,
  STATUS_CODE,
} from './types.js';

// Fog-of-war visibility radius (in tiles)
const VISIBILITY_RADIUS = 6;
const CATCH_COOLDOWN_MS = 2000;

export class GameEngine {
  private room: Room;
  private io: Server;
  private orbs: Map<string, OrbState> = new Map();
  private gameLoopTimer: ReturnType<typeof setInterval> | null = null;
  private orbBroadcastTimer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastCatchAttempt: number = 0; // anti-spam cooldown
  private lastAccuseAttempt: Map<string, number> = new Map(); // per-player accusation cooldown
  private static readonly ACCUSE_COOLDOWN_MS = 10_000; // 10 seconds between accusations

  constructor(room: Room, io: Server) {
    this.room = room;
    this.io = io;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Start all game systems — called when phase transitions to PLAYING */
  start(): void {
    this.spawnOrbs();
    this.startGameLoop();
    this.startOrbBroadcast();
    console.log(`[engine:${this.room.code}] ⚡ Engine started — ${this.orbs.size} orbs spawned`);
  }

  /** Stop all timers — called on game end or room destruction */
  stop(): void {
    if (this.gameLoopTimer) {
      clearInterval(this.gameLoopTimer);
      this.gameLoopTimer = null;
    }
    if (this.orbBroadcastTimer) {
      clearInterval(this.orbBroadcastTimer);
      this.orbBroadcastTimer = null;
    }
    console.log(`[engine:${this.room.code}] 🛑 Engine stopped`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BLOCK 3 — Spatial Engine (Collision & AABB)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate and apply a movement request.
   * - Security: blocked by walls → emit wallBump + reset to last valid pos
   * - Demogorgon: phases through walls, clamped to map boundaries
   *
   * Returns { accepted, finalX, finalY, wallBump? }
   */
  validateMovement(playerId: string, newX: number, newY: number): {
    accepted: boolean;
    finalX: number;
    finalY: number;
    wallBump: WallBumpEvent | null;
  } {
    const player = this.room.players.get(playerId);
    if (!player) return { accepted: false, finalX: 0, finalY: 0, wallBump: null };

    // ── Anti-teleport: max move distance is 2 tiles per request ───────
    const moveDx = newX - player.x;
    const moveDy = newY - player.y;
    const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
    if (moveDist > 2) {
      console.log(`[engine:${this.room.code}] ⛔ Teleport blocked for ${playerId} (dist=${moveDist.toFixed(1)})`);
      return { accepted: false, finalX: player.x, finalY: player.y, wallBump: null };
    }

    const size = CONFIG.WORLD_SIZE;

    if (player.role === 'demogorgon') {
      // ── Demogorgon: Phase-shift through walls, clamp to boundaries ─────
      const clampedX = Math.max(0, Math.min(size - 1, newX));
      const clampedY = Math.max(0, Math.min(size - 1, newY));
      player.x = clampedX;
      player.y = clampedY;
      return { accepted: true, finalX: clampedX, finalY: clampedY, wallBump: null };
    }

    // ── Security: Wall collision check ───────────────────────────────────
    const tileX = Math.floor(newX);
    const tileY = Math.floor(newY);

    if (isWall(tileX, tileY)) {
      // Calculate thud intensity based on movement speed
      const dx = newX - player.x;
      const dy = newY - player.y;
      const speed = Math.sqrt(dx * dx + dy * dy);
      const intensity = Math.min(1.0, speed / 3.0); // normalize to [0,1]

      const bump: WallBumpEvent = {
        playerId,
        resetX: player.x,
        resetY: player.y,
        intensity,
      };

      return { accepted: false, finalX: player.x, finalY: player.y, wallBump: bump };
    }

    // Movement accepted — clamp to walkable bounds
    const finalX = Math.max(1, Math.min(size - 2, newX));
    const finalY = Math.max(1, Math.min(size - 2, newY));
    player.x = finalX;
    player.y = finalY;
    return { accepted: true, finalX, finalY, wallBump: null };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BLOCK 4 — Proximity Hysteresis & Alert System
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check all security players' distance to the Demogorgon.
   * Uses hysteresis: trigger at ALERT_TRIGGER_RADIUS, release at ALERT_RELEASE_RADIUS.
   * Emits proximityUpdate events with intensity scaling (0.0 – 1.0).
   */
  private checkProximity(): ProximityEvent[] {
    if (!this.room.demogorgonId) return [];

    const demo = this.room.players.get(this.room.demogorgonId);
    if (!demo) return [];

    const events: ProximityEvent[] = [];

    for (const [id, player] of this.room.players) {
      if (player.role !== 'security' || player.status === 'caught') continue;

      const dx = player.x - demo.x;
      const dy = player.y - demo.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const wasAlerted = player.isAlerted;

      if (!wasAlerted && distance <= CONFIG.ALERT_TRIGGER_RADIUS) {
        // ── Entering alert zone ───────────────────────────────────────
        player.isAlerted = true;
        player.status = 'danger';

        const intensity = 1.0 - (distance / CONFIG.ALERT_RELEASE_RADIUS);
        events.push({
          playerId: id,
          value: Math.max(0, Math.min(1.0, intensity)),
          entering: true,
          leaving: false,
        });
      } else if (wasAlerted && distance >= CONFIG.ALERT_RELEASE_RADIUS) {
        // ── Leaving alert zone (hysteresis buffer) ────────────────────
        player.isAlerted = false;
        player.status = 'safe';

        events.push({
          playerId: id,
          value: 0,
          entering: false,
          leaving: true,
        });
      } else if (wasAlerted) {
        // ── Still in alert zone — update intensity ────────────────────
        const intensity = 1.0 - (distance / CONFIG.ALERT_RELEASE_RADIUS);
        events.push({
          playerId: id,
          value: Math.max(0, Math.min(1.0, intensity)),
          entering: false,
          leaving: false,
        });
      }
    }

    return events;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BLOCK 5 — Energy Orbs & Score System
  // ═══════════════════════════════════════════════════════════════════════════

  /** Spawn 8–12 orbs at random non-wall positions */
  private spawnOrbs(): void {
    const count = CONFIG.ORB_COUNT_MIN +
      Math.floor(Math.random() * (CONFIG.ORB_COUNT_MAX - CONFIG.ORB_COUNT_MIN + 1));

    for (let i = 0; i < count; i++) {
      const pos = randomFloorTile();
      const orbId = `orb_${i}_${Date.now().toString(36)}`;
      this.orbs.set(orbId, {
        id: orbId,
        x: pos.x,
        y: pos.y,
        active: true,
        respawnAt: null,
      });
    }
  }

  /** Check if any player is close enough to pick up an orb */
  private checkOrbPickups(): { playerId: string; orbId: string; newScore: number }[] {
    const pickups: { playerId: string; orbId: string; newScore: number }[] = [];

    for (const [id, player] of this.room.players) {
      if (player.status === 'caught' || player.role === 'demogorgon') continue;

      for (const [orbId, orb] of this.orbs) {
        if (!orb.active) continue;

        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= CONFIG.ORB_PICKUP_RADIUS) {
          // Award the orb
          player.score += 1;
          orb.active = false;
          orb.respawnAt = Date.now() + CONFIG.ORB_RESPAWN_MS;

          // Schedule respawn
          setTimeout(() => {
            const pos = randomFloorTile();
            orb.x = pos.x;
            orb.y = pos.y;
            orb.active = true;
            orb.respawnAt = null;
          }, CONFIG.ORB_RESPAWN_MS);

          pickups.push({ playerId: id, orbId, newScore: player.score });
          break; // one orb per tick per player
        }
      }
    }

    return pickups;
  }

  /** Get active orb positions for broadcast */
  private getOrbPositions(): { id: string; x: number; y: number }[] {
    const positions: { id: string; x: number; y: number }[] = [];
    for (const orb of this.orbs.values()) {
      if (orb.active) {
        positions.push({ id: orb.id, x: orb.x, y: orb.y });
      }
    }
    return positions;
  }

  /** Broadcast orb positions every 500ms */
  private startOrbBroadcast(): void {
    this.orbBroadcastTimer = setInterval(() => {
      if (this.room.phase !== GamePhase.PLAYING) return;
      this.io.to(this.room.code).emit('orbSync', this.getOrbPositions());
    }, CONFIG.ORB_BROADCAST_MS);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BLOCK 6 — Unified Game Loop (10Hz) & Telemetry
  // ═══════════════════════════════════════════════════════════════════════════

  /** The main game loop — runs every 100ms (10Hz) */
  private startGameLoop(): void {
    this.gameLoopTimer = setInterval(() => {
      if (this.room.phase !== GamePhase.PLAYING) return;
      this.tickCount++;

      // ── 1. Proximity checks ────────────────────────────────────────────
      const proximityEvents = this.checkProximity();
      for (const event of proximityEvents) {
        // Send proximity to the individual player
        const player = this.room.players.get(event.playerId);
        if (player) {
          this.io.to(player.socketId).emit('proximityUpdate', event);
        }
      }

      // ── 2. Orb pickup checks ───────────────────────────────────────────
      const pickups = this.checkOrbPickups();
      for (const pickup of pickups) {
        this.io.to(this.room.code).emit('orbCollected', pickup);
      }

      // ── 3. Win condition check ─────────────────────────────────────────
      const winner = this.room.checkWinCondition();
      if (winner) {
        this.endGame(winner);
        return;
      }

      // ── 4. Per-player filtered snapshot broadcast (fog of war) ────────
      for (const [id, player] of this.room.players) {
        const snapshot = this.buildFilteredSnapshot(id);
        this.io.to(player.socketId).emit('gameSnapshot', snapshot);
      }

    }, CONFIG.TICK_RATE_MS);
  }

  /** Build a compressed game snapshot filtered by visibility (fog of war) */
  private buildFilteredSnapshot(viewerId: string): GameSnapshot {
    const viewer = this.room.players.get(viewerId);
    const isDemogorgon = viewer?.role === 'demogorgon';
    const players: CompressedPlayer[] = [];

    for (const player of this.room.players.values()) {
      // Demogorgon sees all players; Security only sees players within VISIBILITY_RADIUS
      if (!isDemogorgon && player.id !== viewerId && viewer) {
        const dx = player.x - viewer.x;
        const dy = player.y - viewer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > VISIBILITY_RADIUS) continue; // outside fog — hidden
      }

      players.push([
        player.id,
        Math.round(player.x * 100) / 100,
        Math.round(player.y * 100) / 100,
        STATUS_CODE[player.status],
        player.score,
      ]);
    }

    const elapsed = Date.now() - this.room.startedAt;
    return {
      tick: this.tickCount,
      players,
      phase: this.room.phase,
      elapsed,
      remainingMs: Math.max(0, CONFIG.GAME_DURATION_MS - elapsed),
    };
  }

  /** End the game and generate post-game analytics */
  private endGame(winner: 'demogorgon' | 'security'): void {
    this.room.finishGame();
    this.stop();

    const report = this.generatePostGameReport(winner);

    this.io.to(this.room.code).emit('gameOver', {
      winner,
      fates: [...this.room.players.values()]
        .filter(p => p.role !== 'demogorgon')
        .map(p => ({ name: p.name, status: p.status })),
    });

    this.io.to(this.room.code).emit('postGameReport', report);
    console.log(`[engine:${this.room.code}] 🏁 Game over! Winner: ${winner}`);
  }

  /** Generate detailed post-game analytics report */
  private generatePostGameReport(winner: 'demogorgon' | 'security'): PostGameReport {
    const durationMs = Date.now() - this.room.startedAt;
    const demo = this.room.demogorgonId
      ? this.room.players.get(this.room.demogorgonId)
      : null;

    const playerReports: PlayerReport[] = [...this.room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      character: p.character,
      role: p.role,
      status: p.status,
      score: p.score,
      survivalTime: p.role === 'demogorgon' ? durationMs : p.survivalTime,
      finalPosition: { x: p.x, y: p.y },
    }));

    // Find longest survivor (security only)
    const securityReports = playerReports.filter(r => r.role === 'security');
    const longestSurvivor = securityReports.length > 0
      ? securityReports.reduce((a, b) => a.survivalTime > b.survivalTime ? a : b).name
      : 'N/A';

    // Find top orb collector
    const topCollector = securityReports.length > 0
      ? securityReports.reduce((a, b) => a.score > b.score ? a : b).name
      : 'N/A';

    return {
      winner,
      durationMs,
      longestSurvivor,
      topCollector,
      demogorgonName: demo?.name ?? 'Unknown',
      demogorgonFinalPos: demo ? { x: demo.x, y: demo.y } : { x: 0, y: 0 },
      playerReports,
    };
  }

  // ── Public API (called from socket handlers) ─────────────────────────────

  /**
   * Server-authoritative catch — Demogorgon just presses CATCH.
   * Server automatically finds the nearest alive Security player within 1.5 tiles.
   * Includes 2s cooldown anti-spam.
   */
  processCatchAutoTarget(demogorgonId: string): { caught: boolean; targetId?: string; targetName?: string } {
    const demo = this.room.players.get(demogorgonId);
    if (!demo || demo.role !== 'demogorgon') return { caught: false };

    // Anti-spam cooldown
    const now = Date.now();
    if (now - this.lastCatchAttempt < CATCH_COOLDOWN_MS) {
      return { caught: false };
    }
    this.lastCatchAttempt = now;

    // Find nearest alive security player within catch radius
    let nearest: { id: string; dist: number; name: string } | null = null;

    for (const [id, player] of this.room.players) {
      if (player.role !== 'security' || player.status === 'caught') continue;

      const dx = demo.x - player.x;
      const dy = demo.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 1.5 && (!nearest || dist < nearest.dist)) {
        nearest = { id, dist, name: player.name };
      }
    }

    if (!nearest) return { caught: false };

    const target = this.room.players.get(nearest.id)!;
    target.status = 'caught';
    target.survivalTime = now - this.room.startedAt;

    this.io.to(this.room.code).emit('playerCaught', {
      playerId: nearest.id,
      catcherName: demo.name,
    });

    console.log(`[engine:${this.room.code}] ☠ ${nearest.name} was caught by ${demo.name}!`);
    return { caught: true, targetId: nearest.id, targetName: nearest.name };
  }

  /** Legacy processCatch with explicit targetId — still validates server-side */
  processCatch(demogorgonId: string, targetId: string): boolean {
    const demo = this.room.players.get(demogorgonId);
    const target = this.room.players.get(targetId);

    if (!demo || !target) return false;
    if (demo.role !== 'demogorgon') return false;
    if (target.status === 'caught') return false;

    const dx = demo.x - target.x;
    const dy = demo.y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1.5) return false;

    target.status = 'caught';
    target.survivalTime = Date.now() - this.room.startedAt;

    this.io.to(this.room.code).emit('playerCaught', {
      playerId: targetId,
      catcherName: demo.name,
    });

    console.log(`[engine:${this.room.code}] ☠ ${target.name} was caught by ${demo.name}!`);
    return true;
  }

  /** Process an accusation — Security accuses another player of being the Demogorgon */
  processAccusation(accuserId: string, accusedId: string): {
    success: boolean;
    correct: boolean;
  } {
    const accuser = this.room.players.get(accuserId);
    const accused = this.room.players.get(accusedId);

    if (!accuser || !accused) return { success: false, correct: false };
    if (accuser.role !== 'security') return { success: false, correct: false };

    // ── Anti-spam: per-player accusation cooldown ─────────────────────
    const now = Date.now();
    const lastAccuse = this.lastAccuseAttempt.get(accuserId) ?? 0;
    if (now - lastAccuse < GameEngine.ACCUSE_COOLDOWN_MS) {
      return { success: false, correct: false };
    }
    this.lastAccuseAttempt.set(accuserId, now);

    const isCorrect = accused.role === 'demogorgon';

    this.io.to(this.room.code).emit('playerAccused', {
      accusedPlayerId: accusedId,
      accuserId,
      accuserName: accuser.name,
      accusedName: accused.name,
      correct: isCorrect,
    });

    if (isCorrect) {
      this.endGame('security');
    }

    return { success: true, correct: isCorrect };
  }
}
