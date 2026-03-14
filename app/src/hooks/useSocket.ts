import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';

// ── Auto-detect server URL for LAN / mobile support ──────────────────────────
function getServerUrl(): string {
  let url = import.meta.env.VITE_SERVER_URL;
  if (url) {
    // Remove trailing slash if present
    url = url.endsWith('/') ? url.slice(0, -1) : url;
    console.log(`[socket] Using environment server URL: ${url}`);
    return url;
  }
  const hostname = window.location.hostname || 'localhost';
  const defaultUrl = `http://${hostname}:3001`;
  console.log(`[socket] Using fallback server URL: ${defaultUrl}`);
  return defaultUrl;
}

// ── Status decode ────────────────────────────────────────────────────────────
const STATUS_DECODE: Record<number, 'safe' | 'danger' | 'caught' | 'unknown'> = {
  0: 'safe',
  1: 'danger',
  2: 'caught',
  3: 'unknown',
};

// ── Fix 2 (screen-hop): Module-level singleton socket ────────────────────────
// The socket lives at module scope so it survives screen transitions.
// Only ONE connection is ever made; all useSocket() calls share it.
let singletonSocket: Socket | null = null;
let listenersAttached = false;

export function useSocket() {
  const lastEmitRef = useRef<number>(0);
  const store = useGameStore.getState;

  // ── Connect once on first mount ────────────────────────────────────────────
  useEffect(() => {
    const { roomCode, playerId, agentCodename } = store();
    if (!roomCode || !playerId) return;

    // If socket already exists and connected, skip
    if (singletonSocket?.connected) return;

    // If socket already exists but disconnected, it will auto-reconnect
    if (singletonSocket) return;

    const serverUrl = getServerUrl();
    console.log(`[socket] Connecting to ${serverUrl}...`);

    const socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    singletonSocket = socket;

    socket.on('connect', () => {
      console.log('[socket] connected:', socket.id);
      store().setIsConnected(true);

      // On every (re)connect, rejoin room with stored player ID (session resume)
      socket.emit('joinRoom', {
        roomCode,
        playerId,
        playerName: agentCodename || 'UNKNOWN',
      });
    });

    // Only attach listeners once (singleton)
    if (!listenersAttached) {
      listenersAttached = true;

      // ══════════════════════════════════════════════════════════════════════
      //  Block 1 — Lobby & Room Events
      // ══════════════════════════════════════════════════════════════════════

      socket.on('lobbyState', (data: {
        code: string;
        phase: string;
        players: { id: string; name: string; character: string | null; isHost: boolean }[];
        lockedCharacters: Record<string, string>;
        availableCharacters: string[];
      }) => {
        console.log('[socket] lobbyState:', data);

        const me = data.players.find(p => p.id === store().playerId);
        if (me) {
          store().setIsHost(me.isHost);
        }

        const newPlayers = data.players.map(p => ({
          id: p.id,
          name: p.name,
          x: 0,
          y: 0,
          status: 'safe' as const,
          character: p.character as any,
          isHost: p.isHost,
        }));
        store().setPlayers(newPlayers);
        store().setLockedCharacters(data.lockedCharacters);
        store().setAvailableCharacters(data.availableCharacters as any);
      });

      socket.on('playerJoined', (data: { id: string; name: string; character: string | null; isHost: boolean }) => {
        store().addPlayer({
          id: data.id,
          name: data.name,
          x: 0,
          y: 0,
          status: 'safe',
          character: data.character as any,
          isHost: data.isHost,
        });
        store().addIntelEvent({
          timestamp: new Date().toLocaleTimeString(),
          message: `📡 NEW UPLINK: ${data.name} has connected.`,
          type: 'system',
        });
      });

      socket.on('playerLeft', (data: { playerId: string }) => {
        const player = store().players.find((p: any) => p.id === data.playerId);
        store().removePlayer(data.playerId);
        store().addIntelEvent({
          timestamp: new Date().toLocaleTimeString(),
          message: `📡 UPLINK LOST: Agent ${player?.name ?? data.playerId} disconnected.`,
          type: 'warning',
        });
      });

      socket.on('hostChanged', (data: { newHostId: string; newHostName: string }) => {
        if (data.newHostId === store().playerId) {
          store().setIsHost(true);
        }
        store().addIntelEvent({
          timestamp: new Date().toLocaleTimeString(),
          message: `👑 HOST PROMOTED: ${data.newHostName} is now host.`,
          type: 'system',
        });
      });

      // ══════════════════════════════════════════════════════════════════════
      //  Block 2 — Character Lock & Role Events
      // ══════════════════════════════════════════════════════════════════════

      socket.on('characterLocked', (data: { playerId: string; character: string; availableCharacters: string[] }) => {
        console.log(`[socket] Character locked: ${data.character} by ${data.playerId}`);
        store().setAvailableCharacters(data.availableCharacters as any);
        store().setLockedCharacters({
          ...store().lockedCharacters,
          [data.character]: data.playerId,
        });
        // Fix 5: Only update local selection when server confirms OUR lock
        if (data.playerId === store().playerId) {
          store().setAgent(data.character);
        }
      });

      // Fix 1: Handle character release when a player switches characters
      socket.on('characterReleased', (data: { playerId: string; character: string; availableCharacters: string[] }) => {
        console.log(`[socket] Character released: ${data.character} by ${data.playerId}`);
        store().setAvailableCharacters(data.availableCharacters as any);
        const current = { ...store().lockedCharacters };
        delete current[data.character];
        store().setLockedCharacters(current);
      });

      socket.on('phaseChanged', (data: { phase: string }) => {
        console.log(`[socket] Phase changed: ${data.phase}`);
        if (data.phase === 'CHARACTER_SELECT') {
          store().setScreen('character-select');
        } else if (data.phase === 'ROLE_REVEAL') {
          store().setScreen('reveal');
        }
      });

      socket.on('roleRevealed', (data: { playerId: string; role: 'security' | 'demogorgon'; allyIds: string[]; objective: string }) => {
        console.log('[socket] Role revealed:', data.role);
        store().setRole(data.role);
        store().setAllyIds(data.allyIds);
        store().setSecretObjective(data.objective);
        store().addIntelEvent({
          timestamp: new Date().toLocaleTimeString(),
          message: data.objective,
          type: data.role === 'demogorgon' ? 'critical' : 'system',
        });
      });

      // ══════════════════════════════════════════════════════════════════════
      //  Game Started
      // ══════════════════════════════════════════════════════════════════════

      socket.on('gameStarted', (data: { phase: string; demogorgonId?: string; initialPositions: { id: string; x: number; y: number; character: string }[] }) => {
        console.log('[socket] Game started!');
        if (data.demogorgonId) {
          store().setDemogorgonId(data.demogorgonId);
        }
        for (const pos of data.initialPositions) {
          store().updatePlayerPosition(pos.id, pos.x, pos.y);
        }
        store().setScreen('game');
      });
      // ══════════════════════════════════════════════════════════════════════
      //  Block 3 — Movement & Wall Bump
      // ══════════════════════════════════════════════════════════════════════

      socket.on('playerMoved', (data: { playerId: string; x: number; y: number }) => {
        store().updatePlayerPosition(data.playerId, data.x, data.y);
      });

      socket.on('wallBump', (data: { playerId: string; resetX: number; resetY: number; intensity: number }) => {
        if (navigator.vibrate) {
          navigator.vibrate(Math.floor(data.intensity * 200));
        }
      });

      // ══════════════════════════════════════════════════════════════════════
      //  Block 4 — Proximity Hysteresis
      // ══════════════════════════════════════════════════════════════════════

      socket.on('proximityUpdate', (data: { playerId: string; value: number; entering: boolean; leaving: boolean }) => {
        store().setProximityIntensity(data.value);

        if (data.entering) {
          store().setProximityAlert(true);
          store().addIntelEvent({
            timestamp: new Date().toLocaleTimeString(),
            message: `⚠ ANOMALY DETECTED — proximity breach. Intensity: ${(data.value * 100).toFixed(0)}%`,
            type: 'critical',
          });
        } else if (data.leaving) {
          store().setProximityAlert(false);
        }
      });

      // ══════════════════════════════════════════════════════════════════════
      //  Block 5 — Energy Orbs
      // ══════════════════════════════════════════════════════════════════════

      socket.on('orbSync', (orbs: { id: string; x: number; y: number }[]) => {
        store().setOrbs(orbs);
      });

      socket.on('orbCollected', (data: { playerId: string; orbId: string; newScore: number }) => {
        if (data.playerId === store().playerId) {
          store().setPlayerScore(data.newScore);
        }
      });

      // ══════════════════════════════════════════════════════════════════════
      //  Block 6 — Game Snapshot & Game Over
      // ══════════════════════════════════════════════════════════════════════

      socket.on('gameSnapshot', (snapshot: { tick: number; players: [string, number, number, number, number][]; phase: string; elapsed: number; remainingMs: number }) => {
        store().setRemainingMs(snapshot.remainingMs);

        const myPlayerId = store().playerId;
        const myRole = store().role;
        const allies = store().allyIds;

        for (const [id, x, y, statusCode, score] of snapshot.players) {
          const status = STATUS_DECODE[statusCode] ?? 'unknown';
          store().updatePlayerPosition(id, x, y);
          store().updatePlayerStatus(id, status);
          if (id === myPlayerId) {
            store().setPlayerScore(score);
          }

          // Identify Demogorgon: if I'm security, any player not in my allies and not me is the demogorgon
          let isPlayerDemogorgon = false;
          if (myRole === 'security' && id !== myPlayerId && !allies.includes(id)) {
            isPlayerDemogorgon = true;
            store().updateDemogorgonCoords({ x, y });
          }

          // Update isDemogorgon flag on the player in store
          const currentPlayers = store().players;
          const playerIdx = currentPlayers.findIndex((p: any) => p.id === id);
          if (playerIdx !== -1 && currentPlayers[playerIdx].isDemogorgon !== isPlayerDemogorgon) {
            const updated = [...currentPlayers];
            updated[playerIdx] = { ...updated[playerIdx], isDemogorgon: isPlayerDemogorgon };
            store().setPlayers(updated);
          }
        }
      });

      socket.on('playerCaught', (data: { playerId: string; catcherName?: string }) => {
        store().updatePlayerStatus(data.playerId, 'caught');
        store().addIntelEvent({
          timestamp: new Date().toLocaleTimeString(),
          message: `☠ AGENT ELIMINATED${data.catcherName ? ` by ${data.catcherName}` : ''}.`,
          type: 'warning',
        });
      });

      socket.on('catchResult', (data: { success: boolean; targetId?: string; targetName?: string; message?: string }) => {
        if (data.success) {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          store().addIntelEvent({
            timestamp: new Date().toLocaleTimeString(),
            message: `🦷 FEAST! Caught ${data.targetName ?? 'an agent'}!`,
            type: 'critical',
          });
        }
      });

      socket.on('playerAccused', (data: { accusedPlayerId: string; accuserId: string; accuserName?: string; accusedName?: string; correct?: boolean }) => {
        store().addIntelEvent({
          timestamp: new Date().toLocaleTimeString(),
          message: `⚠ ACCUSATION: ${data.accuserName ?? 'Agent'} accuses ${data.accusedName ?? 'Unknown'}${data.correct ? ' — CORRECT! 🎯' : ''}`,
          type: 'warning',
        });
      });

      socket.on('gameOver', (data: { winner: 'demogorgon' | 'security'; fates: { name: string; status: string }[] }) => {
        store().setGameResult({ winner: data.winner, fates: data.fates });
        store().setScreen('gameover');
      });

      socket.on('postGameReport', (report: any) => {
        store().setPostGameReport(report);
      });

      socket.on('error', (data: { message: string }) => {
        console.error('[socket] Server error:', data.message);
        store().setServerError(data.message);
      });

      socket.on('disconnect', (reason: string) => {
        console.log('[socket] disconnected:', reason);
        store().setIsConnected(false);
      });

      socket.on('reconnect_attempt', (attempt: number) => {
        console.log(`[socket] Reconnection attempt ${attempt}...`);
      });

      socket.on('reconnect', () => {
        console.log('[socket] Reconnected!');
        store().setIsConnected(true);
      });
    }

    // Fix 2: Do NOT disconnect on unmount — the singleton stays alive across screens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Emitters ──────────────────────────────────────────────────────────────

  const emitPosition = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastEmitRef.current < 50) return;
    lastEmitRef.current = now;
    singletonSocket?.emit('moveRequest', { x, y });
  }, []);

  const emitPositionLegacy = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastEmitRef.current < 50) return;
    lastEmitRef.current = now;
    singletonSocket?.emit('positionUpdate', {
      playerId: store().playerId,
      x,
      y,
    });
  }, []);

  // Server-authoritative catch — just press CATCH, no targetId
  const emitCatch = useCallback((targetPlayerId?: string) => {
    if (targetPlayerId) {
      singletonSocket?.emit('catchAttempt', { targetPlayerId });
    } else {
      singletonSocket?.emit('catchAttempt', {}); // Server finds nearest
    }
  }, []);

  const emitAccuse = useCallback((accusedPlayerId: string) => {
    singletonSocket?.emit('accuseAttempt', { accusedPlayerId });
  }, []);

  const emitLockCharacter = useCallback((character: string) => {
    singletonSocket?.emit('lockCharacter', { character });
  }, []);

  const emitStartCharacterSelect = useCallback(() => {
    singletonSocket?.emit('startCharacterSelect');
  }, []);

  const emitLockLobby = useCallback(() => {
    singletonSocket?.emit('lockLobby');
  }, []);

  const emitStartGame = useCallback(() => {
    singletonSocket?.emit('startGame');
  }, []);

  return {
    isConnected: !!singletonSocket?.connected,
    emitPosition,
    emitPositionLegacy,
    emitCatch,
    emitAccuse,
    emitLockCharacter,
    emitStartCharacterSelect,
    emitLockLobby,
    emitStartGame,
  };
}
