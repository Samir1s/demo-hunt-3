# Demogorgon Hunt – Technical Specification

## 1. Concept overview

Demogorgon Hunt is a real‑time, multiplayer, location‑based mobile web game inspired by Stranger Things and Pokémon Go.
Players move physically around a venue while viewing a 2D "Upside Down" radar on their phones.
One player is secretly the **Demogorgon**, and the others are **Hawkins Lab Security**.
When the Demogorgon approaches other players in the real world (based on their tracked positions), those players receive proximity alerts (vibration, visual, audio), and the Demogorgon can attempt a "catch".

This document is meant as a handover to a senior/full‑stack game or web engineer.
It focuses on clear architecture, data contracts, and a block‑by‑block workload breakdown.

---

## 2. Target platform and constraints

- **Platform:** Mobile‑first web app (responsive) accessible via URL and QR code.
- **Devices:** Modern Android/iOS smartphones with Chrome/Safari (no install required).
- **Networking:** Stable Wi‑Fi or internet access at hackathon venue.
- **Game scale:** 3–10 concurrent players per room.
- **Real‑time:** Sub‑second perceived latency for position updates and alerts (WebSockets).
- **Indoor/outdoor:** Assume simplified position model (see Section 5) rather than full indoor positioning.

---

## 3. Core game loop

1. **Join lobby**
   - Player scans QR / opens URL.
   - Enters nickname, optionally picks avatar color/icon.
   - Joins an existing room via code or creates a new room.

2. **Secret role assignment**
   - When host taps **Start Game**, server randomly assigns one player as **Demogorgon**, others as **Security**.
   - Each client receives a role‑specific reveal screen; Demogorgon identity is only revealed to that player.

3. **Movement and radar**
   - Clients send periodic position updates to server.
   - Server maintains in‑memory state of all players in the room.
   - Clients render a 2D radar centered on self, with nearby players as blips.

4. **Proximity and alerts**
   - Server continuously checks distance between Demogorgon and each Security player.
   - If distance < capture radius → alert event to Security player (vibration + UI flash).

5. **Catch / win conditions**
   - Demogorgon can attempt a **Catch** when inside capture radius.
   - Caught players are marked as "down" and removed or greyed out on radar.
   - Game ends when:
     - All Security are caught → Demogorgon wins; or
     - Security successfully identifies Demogorgon via an **Accuse** mechanic.

6. **Game over and results**
   - Server broadcasts final state (winner, caught list, duration).
   - Clients show results screen with basic stats.

---

## 4. High‑level architecture

### 4.1 Components

- **Client (Web Frontend)**
  - Mobile‑optimized SPA (React/Vue/Svelte or lightweight vanilla stack).
  - Manages UI, animations, and user input.
  - Maintains a WebSocket connection to the game server.

- **Game Server (Backend)**
  - Node.js/TypeScript with WebSocket framework (e.g., Socket.IO or ws).
  - In‑memory room and state management.
  - Game logic: role assignment, proximity checks, win conditions, events.

- **Optional persistence (stretch)**
  - Lightweight database (Redis/PostgreSQL) if we decide to store leaderboards or historical stats.
  - Not required for initial hackathon demo.

### 4.2 Data flow

- **Join:**
  - Client → Server (REST or WebSocket message): `joinRoom` with nickname + room code.
  - Server → Clients: updated `roomState` snapshot with player list.

- **Role assignment:**
  - Server triggers random selection upon `startGame`.
  - Server → Demogorgon: private message `role: DEMOGORGON`.
  - Server → others: private message `role: SECURITY`.

- **Real‑time positions:**
  - Client → Server: `positionUpdate` every 200–500 ms.
  - Server updates in‑memory player positions.
  - Server → Clients: periodic `radarUpdate` messages for each room (e.g., 5–10 times per second, or throttled per position change).

- **Proximity and alerts:**
  - Server computes distance between Demogorgon and each Security player on position updates.
  - When thresholds are crossed, server → client `proximityAlert` events.

- **Actions (catch/accuse):**
  - Client → Server: `catchAttempt` or `accuseAttempt`.
  - Server validates (distance, remaining alive, etc.) and updates game state.
  - Server → Clients: `playerCaught`, `accusationResult`, `gameOver` events.

---

## 5. Location model and coordinates

For hackathon feasibility we use a simplified position model rather than full GPS+indoor mapping.
The exact choice can be made based on venue, but the server API should stay abstract.

### 5.1 Coordinate abstraction

- Server works with abstract coordinates:
  - `x`, `y`: floating‑point values in an arbitrary coordinate system.
  - Optional `orientation`: angle in degrees (0–360) if needed for radar arrow.
- Distance computation uses Euclidean distance on `(x, y)`.
- Capture radius and alert radius are configurable constants (e.g., 3–5 units).

### 5.2 Possible implementations

Implementation option is a configuration choice; all use the same server interface.

1. **Mock/grid map (safest for hackathon)**
   - The venue is represented as a simplified 2D grid map (Hawkins Lab style).
   - Player movement may be mapped from touches/virtual joystick or coarse movement derived from GPS.

2. **Approximate GPS (if outdoors)**
   - Use Geolocation API to get lat/long and project to local `(x, y)` via simple mapping.
   - Not required for the core prototype but possible.

The MD assumes a generic `Position` type on the wire and keeps the client implementation pluggable.

---

## 6. Screens and UI blocks

### 6.1 Global style

- Visual theme: **Upside Down / Hawkins Lab**.
  - Dark background, red and blue neon highlights.
  - Glitch effects on alerts.
- Mobile‑first, portrait orientation.

### 6.2 Screen: Landing / Join

**Goal:** Quick entry into a room with minimal friction.

Elements:
- Game title + short tagline.
- Input: Nickname (1 text field).
- Actions:
  - Button: **Create Room** → requests new room from server.
  - Input: Room code + **Join Room** button.
- Footer: Short safety disclaimer ("Walk, don’t run. Be aware of surroundings.").

### 6.3 Screen: Lobby

**Goal:** Show who is in the room and allow host to start.

Elements:
- Room code (large, copy and QR if time allows).
- List of players: nickname + small color/icon.
- Player count.
- Host only:
  - Button: **Start Game**.
- Others:
  - Status text: "Waiting for host to start…".

### 6.4 Screen: Role Reveal

**Goal:** Secretly tell each player their role once, then enter the main game.

Elements:
- Big role text:
  - "You are the DEMOGORGON" (red, glitch).
  - or "You are SECURITY" (blue).
- Short description of objective (2–3 bullet points).
- Button: **Enter Hawkins Lab** → transitions to main radar.

### 6.5 Screen: Main Game (Radar)

**Goal:** Be the single, always‑visible play screen during the round.

Layout (from top to bottom):

- **Top bar**
  - Room name or code.
  - Timer (countdown of remaining round time).
  - Role badge chip: "Demogorgon" or "Security" with color.

- **Central panel – Radar**
  - Large circular radar or square minimap centered on player.
  - Player icon at center (orientation arrow optional).
  - Other players as blips:
    - Security always see other players as neutral/ally dots.
    - Demogorgon sees all others as prey dots.
  - Alert ring indicating proximity radius (visual cue).

- **Bottom bar**
  - Left: **Action button**:
    - Demogorgon: **Catch** (active when target inside radius).
    - Security: **Accuse** (opens small modal to pick suspected Demogorgon).
  - Center: Status text
    - Examples: "2 players nearby", "ALERT! Demogorgon close!".
  - Right: Menu / rules icon → opens overlay with quick rules & safety note.

**Feedback behaviors:**
- When server sends `proximityAlert`:
  - Phone vibrates.
  - Screen border flashes red.
  - Optional short sound.
- When server sends `playerCaught`:
  - Short animation over victim’s icon.
  - Victim’s UI shows "You were caught" overlay, then spectate mode or dimmed radar.

### 6.6 Screen: Game Over / Results

**Goal:** Close the loop and show what happened.

Elements:
- Winner banner: "Demogorgon Wins" or "Security Wins".
- Summary list:
  - Each player: role, status (Survived / Caught), time alive.
- Buttons:
  - **Play Again** (host restarts with same room and players, roles re‑randomized).
  - **Exit to Lobby**.

---

## 7. Data models (wire contracts)

Use TypeScript types here as a reference; adapt as needed.

### 7.1 Player

```ts
type Role = 'DEMOGORGON' | 'SECURITY';

type PlayerStatus = 'ALIVE' | 'CAUGHT' | 'DISCONNECTED';

interface Player {
  id: string;           // socket id or server‑generated id
  nickname: string;
  role?: Role;          // assigned after game start
  status: PlayerStatus;
  color: string;        // hex color for avatar dot
  position?: Position;  // last known
}

interface Position {
  x: number;
  y: number;
  orientation?: number; // optional, degrees
}
```

### 7.2 Room / Game

```ts
interface Room {
  id: string;               // room code
  hostId: string;           // player id of host
  players: Record<string, Player>;
  phase: 'LOBBY' | 'RUNNING' | 'FINISHED';
  demogorgonId?: string;
  createdAt: number;
  config: GameConfig;
}

interface GameConfig {
  alertRadius: number;      // distance for proximity alert
  captureRadius: number;    // distance for valid catch
  maxPlayers: number;
  roundDurationMs: number;  // optional timer
}
```

### 7.3 Events (WebSocket messages)

**Client → Server**

```ts
// Join or create room
{
  type: 'joinRoom';
  roomId?: string;      // if empty, create new
  nickname: string;
  color?: string;
}

// Host starting game
{
  type: 'startGame';
  roomId: string;
}

// Periodic position updates
{
  type: 'positionUpdate';
  roomId: string;
  position: Position;
}

// Demogorgon attempts to catch nearby player
{
  type: 'catchAttempt';
  roomId: string;
}

// Security accuses someone of being Demogorgon
{
  type: 'accuseAttempt';
  roomId: string;
  accusedPlayerId: string;
}
```

**Server → Client** (examples, not exhaustive)

```ts
// Full room state (lobby, mid‑game snapshots)
{
  type: 'roomState';
  room: Room;
}

// Role reveal
{
  type: 'roleAssigned';
  role: Role;
}

// Radar update: minimal representation for drawing
{
  type: 'radarUpdate';
  selfId: string;
  players: Array<{
    id: string;
    nickname: string;
    roleHint?: 'ALLY' | 'UNKNOWN';
    status: PlayerStatus;
    position: Position;
    color: string;
  }>;
}

// Server‑side proximity alert
{
  type: 'proximityAlert';
  source: 'DEMOGORGON' | 'PLAYER';
  intensity: 'LOW' | 'HIGH';
}

// Catch / accusation results
{
  type: 'playerCaught';
  playerId: string;
}

{
  type: 'accusationResult';
  success: boolean;
  demogorgonId: string;
}

// Game end
{
  type: 'gameOver';
  winner: 'DEMOGORGON' | 'SECURITY';
  room: Room; // final state for stats
}
```

---

## 8. Game logic details

### 8.1 Role assignment

- Trigger: Host sends `startGame` while room is in `LOBBY` and has ≥ minimum players.
- Server randomly selects one alive player as Demogorgon.
- Server updates `room.demogorgonId` and each `player.role`.
- Server sends `roleAssigned` privately to each player.
- Server sets room `phase = 'RUNNING'`.

### 8.2 Position updates and radar

- Clients send `positionUpdate` at a fixed interval (e.g., 5 times per second) or on significant movement.
- Server updates the player’s `position` in the room.
- On a fixed tick (e.g., 5–10 Hz), server:
  - Computes a radar snapshot per room.
  - Broadcasts `radarUpdate` to all players in that room.

### 8.3 Proximity detection

- For each position update from Demogorgon or Security:
  - Retrieve current positions of Demogorgon and all alive Security players.
  - Compute distance `d` between Demogorgon and each Security.
  - If `d < alertRadius` and not previously in alert state → send `proximityAlert` to that Security.
  - Optionally, support hysteresis (small buffer) to avoid spamming alerts when hovering near threshold.

### 8.4 Catch mechanic

- When Demogorgon sends `catchAttempt`:
  - Server checks Demogorgon is `ALIVE` and room `phase = 'RUNNING'`.
  - Find nearest Security player; if distance ≤ `captureRadius`:
    - Mark that Security `status = 'CAUGHT'`.
    - Broadcast `playerCaught` with that id.
  - Check if any Security remain `ALIVE`:
    - If none → `winner = 'DEMOGORGON'`, set `phase = 'FINISHED'`, broadcast `gameOver`.

### 8.5 Accuse mechanic (optional but recommended)

- When a Security sends `accuseAttempt`:
  - Server validates that accuser is `ALIVE`.
  - If `accusedPlayerId === demogorgonId`:
    - `winner = 'SECURITY'`, `phase = 'FINISHED'`.
    - Broadcast `accusationResult` (success) and `gameOver`.
  - Else:
    - Optionally penalize incorrect accusation (e.g., accuser becomes `CAUGHT`).

### 8.6 Timer‑based end (optional)

- If `roundDurationMs` is configured:
  - Server starts a room timer when game starts.
  - When time elapses and no winner yet:
    - Declare Security winners if at least one Security is still `ALIVE`.

---

## 9. Workload breakdown (block by block)

### 9.1 Backend / Game server

**Block B1 – Project setup**
- Node.js/TypeScript project scaffolding.
- Choose WebSocket stack (Socket.IO or ws).
- Basic HTTP server for health check and static file serving (if needed).

**Block B2 – Room and player management**
- In‑memory data structures for `Room` and `Player`.
- APIs / WS handlers:
  - `joinRoom` (create or join by code).
  - `leaveRoom` (on disconnect or explicit leave).
  - Host detection and reassignment rules.

**Block B3 – Game lifecycle**
- Implement `startGame` handler.
- Role randomization and `roleAssigned` events.
- Room phase transitions: `LOBBY → RUNNING → FINISHED`.

**Block B4 – Real‑time loop and radar**
- Handle `positionUpdate` messages and maintain latest positions.
- Implement periodic tick:
  - Generate per‑room radar snapshots.
  - Broadcast `radarUpdate` messages (with minimal payload).

**Block B5 – Proximity and alerts**
- Implement distance calculation and threshold logic.
- Track which players are currently in alert zone to avoid repeated spam.
- Send `proximityAlert` events with intensity.

**Block B6 – Catch & accuse mechanics**
- Implement `catchAttempt` logic with validation and `playerCaught` events.
- Implement `accuseAttempt` and `accusationResult`.
- Evaluate win conditions and trigger `gameOver`.

**Block B7 – Timer and cleanup (optional)**
- Round timer to auto‑end games.
- Periodic cleanup of inactive rooms.

**Block B8 – DevOps / deployment**
- Containerization (Docker) or direct deployment to chosen platform.
- Environment configuration (ports, CORS, origin restrictions).

### 9.2 Frontend / Client

**Block F1 – App shell and routing**
- Basic SPA structure, routing between screens:
  - Landing → Lobby → RoleReveal → Game → GameOver.
- Global state store (e.g., Redux/Zustand/Pinia) for `player`, `room`, `role`, `connection`.

**Block F2 – WebSocket client and state sync**
- Connection management (connect on join, reconnect logic minimal).
- Serialize/deserialize event types listed in Section 7.3.
- Apply server updates to frontend state.

**Block F3 – Landing & Lobby UI**
- Responsive forms for nickname and room code.
- Lobby list UI with host/guest differentiation.
- “Start game” button for host only.

**Block F4 – Role Reveal UI**
- Themed screens for Demogorgon vs Security reveal.
- Simple explanation text + transition to game.

**Block F5 – Radar rendering**
- 2D canvas/SVG/DOM implementation of radar:
  - Centered player.
  - Transform world `(x, y)` into radar coordinates with configurable scale.
  - Blips with color and simple animations.
- Visual alert ring.

**Block F6 – Game HUD and interactions**
- Top bar (timer, role badge, room code).
- Bottom buttons (Catch / Accuse) with disabled states when not available.
- Status text area for short messages.
- Menu modal for rules and safety.

**Block F7 – Feedback and effects**
- Implement vibration using `navigator.vibrate` on `proximityAlert` and catches.
- Add screen border flash / color changes on alerts.
- Optional sound effects (simple audio clips triggered by events).

**Block F8 – Game Over screen**
- Winner banner with theming.
- Summary list component using final room state.
- Buttons: **Play again** → send restart request; **Exit** → landing.

### 9.3 UX / Design

**Block D1 – Visual style guide**
- Color palette (dark + neon), typography, button styles.
- Icon style for player dots and roles.

**Block D2 – Screen wireframes**
- Low‑fidelity sketches for all screens.
- Validate information hierarchy with team.

**Block D3 – High‑fidelity mockups (time permitting)**
- Figma or similar for main game screen and key flows.

### 9.4 Testing & demo prep

**Block T1 – Local multi‑device test**
- Run server locally; connect multiple phones on same Wi‑Fi.
- Validate latency and radar responsiveness.

**Block T2 – Edge cases**
- Player disconnects mid‑game.
- Host disconnects.
- Rapid join/leave.

**Block T3 – Demo script**
- Prepare a fixed scenario to show judges:
  - 1 phone as Demogorgon (secret).
  - 3–4 phones as Security.
  - Walk around a defined area; trigger alerts and one successful catch.

---

## 10. Stretch features (if core is stable)

- **Power‑ups:** temporary visibility boost, brief invisibility for Demogorgon, speed perks (purely visual).
- **Multiple rounds:** best‑of‑N with automatic role rotation.
- **Simple leaderboard:** per room or global, storing wins/losses.
- **AR flavor (very light):** optional camera overlay when caught or when Demogorgon is extremely close (purely cosmetic, not gameplay‑critical).

These should only be attempted after the core loop (Sections 3–8) is implemented and stable.
