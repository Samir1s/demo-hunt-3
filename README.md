<p align="center">
  <img src="docs/banner.png" alt="Demogorgon Hunt Banner" width="100%" />
</p>

<h1 align="center"> DEMOGORGON HUNT</h1>

<p align="center">
  <b>A real-time multiplayer social deduction game set in the Stranger Things universe</b><br/>
  <sub>Built with React · Socket.IO · Canvas · Framer Motion · Zustand</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socket.io" />
  <img src="https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js" />
</p>

---

## 🎮 About

**Demogorgon Hunt** is a multiplayer social deduction game where players take on the roles of **Security agents** patrolling Hawkins National Laboratory, while one hidden player is the **Demogorgon** — a monster from the Upside Down hunting them down.

- **Security agents** must identify and accuse the Demogorgon before it catches everyone
- **The Demogorgon** must hunt and eliminate all agents while keeping its identity hidden
- Real-time movement on a **tile-based map** with **fog of war**, **proximity alerts**, and **energy orbs**

## ✨ Features

| Feature | Description |
|---|---|
| 🏠 **Room System** | Create rooms with unique codes, share with friends to join |
| 🎭 **Role Assignment** | Server-side random role assignment — no identity leaks |
| 🗺️ **Tile-Based World** | 40×40 procedural dungeon with walls, corridors, and secret paths |
| 🔦 **Fog of War** | Security agents can only see players within 6 tiles |
| 📡 **Proximity Radar** | Player-relative radar with edge-clamped blips |
| 🎯 **Server-Authoritative** | All movement, catches, and proximity validated server-side |
| 🔄 **Reconnection** | 30s grace period + auto-reconnect on network drops |
| 📱 **Mobile Ready** | Touch D-Pad, iOS motion permission, auto-detect LAN URL |
| ⚡ **Energy Orbs** | Collectible orbs for scoring and power-ups |
| 🎨 **Premium UI** | Stranger Things aesthetic with CRT effects, glitch text, animations |

## 🏗️ Architecture

```
demogorgon-hunt/
├── app/                          # React Frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── screens/          # LandingScreen, CharacterSelect, RoleReveal, Game, Lobby
│   │   │   ├── canvas/           # GameCanvas (tile renderer), DPadOverlay
│   │   │   ├── radar/            # Player-relative Radar
│   │   │   └── ui/               # GlitchText, Typewriter, shared UI
│   │   ├── hooks/                # useSocket, usePlayerMovement
│   │   ├── store/                # Zustand game store
│   │   ├── data/                 # Game map, character data
│   │   ├── utils/                # Coordinate utils
│   │   └── types/                # TypeScript types
│   └── package.json
│
├── server/                       # Node.js Backend
│   ├── src/
│   │   ├── index.ts              # Express + Socket.IO server
│   │   ├── Room.ts               # Room management, player lifecycle
│   │   ├── GameEngine.ts         # Movement, proximity, catch, fog of war
│   │   ├── gameMap.ts            # Procedural dungeon generation
│   │   └── types.ts              # Shared types & config
│   └── package.json
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 22
- **npm** ≥ 10

### 1. Clone & Install

```bash
git clone https://github.com/Samir1s/demo-hunt-3.git
cd demo-hunt-3

# Install server dependencies
cd server && npm install && cd ..

# Install frontend dependencies
cd app && npm install && cd ..
```

### 2. Start the Server

```bash
cd server
npm run dev
```

The server starts on **`http://localhost:3001`** with hot-reload via `tsx watch`.

### 3. Start the Frontend

```bash
cd app
npm run dev
```

The frontend starts on **`http://localhost:5173`** (or next available port).

### 4. Play!

1. Open `http://localhost:5173` in your browser
2. Enter your **Agent Codename**
3. Click **CREATE ROOM** → share the 6-character code
4. Other players → click **JOIN ROOM** → enter the code
5. Select characters → roles are assigned → hunt begins!

> **LAN Play**: Other devices on the same network can join at `http://<your-ip>:5173` — the app auto-detects the server URL.

## 🛡️ Security & Anti-Cheat

| Mechanism | Implementation |
|---|---|
| **Server-Authoritative Movement** | Wall collision validated server-side; invalid moves rejected |
| **No Identity Leak** | `getLobbyState()` never sends Demogorgon ID; roles sent privately |
| **Server-Side Catch** | Demogorgon presses CATCH → server finds nearest player within 1.5 tiles |
| **Catch Cooldown** | 2-second cooldown prevents catch-spam |
| **Fog of War** | Per-player filtered snapshots; Security only sees 6-tile radius |
| **Reconnection Grace** | 30-second grace period during active games; instant remove in lobby |

## 🎨 Tech Stack

### Frontend
- **React 19** — UI components
- **Vite 8** — Lightning-fast dev server and bundler
- **Zustand** — Lightweight state management
- **Framer Motion** — Smooth animations and transitions
- **Socket.IO Client** — Real-time bidirectional communication
- **HTML Canvas** — Tile-based game renderer with lighting effects
- **TailwindCSS** — Utility-first styling

### Backend
- **Node.js + Express** — HTTP server and REST API
- **Socket.IO** — WebSocket-based real-time events
- **TypeScript** — Full type safety across the stack

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `GET` | `/rooms` | List active rooms (debug/admin) |
| `POST` | `/api/create-room` | Generate a new room with unique code |
| `GET` | `/api/room/:code` | Check if room exists + player count |

## 🎮 Socket Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `joinRoom` | `{ roomCode, playerId, playerName }` | Join/rejoin a room |
| `lockCharacter` | `{ character }` | Lock a character in selection |
| `startGame` | — | Host starts the game |
| `moveRequest` | `{ x, y }` | Request movement (server validates) |
| `catchAttempt` | `{}` | Demogorgon attempts catch (auto-target) |
| `accuseAttempt` | `{ accusedPlayerId }` | Security accuses a player |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `lobbyState` | Room data | Full room state on join |
| `roleRevealed` | `{ role, allyIds, objective }` | Private role assignment |
| `gameSnapshot` | Compressed state | 10Hz game state tick |
| `proximityUpdate` | `{ value, entering, leaving }` | Proximity hysteresis |
| `catchResult` | `{ success, targetName }` | Catch attempt feedback |
| `gameOver` | `{ winner, fates }` | Game end event |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is built for the **IIIT Hackathon 2025**.

---

<p align="center">
  <sub>Built with ❤️ at Hawkins National Laboratory</sub><br/>
  <sub><i>"Friends don't lie."</i> — Eleven</sub>
</p>
