import { create } from 'zustand';
import type { GameState, CharacterId } from '../types/game';

const ALL_CHARACTERS: CharacterId[] = ['eleven', 'hopper', 'joyce', 'mike', 'dustin', 'max'];

const INITIAL_STATE = {
  screen: 'boot' as const,
  viewAs: 'security' as const,
  players: [] as any[], // No ghost players — populated by server events only
  demogorgonCoords: { x: 45, y: 45 },
  intelFeed: [
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      message: 'SYSTEM INITIALIZATION COMPLETE',
      type: 'system' as const,
    },
  ],
  proximityAlertActive: false,
  proximityIntensity: 0,
  selectedAgent: null as string | null,
  agentCodename: '',
  gameResult: null,

  // ── Multiplayer State ──────────────────────────────────────────────────
  roomCode: '',
  playerId: '',
  isHost: false,
  isConnected: false,
  role: null as 'security' | 'demogorgon' | null,
  lockedCharacters: {} as Record<string, string>,
  availableCharacters: ALL_CHARACTERS,
  orbs: [] as { id: string; x: number; y: number }[],
  playerScore: 0,
  remainingMs: 5 * 60 * 1000,
  postGameReport: null,
  secretObjective: '',
  allyIds: [] as string[],
};

export const useGameStore = create<GameState>((set) => ({
  ...INITIAL_STATE,

  setScreen: (screen) => set({ screen }),

  toggleViewAs: () =>
    set((state) => ({
      viewAs: state.viewAs === 'security' ? 'demogorgon' : 'security',
    })),

  updateDemogorgonCoords: (coords) => set({ demogorgonCoords: coords }),

  addIntelEvent: (event) =>
    set((state) => ({
      intelFeed: [
        ...state.intelFeed,
        { ...event, id: Math.random().toString(36).substr(2, 9) },
      ],
    })),

  setProximityAlert: (active) => set({ proximityAlertActive: active }),
  setProximityIntensity: (value) => set({ proximityIntensity: value }),

  updatePlayerStatus: (id, status) =>
    set((state) => ({
      players: state.players.map((p) => (p.id === id ? { ...p, status } : p)),
    })),

  setAgent: (name) => set({ selectedAgent: name }),
  setCodename: (name) => set({ agentCodename: name }),
  setGameResult: (result) => set({ gameResult: result }),

  resetGame: () => set({
    ...INITIAL_STATE,
    screen: 'landing',
  }),

  // ── Multiplayer Actions ────────────────────────────────────────────────
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayerId: (id) => set({ playerId: id }),
  setIsHost: (isHost) => set({ isHost }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setRole: (role) => set({ role, viewAs: role }),
  setLockedCharacters: (locked) => set({ lockedCharacters: locked }),
  setAvailableCharacters: (chars) => set({ availableCharacters: chars }),
  setOrbs: (orbs) => set({ orbs }),
  setPlayerScore: (score) => set({ playerScore: score }),
  setRemainingMs: (ms) => set({ remainingMs: ms }),
  setPostGameReport: (report) => set({ postGameReport: report }),
  setSecretObjective: (objective) => set({ secretObjective: objective }),
  setAllyIds: (ids) => set({ allyIds: ids }),

  setPlayers: (players) => set({ players }),
  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players.filter(p => p.id !== player.id), player],
    })),
  removePlayer: (playerId) =>
    set((state) => ({
      players: state.players.filter(p => p.id !== playerId),
    })),
  updatePlayerPosition: (playerId, x, y) =>
    set((state) => ({
      players: state.players.map(p => p.id === playerId ? { ...p, x, y } : p),
    })),
}));
