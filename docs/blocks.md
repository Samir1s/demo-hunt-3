Sprint 1 – Infrastructure & Connectivity (“Skeleton”)
Your version is good; only minor clarifications.

Block 1.1: Server Scaffolding

Keep:

Initialize Node.js/TypeScript project.

Install express (or fastify) and socket.io.

Add:

Basic health check route (GET /health).

Simple config handling (env for port, CORS origin).

Decide early: one process only (no scaling) to keep things simple for hackathon.

Block 1.2: Room Logic

Keep:

In‑memory Room and Player maps.

joinRoom handler.

disconnect handling.

Add:

Enforce min/max players per room (config).

Room phase tracking: LOBBY | RUNNING | FINISHED.

Auto‑cleanup of empty rooms (or mark for cleanup later).

Block 1.3: Frontend Shell

Keep:

SPA structure with Landing + Lobby screens (React or minimal setup).

Add:

Global state for: connectionStatus, roomId, playerId, nickname.

Simple error display (failed join, room not found).

Block 1.4: WebSocket Bridge

Keep:

Socket.IO client.

Real‑time player list in lobby.

Add:

Reconnect strategy (basic): if disconnected mid‑lobby, attempt one reconnect.

Clear separation of event types (constants or TypeScript union) so messages are typed.

Sprint 2 – Secret Roles & Transitions
Very clear already.

Block 2.1: Role Assignment Engine

Keep:

Random Demogorgon selection on host’s “Start” click.

Add:

Guard: only host can trigger; only when phase === "LOBBY" and players >= MIN_PLAYERS.

Store demogorgonId and role in server state, not just in the event.

Block 2.2: Private Role Events

Keep:

Use per‑socket emit for roles (no leaks).

Add:

Also broadcast a generic phaseChanged: RUNNING event to everyone so clients know to move to the Role Reveal screen.

Block 2.3: Reveal UI

Keep:

Glitch‑themed reveal screens, different instructions per role.

Add:

Ideation: Players choose from 10 different theme-appropriate characters before seeing role-specific instructions.

“Tap to enter Hawkins Lab” button that moves to main game screen.

Short 1–2 line objective text per role (so players instantly understand what to do).

Sprint 3 – Radar & Movement System
This sprint is exactly what you need for the core feel.

Block 3.1: Coordinate System

Keep:

Define 2D coordinate space and positionUpdate on server.

Add:

Decide and document scale (e.g., 1 unit ≈ 1 meter OR arbitrary “lab units”).

Clamp positions to map bounds to avoid players going “off‑map”.

Block 3.2: Radar Engine

Keep:

2D Canvas or SVG for blips around player center.

Add:

Basic transform function: (worldX, worldY) -> (screenX, screenY) with zoom factor.

Visual distinction of “self” vs others (size/color) and unclear identity (Security shouldn’t see who is Demogorgon explicitly, unless you want that).

Block 3.3: Mock Movement

Keep:

Virtual joystick / touch‑drag to simulate movement (for development & indoor testing).

Add:

Make the movement input pluggable so you can later swap joystick with real sensor data (e.g., step counter or GPS) without changing server.

Sprint 4 – Proximity & Combat Logic
Very well scoped.

Block 4.1: Proximity Engine

Keep:

Server 5 Hz loop computing Euclidean distances between Demogorgon and all Security.

Add:

Hysteresis to avoid spam: only send new alert when crossing from “out of alert zone” to “in alert zone”.

Configurable alertRadius and captureRadius.

Block 4.2: Alert System

Keep:

proximityAlert events + vibration and red flash on client.

Add:

Intensity levels (LOW when entering zone, HIGH when very close).

Cooldown so you don’t re‑vibrate every tick.

Block 4.3: Catch/Accuse Logic

Keep:

catchAttempt and accuseAttempt with server validation.

Add:

Catch: find nearest alive Security within captureRadius; ignore if none in range.

Accuse: if wrong, decide penalty (e.g., accuser gets flagged or loses ability to accuse again).

Ensure only alive players can act.

Sprint 5 – Game Loop Finalization
Good closing sprint.

Block 5.1: Win Condition Logic

Keep:

“All Security caught” vs “Demogorgon correctly identified”.

Add:

Tie‑breaker when timer runs out (see 5.3).

Single source of truth: all win logic on server; clients only reflect gameOver events.

Block 5.2: Game Over Summary

Keep:

Results screen with stats (time alive, winner, roles).

Add:

Simple “Play again” that reuses same room and re‑randomizes roles (server resets state).

“Exit to Lobby” option.

Block 5.3: Round Timer

Keep:

Countdown that declares Security winners if time runs out.

Add:

Timer should live on server (authoritative), with periodic timerUpdate to clients for UI.

On timeout: if any Security alive → Security win; else Demogorgon win.

Sprint 6 – Demo Polish & Deployment
Nice focus on demo readiness.

Block 6.1: QR Code Integration

Keep:

Generate QR code in lobby with join URL (room code prefilled if possible).

Add:

Confirm that URL includes environment host correctly (dev vs prod).

Quick “copy URL” button for backup.

Block 6.2: Asset Integration

Keep:

Upside Down sound effects and CSS glitch animations.

Add:

Centralized theme variables (colors, fonts, animation durations) so tweaking look is easy.

Lightweight assets to avoid network slowness in the demo.

Block 6.3: Stress Testing

Keep:

Simulate 10+ players and check radar & server performance.

Add:

A small server‑side “bot” mode (optional) that moves fake players in a pattern for load testing.

Basic logging around tick time and number of messages per second.

Final “clean” sprint plan to hand to your dev
You can paste this directly into your project board:

Sprint 1 – Infrastructure & Connectivity (Skeleton)

1.1 Server Scaffolding: Node.js/TS setup, express + socket.io, health route, basic config.

1.2 Room Logic: In‑memory Room/Player maps, joinRoom/disconnect, phases, basic cleanup.

1.3 Frontend Shell: SPA with Landing + Lobby, global state, error messaging.

1.4 WebSocket Bridge: Socket.IO client, real‑time lobby player list, simple reconnect.

Sprint 2 – Secret Roles & Transitions

2.1 Role Assignment Engine: Random Demogorgon, guarded by host + phase + min players.

2.2 Private Role Events: Per‑socket role messages, global phaseChanged: RUNNING.

2.3 Reveal UI: Character selection (choose from 10 theme characters) + Glitch role screens with objectives + “Enter Hawkins Lab” transition.

Sprint 3 – Radar & Movement System

3.1 Coordinate System: (x, y) model, positionUpdate, map bounds, scale definition.

3.2 Radar Engine: Canvas/SVG blips with world→screen transform and clear self/others styling.

3.3 Mock Movement: Virtual joystick/touch input, pluggable movement source.

Sprint 4 – Proximity & Combat Logic

4.1 Proximity Engine: 5 Hz server loop, Euclidean distance, hysteresis, configurable radii.

4.2 Alert System: proximityAlert with vibration, flash, intensity, and cooldown.

4.3 Catch/Accuse Logic: catchAttempt/accuseAttempt with validation, penalties, and state updates.

Sprint 5 – Game Loop Finalization

5.1 Win Conditions: All Security caught vs correct accusation, server‑side only.

5.2 Game Over Summary: Winner banner, per‑player stats, Play‑again + Exit.

5.3 Round Timer: Server‑side countdown, timerUpdate, timeout rules.

Sprint 6 – Demo Polish & Deployment

6.1 QR Code Join: Lobby QR with join URL, copy‑link fallback.

6.2 Visual & Audio Polish: Upside Down theme, glitch animations, SFX, theme variables.

6.3 Stress/Load Check: 10+ players (real or bots), logging tick time and message volume.