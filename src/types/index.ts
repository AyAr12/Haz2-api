export enum CardType {
  MONNAIE = "monnaie",
  EPEE = "épée",
  PLAT = "plat",
  BATON = "bâton",
}

export enum CardNumber {
  UN = 1,
  DEUX = 2,
  TROIS = 3,
  QUATRE = 4,
  CINQ = 5,
  SIX = 6,
  SEPT = 7,
  DIX = 10,
  ONZE = 11,
  DOUZE = 12,
}

export interface ICard {
  id: string;
  type: CardType;
  number: CardNumber;
}

export interface IPlayer {
  id: string;
  socketId: string;
  hand: ICard[];
  isReady: boolean;
  username?: string; // Nom d'affichage
  avatar?: string; // Avatar emoji
  addCard(card: ICard): void;
  removeCard(cardId: string): ICard | null;
  hasCard(cardId: string): boolean;
  hasWon(): boolean;
  hasCardWithNumber(number: CardNumber): boolean;
  clearHand(): void;
}

export enum GameStatus {
  WAITING = "waiting",
  PLAYING = "playing",
  WAITING_FOR_COUNTER = "waiting_for_counter",
  ROUND_OVER = "round_over",
  MATCH_OVER = "match_over",
  ABANDONED = "abandoned",
}

export enum GameMode {
  RANDOM = "random", // Matchmaking aléatoire
  PRIVATE = "private", // Partie privée via lien
}

export interface PendingEffect {
  type: "block" | "draw2" | "changeType";
  sourcePlayerId: string; // Qui a joué la carte
  targetPlayerId: string; // Qui doit subir/contrer
  canCounter: boolean;
  drawCount?: number; // Pour cumuler les +2
  timeoutAt?: number; // Timestamp pour auto-pioche
}

export interface IGame {
  id: string;
  players: [IPlayer, IPlayer];
  deck: ICard[];
  discardPile: ICard[];
  currentPlayerIndex: 0 | 1;
  currentType: CardType; // Type actif (peut être changé par le 7)
  status: GameStatus;
  winner?: string;
  pendingEffect?: PendingEffect;
  // Match score (best of 9 - first to 5)
  scores: [number, number];
  roundWinner?: string;
  matchWinner?: string;
  currentRound: number;
  turnDeadline?: number;
  // Game mode
  mode: GameMode;
  privateRoomCode?: string;
}

export interface PlayCardRequest {
  gameId: string;
  playerId: string;
  cardId: string;
  newType?: CardType; // Pour le numéro 7
}

export interface DrawCardRequest {
  gameId: string;
  playerId: string;
}

export interface CounterDecisionRequest {
  gameId: string;
  playerId: string;
  willCounter: boolean;
  cardId?: string; // Si willCounter est true, la carte à utiliser
}

// Info joueur envoyée au client
export interface PlayerInfo {
  id: string;
  username: string;
  avatar: string;
}

export interface GameState {
  gameId: string;
  yourHand: ICard[];
  opponentCardCount: number;
  lastCard: ICard;
  currentType: CardType;
  isYourTurn: boolean;
  deckCount: number;
  discardPileCount: number;
  pendingEffect?: {
    type: "block" | "draw2" | "changeType";
    sourcePlayerId: string;
    targetPlayerId: string;
    canCounter: boolean;
    drawCount?: number;
    timeoutAt?: number;
    canYouCounter: boolean; // Si le joueur peut contrer
    mustYouDecide: boolean; // Si le joueur doit prendre une décision
  };
  status: GameStatus;
  turnDeadline?: number;
  // Match info
  yourScore: number;
  opponentScore: number;
  currentRound: number;
  targetScore: number; // 5
  roundWinner?: "you" | "opponent";
  matchWinner?: "you" | "opponent";
  // Player info
  you: PlayerInfo;
  opponent: PlayerInfo;
  // Game mode
  mode: GameMode;
}

export interface MatchResult {
  matchWinner: string;
  isWinner: boolean;
  finalScore: [number, number];
  yourScore: number;
  opponentScore: number;
  reason: "match_won" | "opponent_disconnected";
}

export interface RoundResult {
  roundWinner: string;
  isWinner: boolean;
  roundNumber: number;
  scores: [number, number];
  yourScore: number;
  opponentScore: number;
}

// ─── User/Profile types ───────────────────────────────────────────

export interface UserProfile {
  id: string;
  visitorId: string;
  username: string;
  avatar: string;
  stats: UserStats;
  winRate: number;
}

export interface UserStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  roundsPlayed: number;
  roundsWon: number;
  winStreak: number;
  bestWinStreak: number;
}

// ─── Private Room types ───────────────────────────────────────────

export interface PrivateRoomInfo {
  code: string;
  status: "waiting" | "playing" | "finished" | "expired";
  hostUsername?: string;
  expiresAt: number;
  shareUrl: string;
}

// ─── Socket Events ───────────────────────────────────────────────

export interface ServerToClientEvents {
  // Matchmaking
  queueJoined: (data: { message: string; queueSize: number }) => void;
  searchCancelled: (data: { message: string }) => void;
  matchFound: (data: {
    gameId: string;
    opponentId: string;
    gameState: GameState;
  }) => void;

  // Game
  gameUpdate: (state: GameState) => void;
  roundOver: (data: RoundResult) => void;
  roundStart: (data: { roundNumber: number }) => void;
  matchOver: (data: MatchResult) => void;
  opponentDisconnected: (data: { message: string }) => void;
  error: (data: { message: string }) => void;

  // Private rooms
  roomCreated: (data: PrivateRoomInfo) => void;
  roomJoined: (data: { message: string; roomCode: string }) => void;
  roomCancelled: (data: { message: string }) => void;
  waitingForOpponent: (data: { roomCode: string; shareUrl: string }) => void;

  // Profile
  profileLoaded: (data: UserProfile) => void;
  profileUpdated: (data: UserProfile) => void;
}

export interface ClientToServerEvents {
  // Auth/Profile
  authenticate: (data: { visitorId: string; username?: string }) => void;
  updateProfile: (data: { username?: string; avatar?: string }) => void;

  // Matchmaking
  findMatch: (data: { visitorId: string }) => void;
  cancelSearch: (data: { visitorId: string }) => void;

  // Private rooms
  createPrivateRoom: (data: { visitorId: string }) => void;
  joinPrivateRoom: (data: { visitorId: string; code: string }) => void;
  cancelPrivateRoom: (data: { visitorId: string; code: string }) => void;

  // Game
  playCard: (data: {
    gameId: string;
    playerId: string;
    cardId: string;
    newType?: CardType;
  }) => void;
  counterDecision: (data: {
    gameId: string;
    playerId: string;
    willCounter: boolean;
    cardId?: string;
  }) => void;
  drawCard: (data: { gameId: string; playerId: string }) => void;
}

// Constantes
export const COUNTER_TIMEOUT_MS = 10_000;
export const AUTO_DRAW_TIMEOUT_MS = 15_000;
export const TURN_TIMEOUT_MS = 30_000;
export const ROUND_BREAK_MS = 3_000; // 3s entre les rounds
export const TARGET_SCORE = 5; // Premier à 5 gagne le match
export const PRIVATE_ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
