import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';

// ── Fix 3: Auto-detect server URL for LAN / mobile support ──────────────────
function getServerUrl(): string {
  // In production, use same host as the page. In dev, use the hostname + port 3001.
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:3001`;
}

// ── Status decode ────────────────────────────────────────────────────────────
const STATUS_DECODE: Record<number, 'safe' | 'danger' | 'caught' | 'unknown'> = {
  0: 'safe',
  1: 'danger',
  2: 'caught',
  3: 'unknown',
};

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const lastEmitRef = useRef<number>(0);

  const store = useGameStore.getState;

  // ── Connect on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    const { roomCode, playerId, agentCodename } = store();
    if (!roomCode || !playerId) return; // Don't connect without room info

    // Prevent duplicate connections
    if (socketRef.current?.connected) return;

    const serverUrl = getServerUrl();
    console.log(`[socket] Connecting to ${serverUrl}...`);

    const socket = io(serverUrl, {
      transports: ['websocket'],
      // Fix 3: Reconnection config — handles screen-off, network drops
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[socket] connected:', socket.id);
      store().setIsConnected(true);

      // Fix 3: On every (re)connect, rejoin room with stored player ID (session resume)
      socket.emit('joinRoom', {
        roomCode,
        playerId,
        playerName: agentCodename || 'UNKNOWN',
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    //  Block 1 — Lobby & Room Events
    // ════════════════════════════════════════════════════════════════════════

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
      const player = store().players.find(p => p.id === data.playerId);
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

    // ════════════════════════════════════════════════════════════════════════
    //  Block 2 — Character Lock & Role Events
    // ════════════════════════════════════════════════════════════════════════

    socket.on('characterLocked', (data: { playerId: string; character: string; availableCharacters: string[] }) => {
      console.log(`[socket] Character locked: ${data.character} by ${data.playerId}`);
      store().setAvailableCharacters(data.availableCharacters as any);
      store().setLockedCharacters({
        ...store().lockedCharacters,
        [data.character]: data.playerId,
      });
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

    // ════════════════════════════════════════════════════════════════════════
    //  Game Started
    // ════════════════════════════════════════════════════════════════════════

    socket.on('gameStarted', (data: { phase: string; initialPositions: { id: string; x: number; y: number; character: string }[] }) => {
      console.log('[socket] Game started!');
      for (const pos of data.initialPositions) {
        store().updatePlayerPosition(pos.id, pos.x, pos.y);
      }
      store().setScreen('game');
    });

    // ════════════════════════════════════════════════════════════════════════
    //  Block 3 — Movement & Wall Bump
    // ════════════════════════════════════════════════════════════════════════

    socket.on('playerMoved', (data: { playerId: string; x: number; y: number }) => {
      store().updatePlayerPosition(data.playerId, data.x, data.y);
    });

    socket.on('wallBump', (data: { playerId: string; resetX: number; resetY: number; intensity: number }) => {
      if (navigator.vibrate) {
        navigator.vibrate(Math.floor(data.intensity * 200));
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    //  Block 4 — Proximity Hysteresis
    // ════════════════════════════════════════════════════════════════════════

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

    // ════════════════════════════════════════════════════════════════════════
    //  Block 5 — Energy Orbs
    // ════════════════════════════════════════════════════════════════════════

    socket.on('orbSync', (orbs: { id: string; x: number; y: number }[]) => {
      store().setOrbs(orbs);
    });

    socket.on('orbCollected', (data: { playerId: string; orbId: string; newScore: number }) => {
      if (data.playerId === store().playerId) {
        store().setPlayerScore(data.newScore);
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    //  Block 6 — Game Snapshot & Game Over
    // ════════════════════════════════════════════════════════════════════════

    socket.on('gameSnapshot', (snapshot: { tick: number; players: [string, number, number, number, number][]; phase: string; elapsed: number; remainingMs: number }) => {
      store().setRemainingMs(snapshot.remainingMs);

      for (const [id, x, y, statusCode, score] of snapshot.players) {
        const status = STATUS_DECODE[statusCode] ?? 'unknown';
        store().updatePlayerPosition(id, x, y);
        store().updatePlayerStatus(id, status);
        if (id === store().playerId) {
          store().setPlayerScore(score);
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
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected:', reason);
      store().setIsConnected(false);
    });

    // Fix 3: Log reconnection attempts
    socket.on('reconnect_attempt', (attempt) => {
      console.log(`[socket] Reconnection attempt ${attempt}...`);
    });

    socket.on('reconnect', () => {
      console.log('[socket] Reconnected!');
      store().setIsConnected(true);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Emitters ──────────────────────────────────────────────────────────────

  const emitPosition = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastEmitRef.current < 50) return;
    lastEmitRef.current = now;
    socketRef.current?.emit('moveRequest', { x, y });
  }, []);

  const emitPositionLegacy = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastEmitRef.current < 50) return;
    lastEmitRef.current = now;
    socketRef.current?.emit('positionUpdate', {
      playerId: store().playerId,
      x,
      y,
    });
  }, []);

  // Fix 2: Server-authoritative catch — just press CATCH, no targetId
  const emitCatch = useCallback((targetPlayerId?: string) => {
    if (targetPlayerId) {
      socketRef.current?.emit('catchAttempt', { targetPlayerId });
    } else {
      socketRef.current?.emit('catchAttempt', {}); // Server finds nearest
    }
  }, []);

  const emitAccuse = useCallback((accusedPlayerId: string) => {
    socketRef.current?.emit('accuseAttempt', { accusedPlayerId });
  }, []);

  const emitLockCharacter = useCallback((character: string) => {
    socketRef.current?.emit('lockCharacter', { character });
  }, []);

  const emitStartCharacterSelect = useCallback(() => {
    socketRef.current?.emit('startCharacterSelect');
  }, []);

  const emitLockLobby = useCallback(() => {
    socketRef.current?.emit('lockLobby');
  }, []);

  const emitStartGame = useCallback(() => {
    socketRef.current?.emit('startGame');
  }, []);

  return {
    isConnected: !!socketRef.current?.connected,
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
