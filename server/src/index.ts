// ══════════════════════════════════════════════════════════════════════════════
//  HAWKINS LAB — Socket.IO Server (Thin Router)
//  Delegates all game logic to Room and GameEngine modules
// ══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Room, generateRoomCode } from './Room.js';
import { GameEngine } from './GameEngine.js';
import { GamePhase, type CharacterId } from './types.js';
import { randomFloorTile } from './gameMap.js';

// ── State ────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
const engines = new Map<string, GameEngine>();

// Track which room/player each socket belongs to
const socketMap = new Map<string, { roomCode: string; playerId: string }>();

function getOrCreateRoom(code: string): Room {
  if (!rooms.has(code)) {
    rooms.set(code, new Room(code));
  }
  return rooms.get(code)!;
}

// ── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: rooms.size }));

// REST endpoint: list active rooms (for debugging / admin)
app.get('/rooms', (_req, res) => {
  const data = [...rooms.values()].map(r => ({
    code: r.code,
    phase: r.phase,
    playerCount: r.players.size,
    createdAt: r.createdAt,
  }));
  res.json(data);
});

// ── Fix 1: REST endpoint — Create a new room with a unique code ─────────────
app.post('/api/create-room', (_req, res) => {
  let code: string;
  let attempts = 0;
  do {
    code = generateRoomCode();
    attempts++;
  } while (rooms.has(code) && attempts < 20);

  if (rooms.has(code)) {
    return res.status(500).json({ error: 'Failed to generate unique room code' });
  }

  const room = new Room(code);
  rooms.set(code, room);
  console.log(`[api] Room created: ${code}`);
  res.json({ code, playerCount: 0, phase: room.phase });
});

// ── Fix 1: REST endpoint — Check if room exists + player count ──────────────
app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ exists: false });
  }
  res.json({
    exists: true,
    code: room.code,
    phase: room.phase,
    playerCount: room.players.size,
  });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Socket Handlers ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ════════════════════════════════════════════════════════════════════════════
  //  BLOCK 1 — Room Lifecycle & Join
  // ════════════════════════════════════════════════════════════════════════════

  socket.on('joinRoom', (data: {
    roomCode: string;
    playerId: string;
    playerName: string;
  }) => {
    const room = getOrCreateRoom(data.roomCode);
    const player = room.addPlayer(data.playerId, socket.id, data.playerName);

    if (!player) {
      socket.emit('error', { message: 'Room is full or game already started.' });
      return;
    }

    socket.join(data.roomCode);
    socketMap.set(socket.id, { roomCode: data.roomCode, playerId: data.playerId });

    // Send full lobby state to joining player
    socket.emit('lobbyState', room.getLobbyState());

    // Broadcast new player to rest of room
    socket.to(data.roomCode).emit('playerJoined', {
      id: player.id,
      name: player.name,
      character: player.character,
      isHost: player.isHost,
    });

    console.log(`[room:${data.roomCode}] ${data.playerName} joined (${room.players.size} players) ${player.isHost ? '[HOST]' : ''}`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  BLOCK 2 — Character Lock & Role Engine
  // ════════════════════════════════════════════════════════════════════════════

  socket.on('lockCharacter', (data: { character: CharacterId }) => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomCode);
    if (!room) return;

    const success = room.lockCharacter(info.playerId, data.character);
    if (success) {
      io.to(info.roomCode).emit('characterLocked', {
        playerId: info.playerId,
        character: data.character,
        availableCharacters: room.getAvailableCharacters(),
      });
      console.log(`[room:${info.roomCode}] ${info.playerId} locked "${data.character}"`);
    } else {
      socket.emit('error', { message: `Character "${data.character}" is already taken.` });
    }
  });

  // Host transitions lobby → character select
  socket.on('startCharacterSelect', () => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomCode);
    if (!room) return;

    if (room.transitionToCharacterSelect(info.playerId)) {
      io.to(info.roomCode).emit('phaseChanged', {
        phase: GamePhase.CHARACTER_SELECT,
        lobbyState: room.getLobbyState(),
      });
      console.log(`[room:${info.roomCode}] → CHARACTER_SELECT`);
    }
  });

  // Host transitions character select → role reveal → auto-start game
  socket.on('lockLobby', () => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomCode);
    if (!room) return;

    // Transition to role reveal
    if (!room.transitionToRoleReveal(info.playerId)) {
      socket.emit('error', { message: 'Not all players have selected a character.' });
      return;
    }

    console.log(`[room:${info.roomCode}] → ROLE_REVEAL`);

    // Assign roles cryptographically
    const secretPackets = room.assignRoles();

    // Send each player their own secret packet
    for (const packet of secretPackets) {
      const player = room.players.get(packet.playerId);
      if (player) {
        io.to(player.socketId).emit('roleRevealed', packet);
      }
    }

    io.to(info.roomCode).emit('phaseChanged', { phase: GamePhase.ROLE_REVEAL });
    console.log(`[room:${info.roomCode}] Roles assigned — Demogorgon: ${room.demogorgonId}`);
  });

  // After role reveal, host starts the actual game
  socket.on('startGame', () => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomCode);
    if (!room) return;

    // Spawn players at random floor tiles
    for (const player of room.players.values()) {
      const pos = randomFloorTile();
      player.x = pos.x;
      player.y = pos.y;
    }

    if (!room.startGame()) {
      socket.emit('error', { message: 'Cannot start game — roles not assigned yet.' });
      return;
    }

    // Create and start the game engine
    const engine = new GameEngine(room, io);
    engines.set(info.roomCode, engine);
    engine.start();

    // Broadcast initial positions + phase change
    const initialPositions = [...room.players.values()].map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      character: p.character,
    }));

    io.to(info.roomCode).emit('gameStarted', {
      phase: GamePhase.PLAYING,
      initialPositions,
    });

    console.log(`[room:${info.roomCode}] → PLAYING 🎮`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  BLOCK 3 — Movement Requests (replaces raw positionUpdate)
  // ════════════════════════════════════════════════════════════════════════════

  socket.on('moveRequest', (data: { x: number; y: number }) => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomCode);
    const engine = engines.get(info.roomCode);
    if (!room || !engine || room.phase !== GamePhase.PLAYING) return;

    const result = engine.validateMovement(info.playerId, data.x, data.y);

    if (result.wallBump) {
      // Wall collision — send reset to the player + thud
      socket.emit('wallBump', result.wallBump);
    }

    // Broadcast validated position to rest of room
    socket.to(info.roomCode).emit('playerMoved', {
      playerId: info.playerId,
      x: result.finalX,
      y: result.finalY,
    });
  });

  // ── Legacy positionUpdate support (backward compat) ────────────────────
  socket.on('positionUpdate', (data: { playerId: string; x: number; y: number }) => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const room = rooms.get(info.roomCode);
    const engine = engines.get(info.roomCode);

    if (engine && room?.phase === GamePhase.PLAYING) {
      const result = engine.validateMovement(data.playerId, data.x, data.y);
      if (result.wallBump) {
        socket.emit('wallBump', result.wallBump);
      }
      socket.to(info.roomCode).emit('playerMoved', {
        playerId: data.playerId,
        x: result.finalX,
        y: result.finalY,
      });
    } else if (room) {
      // Pre-game: just relay position
      const player = room.players.get(data.playerId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        socket.to(info.roomCode).emit('playerMoved', {
          playerId: data.playerId,
          x: data.x,
          y: data.y,
        });
      }
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  Catch & Accuse (routed through GameEngine)
  // ════════════════════════════════════════════════════════════════════════════

  socket.on('catchAttempt', (data?: { targetPlayerId?: string }) => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const engine = engines.get(info.roomCode);
    if (!engine) return;

    if (data?.targetPlayerId) {
      // Legacy: explicit target (still server-validated)
      engine.processCatch(info.playerId, data.targetPlayerId);
    } else {
      // Fix 2: Server-authoritative — auto-find nearest player
      const result = engine.processCatchAutoTarget(info.playerId);
      if (result.caught) {
        socket.emit('catchResult', { success: true, targetId: result.targetId, targetName: result.targetName });
      } else {
        socket.emit('catchResult', { success: false, message: 'No target in range or cooldown active.' });
      }
    }
  });

  socket.on('accuseAttempt', (data: { accusedPlayerId: string }) => {
    const info = socketMap.get(socket.id);
    if (!info) return;

    const engine = engines.get(info.roomCode);
    if (!engine) return;

    engine.processAccusation(info.playerId, data.accusedPlayerId);
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  Disconnect & Cleanup
  // ════════════════════════════════════════════════════════════════════════════

  socket.on('disconnect', () => {
    const info = socketMap.get(socket.id);
    if (!info) {
      console.log(`[-] Disconnected (untracked): ${socket.id}`);
      return;
    }

    const room = rooms.get(info.roomCode);
    if (room) {
      // Fix 3: Use grace period during active games instead of immediate removal
      room.markDisconnected(info.playerId, () => {
        // Grace period expired — actually remove the player
        const newHostId = room.removePlayer(info.playerId);

        io.to(info.roomCode).emit('playerLeft', { playerId: info.playerId });

        if (newHostId) {
          const newHost = room.players.get(newHostId);
          io.to(info.roomCode).emit('hostChanged', {
            newHostId,
            newHostName: newHost?.name ?? 'Unknown',
          });
          console.log(`[room:${info.roomCode}] 👑 Host promoted: ${newHost?.name}`);
        }

        // If room is empty, clean up
        if (room.players.size === 0) {
          const engine = engines.get(info.roomCode);
          if (engine) engine.stop();
          engines.delete(info.roomCode);
          rooms.delete(info.roomCode);
          console.log(`[room:${info.roomCode}] 🗑️ Room destroyed (empty)`);
        }
      });
    }

    socketMap.delete(socket.id);
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  🔴  HAWKINS LAB SERVER — UPSIDE DOWN PROTOCOL v2.0    ║`);
  console.log(`║  🌐  http://localhost:${PORT}                             ║`);
  console.log(`║  📡  Socket.IO active                                  ║`);
  console.log(`║  🎮  Blocks 1-6: Room • Characters • Spatial •         ║`);
  console.log(`║      Proximity • Orbs • Game Loop                      ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
});
