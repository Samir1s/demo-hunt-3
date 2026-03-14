export type ScreenState = 'boot' | 'landing' | 'character-select' | 'reveal' | 'lobby' | 'hero' | 'alert' | 'game' | 'gameover';
export type ViewAs = 'security' | 'demogorgon';
export type CharacterId = 'eleven' | 'hopper' | 'joyce' | 'mike' | 'dustin' | 'max';

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  status: 'safe' | 'danger' | 'unknown' | 'caught';
  character?: CharacterId | null;
  score?: number;
  isHost?: boolean;
  isDemogorgon?: boolean;
}

export interface IntelEvent {
  id: string;
  timestamp: string;
  message: string;
  type: 'system' | 'warning' | 'critical';
}

export interface GameResult {
  winner: 'demogorgon' | 'security';
  fates: { name: string; status: string }[];
}

export interface PostGameReportData {
  winner: 'demogorgon' | 'security';
  durationMs: number;
  longestSurvivor: string;
  topCollector: string;
  demogorgonName: string;
  demogorgonFinalPos: { x: number; y: number };
  playerReports: {
    id: string;
    name: string;
    character: string | null;
    role: string | null;
    status: string;
    score: number;
    survivalTime: number;
    finalPosition: { x: number; y: number };
  }[];
}

export interface OrbData {
  id: string;
  x: number;
  y: number;
}

export interface GameState {
  screen: ScreenState;
  viewAs: ViewAs;
  players: Player[];
  demogorgonCoords: { x: number; y: number };
  intelFeed: IntelEvent[];
  proximityAlertActive: boolean;
  proximityIntensity: number;
  selectedAgent: string | null;
  agentCodename: string;
  gameResult: GameResult | null;

  // ── Multiplayer State ──────────────────────────────────────────────────
  roomCode: string;
  playerId: string;
  demogorgonId: string;
  isHost: boolean;
  isConnected: boolean;
  role: ViewAs | null;
  lockedCharacters: Record<string, string>;     // character → playerId
  availableCharacters: CharacterId[];
  orbs: OrbData[];
  playerScore: number;
  remainingMs: number;
  postGameReport: PostGameReportData | null;
  secretObjective: string;
  allyIds: string[];
  serverError: string | null;

  // Actions
  setScreen: (screen: ScreenState) => void;
  setServerError: (error: string | null) => void;
  setDemogorgonId: (id: string) => void;
  toggleViewAs: () => void;
  updateDemogorgonCoords: (coords: { x: number; y: number }) => void;
  addIntelEvent: (event: Omit<IntelEvent, 'id'>) => void;
  setProximityAlert: (active: boolean) => void;
  setProximityIntensity: (value: number) => void;
  updatePlayerStatus: (id: string, status: Player['status']) => void;
  setAgent: (name: string) => void;
  setCodename: (name: string) => void;
  setGameResult: (result: GameResult) => void;
  resetGame: () => void;

  // ── Multiplayer Actions ────────────────────────────────────────────────
  setRoomCode: (code: string) => void;
  setPlayerId: (id: string) => void;
  setIsHost: (isHost: boolean) => void;
  setIsConnected: (connected: boolean) => void;
  setRole: (role: ViewAs) => void;
  setLockedCharacters: (locked: Record<string, string>) => void;
  setAvailableCharacters: (chars: CharacterId[]) => void;
  setOrbs: (orbs: OrbData[]) => void;
  setPlayerScore: (score: number) => void;
  setRemainingMs: (ms: number) => void;
  setPostGameReport: (report: PostGameReportData) => void;
  setSecretObjective: (objective: string) => void;
  setAllyIds: (ids: string[]) => void;
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerPosition: (playerId: string, x: number, y: number) => void;
}
