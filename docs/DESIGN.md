# Demogorgon Hunt — Living Design Document

> **How to use this file**
> Read before you build. Update before you change anything. When a decision shifts, add a note under the relevant section explaining why — don't silently overwrite. The git history of this file is the project's decision log.

---

## 1. What we're building

A mobile-web, real-time multiplayer 2D hide-and-seek game set in the Stranger Things universe. Up to 6 players join a room. One is secretly assigned as the **Demogorgon**. The rest are **Hawkins Lab characters**. Players navigate a 2D Hawkins Lab map visible on their phone. The Demogorgon can move through walls. Regular players cannot. A radar shows nearby players — but the Demogorgon is invisible on it until dangerously close, at which point a RED ALERT fires.

**Platform:** Mobile-first web app (React), accessible via URL or QR code. No install required.

**Scale:** 3–6 concurrent players per room, single venue or remote play over Wi-Fi.

---

## 2. Game flow

```
WELCOME → AUTH → LOBBY → CHARACTER SELECT → GRANT GYRO → ROLE REVEAL → PLAY → RESULTS
```

Each step is a separate screen. The gyroscope permission prompt is shown on the Role Reveal screen — not on app load — because the user has context at that point and grant rates are higher.

---

## 3. Win conditions

| Condition | Winner |
|---|---|
| All players eliminated | Demogorgon |
| Timer expires with at least one survivor | Security (players) |
| Correct accusation | Security (players) |
| Wrong accusation | Accuser is eliminated; game continues |

---

## 4. All locked decisions

| Decision | Answer | Notes |
|---|---|---|
| Max players | 6 per room | Keeps latency low; needs min 3 to start |
| Movement input | Gyroscope / accelerometer | iOS needs permission prompt; joystick fallback if denied |
| Wall signal | Haptic vibration + screen border flash | Demogorgon receives no wall signal |
| Map type | Fixed Hawkins Lab tilemap | Corridors must be 3–4 tiles wide for gyro play |
| Demogorgon wall rule | Bypass all collision server-side | Position delta applied directly, no AABB check |
| Demogorgon radar visibility | Hidden until proximity threshold | Amber warning at alertRadius, RED ALERT at captureRadius |
| Characters | Stranger Things cast, cosmetic only | Eleven, Mike, Will, Dustin, Lucas, Hopper, Joyce, Max, Steve |
| Collectibles | 8–12 energy orbs, auto-pickup on proximity | Respawn after 30s; incentivise player movement |
| Wrong accusation penalty | Accuser is eliminated | Makes accusation high-stakes, not a free guess |
| Auth provider | Firebase Auth (email sign-in) | One SDK import; JWT verified server-side with Firebase Admin |
| Backend | Node.js + TypeScript + Socket.IO | In-memory room state, no database required for game loop |
| Game tick rate | 10 Hz (every 100ms) | Broadcast gameState snapshot to all players in room |
| Frontend renderer | Pixi.js for map + Canvas2D for radar | Zustand for state, Howler.js for SFX |

---

## 5. Screens

### 5.1 Welcome

Full-screen immersive entry using the Stranger Things asset folder. Atmosphere-first — no form elements. Single glowing "ENTER HAWKINS" CTA. Scanline CSS overlay on top of the provided background asset.

### 5.2 Auth

Hawkins Lab clearance terminal aesthetic. Email + password fields only. Toggle between SIGN IN and SIGN UP (sign-up adds a nickname field). CTA reads "REQUEST ACCESS". Backed by Firebase Auth.

### 5.3 Lobby

Two paths: **Create Room** (becomes host) or **Join with code** (6-character alphanumeric). Room code displayed large. Live player list via WebSocket. Host sees START GAME button — enabled only when player count ≥ 3. Others see "Waiting for host…" state. Max 6 players enforced server-side.

### 5.4 Character select

Grid of Stranger Things characters. First-come first-served — taken characters are locked with the claimant's name. 30-second timer or host can skip. Selection is cosmetic only and does not affect game mechanics.

### 5.5 Gyroscope permission (inline on Role Reveal)

Before revealing the role, show a "Grant Motion Access" button. This triggers `DeviceMotionEvent.requestPermission()` on iOS 13+. If granted, enable gyro input. If denied, silently activate the on-screen joystick fallback. Android grants silently with no prompt.

### 5.6 Role reveal

Full-screen private reveal. Demogorgon sees red glitch text + objective bullets (hunt all players). Security sees blue text + objective bullets (survive the timer or correctly accuse). Single CTA: "ENTER HAWKINS LAB" — transitions to the game screen.

### 5.7 Main game (radar)

The primary play screen during the round.

**Top bar:** room code, countdown timer, role badge chip.

**Central panel:** circular radar centered on the player.
- Ally players shown as green blips.
- Demogorgon is not shown.
- Amber pulsing ring appears when Demogorgon is within `alertRadius`.
- Full RED ALERT (screen flash + vibration burst) when within `captureRadius`.
- Energy orbs shown as small yellow dots.

**Bottom bar:**
- Demogorgon: CATCH button (active only within `captureRadius`).
- Players: ACCUSE button (opens modal to pick suspected Demogorgon; wrong accusation = self-elimination).
- Status text: "2 players nearby", "DEMOGORGON CLOSE — RED ALERT", etc.

### 5.8 Results

Winner banner with role reveal (who was the Demogorgon). Per-player summary: character, role, fate (survived / caught), time alive, orbs collected. Host can start another round (roles re-randomised). Anyone can exit to lobby.

---

## 6. Movement system

### How it works

`DeviceMotionEvent` provides acceleration on X/Y axes at ~60 Hz. A low-pass filter (alpha = 0.2) smooths out hand tremor while preserving intentional tilt. The filtered velocity vector is sent to the server as `moveInput` events at 20 Hz. The server applies the vector to the player's position on each 10 Hz tick.

- Tilt phone forward = move up the map.
- Tilt right = move right.
- Dead zone: ignore `|accel| < 0.3 m/s²` to prevent drift when the phone is resting.
- `SPEED_FACTOR` is configurable in `GameConfig`. Start at `2.5` and tune during playtesting.

### Client signal pipeline

```typescript
// Runs at ~60Hz
window.addEventListener('devicemotion', (e) => {
  const ax = e.acceleration.x ?? 0;
  const ay = e.acceleration.y ?? 0;

  // Low-pass filter
  vx = vx * 0.8 + ax * 0.2;
  vy = vy * 0.8 + ay * 0.2;
});

// Send to server at 20Hz
setInterval(() => {
  socket.emit('moveInput', { roomId, dx: vx, dy: -vy });
}, 50);
```

### iOS permission flow

```typescript
async function requestMotion() {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+ only
    const result = await DeviceMotionEvent.requestPermission();
    if (result === 'granted') {
      enableGyro();
    } else {
      enableJoystickFallback();
    }
  } else {
    // Android / desktop — silent grant
    enableGyro();
  }
}
```

> **Testing note:** The iOS permission prompt only appears on a real device. The simulator will not surface it. Test this on Day 1.

---

## 7. Wall collision

### Players (Security)

Server runs AABB collision against the tilemap on every `moveInput`. If the new position is inside a wall tile, the position is rejected and a `wallBump` event is sent back to that client.

```typescript
function movePlayer(player: Player, dx: number, dy: number) {
  const nx = player.x + dx;
  const ny = player.y + dy;

  if (isWall(nx, ny, map)) {
    socket.to(player.id).emit('wallBump');
    // position unchanged
  } else {
    player.x = nx;
    player.y = ny;
  }
}
```

### Demogorgon

No collision check. Position delta is applied directly. Only clamped to map bounds.

```typescript
function moveDemogorgon(d: Player, dx: number, dy: number) {
  d.x = clamp(d.x + dx, 0, MAP_W);
  d.y = clamp(d.y + dy, 0, MAP_H);
  // No wallBump event emitted.
}
```

### Client haptic response

```typescript
socket.on('wallBump', () => {
  navigator.vibrate([80, 20, 30]); // thud pattern
  screenEl.classList.add('wall-flash');
  setTimeout(() => screenEl.classList.remove('wall-flash'), 200);
});

socket.on('proximityAlert', ({ intensity }) => {
  if (intensity === 'RED') {
    navigator.vibrate([200, 50, 200, 50, 300]); // urgent escalating burst
  } else {
    navigator.vibrate([60, 30, 60]); // amber warning
  }
});
```

> `navigator.vibrate` works on Android only. iOS ignores it silently — no fallback needed, no crash.

**Map design constraint:** Corridors must be at least 3–4 tiles wide. Narrower corridors cause constant wall-bumping with gyro input and feel broken.

---

## 8. Game logic

### 8.1 Role assignment

Triggered when host sends `startGame` with room in `LOBBY` phase and ≥ 3 players. Server randomly selects one player as Demogorgon, updates `room.demogorgonId`, sends private `roleAssigned` events to each player, then sets `phase = 'RUNNING'`.

### 8.2 Server tick (10 Hz)

```typescript
setInterval(() => {
  for (const room of activeRooms) {
    if (room.phase !== 'RUNNING') continue;

    // 1. Apply move inputs
    for (const player of room.players) {
      player.isDemogorgon
        ? moveDemogorgon(player, ...)
        : movePlayer(player, ...);
    }

    // 2. Proximity checks
    checkProximity(room); // emits proximityAlert events

    // 3. Orb pickup checks
    checkOrbPickups(room);

    // 4. Timer check
    if (Date.now() - room.startedAt > room.config.roundDurationMs) {
      endGame(room, 'SECURITY');
      continue;
    }

    // 5. Broadcast snapshot (role-filtered)
    broadcastGameState(room);
  }
}, 100);
```

### 8.3 Proximity detection

Two configurable thresholds (in map units):

- `alertRadius` (default: 120) — emit `proximityAlert({ intensity: 'AMBER' })` to the Security player.
- `captureRadius` (default: 50) — emit `proximityAlert({ intensity: 'RED' })`. Demogorgon's CATCH button activates.

Use hysteresis (a small buffer) to avoid spamming alerts when hovering at the threshold boundary.

### 8.4 Catch mechanic

Demogorgon sends `catchAttempt`. Server checks: Demogorgon is alive, room is `RUNNING`, nearest Security player is within `captureRadius`. If valid, that player is marked `CAUGHT` and a `playerCaught` event is broadcast. If no Security players remain alive, game ends with `winner = 'DEMOGORGON'`.

### 8.5 Accuse mechanic

Security player sends `accuseAttempt` with `targetId`. Server checks: accuser is alive, room is `RUNNING`.

- Correct (`targetId === demogorgonId`) → `winner = 'SECURITY'`, game ends.
- Wrong → accuser is marked `CAUGHT`, `accusationResult({ success: false })` broadcast, game continues.

### 8.6 Collectible orbs

8–12 orbs spawned at game start at random non-wall positions. Proximity pickup check runs each server tick. Collected orbs are broadcast and removed from state. Orbs respawn after 30 seconds to keep players moving. Points are tallied per player and shown on the results screen.

---

## 9. Data models

```typescript
type Role = 'DEMOGORGON' | 'SECURITY';
type PlayerStatus = 'ALIVE' | 'CAUGHT' | 'DISCONNECTED';

interface Player {
  id: string;           // socket id
  nickname: string;
  characterId: string;  // e.g. 'eleven', 'mike', 'hopper'
  role?: Role;
  status: PlayerStatus;
  position?: Position;
  score: number;        // orbs collected
}

interface Position {
  x: number;
  y: number;
}

interface Room {
  id: string;           // 6-char room code
  hostId: string;
  players: Record<string, Player>;
  phase: 'LOBBY' | 'RUNNING' | 'FINISHED';
  demogorgonId?: string;
  startedAt?: number;
  orbs: Orb[];
  config: GameConfig;
}

interface GameConfig {
  alertRadius: number;       // default: 120
  captureRadius: number;     // default: 50
  maxPlayers: number;        // default: 6
  roundDurationMs: number;   // default: 300000 (5 min)
  speedFactor: number;       // default: 2.5 — tune during playtesting
}
```

---

## 10. WebSocket events

### Client → Server

```typescript
{ type: 'joinRoom';    roomId?: string; nickname: string; characterId?: string; }
{ type: 'startGame';   roomId: string; }                          // host only
{ type: 'moveInput';   roomId: string; dx: number; dy: number; }  // 20Hz
{ type: 'catchAttempt'; roomId: string; }                         // Demogorgon only
{ type: 'accuseAttempt'; roomId: string; targetId: string; }      // Security only
```

### Server → Client

```typescript
{ type: 'roomState';       room: Room; }
{ type: 'roleAssigned';    role: Role; }
{ type: 'gameState';       players: Player[]; orbs: Orb[]; tick: number; }  // 10Hz
{ type: 'wallBump'; }                                              // private to bumping player
{ type: 'proximityAlert';  intensity: 'AMBER' | 'RED'; }          // private to Security player
{ type: 'playerCaught';    playerId: string; }
{ type: 'accusationResult'; success: boolean; demogorgonId: string; }
{ type: 'gameOver';        winner: 'DEMOGORGON' | 'SECURITY'; room: Room; }
```

---

## 11. Tech stack

### Frontend
- React (Vite)
- Socket.IO client
- Pixi.js — map and sprite rendering
- Canvas2D — circular radar
- Zustand — game state store
- Firebase Auth SDK — email sign-in
- Howler.js — sound effects

### Backend
- Node.js + TypeScript
- Socket.IO server
- In-memory `Map<string, Room>` — no database for game loop
- Firebase Admin SDK — JWT token verification
- Tilemap as a 2D number array loaded from JSON at server startup

### Hosting
- Backend: Railway, Fly.io, or any Node.js host that supports WebSocket
- Frontend: Vercel or Netlify
- Firebase: free Spark tier is sufficient for auth + future Firestore

---

## 12. Build order

| Block | What to build | Est. time |
|---|---|---|
| B1 | Node.js + Socket.IO scaffold, room join/leave | 2h |
| B2 | Firebase Auth — email sign-in, JWT verify on server | 1h |
| B3 | Role assignment, game lifecycle (LOBBY → RUNNING → FINISHED) | 2h |
| B4 | Tilemap JSON + AABB collision (players) + pass-through (Demogorgon) | 3h |
| F1 | React SPA shell, routing, Zustand store | 2h |
| F2 | Auth screen + Firebase sign-in/up UI | 1h |
| F3 | Lobby UI + character select screen | 2h |
| F4 | Gyroscope input + iOS permission + joystick fallback | 2h |
| F5 | Pixi.js map renderer + Canvas2D radar | 4h |
| F6 | Haptic system (wallBump, proximityAlert, RED ALERT) | 1h |
| F7 | Catch / accuse actions + game over screen | 2h |
| F8 | Welcome screen (Stranger Things assets) + sound effects | 2h |
| T1 | Multi-device test, latency tuning, SPEED_FACTOR calibration | 2h |

---

## 13. Known risks

**Gyro calibration** — `SPEED_FACTOR` and the low-pass filter alpha need physical playtesting on real devices. Add a debug overlay in development that shows raw accelerometer values in real time.

**iOS permission** — `DeviceMotionEvent.requestPermission()` only appears on a real iPhone. Test on Day 1, not the night before the demo.

**Tilemap corridor width** — if corridors are too narrow (1–2 tiles), gyro play becomes frustrating. Design the map with 3–4 tile wide corridors minimum.

**Radar scale** — `alertRadius` and `captureRadius` need to be tuned against the actual map dimensions. Start with 120 and 50 map units respectively, then adjust during playtesting.

---

## 14. Stretch features (attempt only if core is stable)

- Power-ups: brief invisibility for Demogorgon, speed boost for players
- Multiple rounds: best-of-N with automatic role rotation
- Leaderboard: stored in Firestore (same Firebase project, zero migration)
- Light AR flavour: camera overlay when Demogorgon is at maximum proximity

---

## 15. Change log

| Date | Change | Reason |
|---|---|---|
| v1.0 | Initial spec | Hackathon kickoff |
| v2.0 | Added character select, collectible orbs, 6-player cap | UX refinement session |
| v2.1 | Locked: gyroscope movement, Firebase Auth, haptic wall signal | Team decision — see Movement section for rationale |
