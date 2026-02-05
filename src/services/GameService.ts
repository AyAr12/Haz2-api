import { Game } from "../models/Game";
import { Player } from "../models/Player";
import {
  GameState,
  CardType,
  GameStatus,
  CardNumber,
  TURN_TIMEOUT_MS,
  TARGET_SCORE,
  ROUND_BREAK_MS,
  GameMode,
  PlayerInfo,
} from "../types";

export class GameService {
  private games: Map<string, Game> = new Map();
  private playerGameMap: Map<string, string> = new Map(); // playerId -> gameId
  private socketPlayerMap: Map<string, string> = new Map(); // socketId → playerId
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();
  private roundTimers: Map<string, NodeJS.Timeout> = new Map();
  private static instance: GameService;

  private constructor() {}

  static getInstance(): GameService {
    if (!GameService.instance) {
      GameService.instance = new GameService();
    }
    return GameService.instance;
  }

  // ─── Mapping socket ↔ player ────────────────────────────────────
  registerSocket(socketId: string, visitorId: string): void {
    this.socketPlayerMap.set(socketId, visitorId);
  }

  unregisterSocket(socketId: string): void {
    this.socketPlayerMap.delete(socketId);
  }

  getPlayerIdBySocket(socketId: string): string | undefined {
    return this.socketPlayerMap.get(socketId);
  }

  // ─── Create match (random matchmaking) ────────────────────────────
  createMatch(
    player1VisitorId: string,
    player1SocketId: string,
    player1Username: string,
    player1Avatar: string,
    player2VisitorId: string,
    player2SocketId: string,
    player2Username: string,
    player2Avatar: string,
    mode: GameMode = GameMode.RANDOM,
    privateRoomCode?: string
  ): Game {
    const player1 = new Player(
      player1VisitorId,
      player1SocketId,
      player1Username,
      player1Avatar
    );
    const player2 = new Player(
      player2VisitorId,
      player2SocketId,
      player2Username,
      player2Avatar
    );

    const game = new Game(player1, player2, mode, privateRoomCode);
    game.startMatch();

    this.games.set(game.id, game);
    this.playerGameMap.set(player1VisitorId, game.id);
    this.playerGameMap.set(player2VisitorId, game.id);
    this.registerSocket(player1SocketId, player1VisitorId);
    this.registerSocket(player2SocketId, player2VisitorId);

    const modeStr = mode === GameMode.PRIVATE ? "Privé" : "Aléatoire";
    console.log(
      `🎮 Match créé [${modeStr}]: ${game.id} — ${player1Username} vs ${player2Username}`
    );
    return game;
  }

  getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  getGameByPlayerId(playerId: string): Game | undefined {
    const gameId = this.playerGameMap.get(playerId);
    return gameId ? this.games.get(gameId) : undefined;
  }

  // ✅ FIX: Nouvelle méthode pour initialiser le timer de tour au début du match
  initializeTurnTimer(gameId: string, onTimeout?: () => void): void {
    const game = this.games.get(gameId);
    if (!game || game.status !== GameStatus.PLAYING) return;

    this.setTurnTimer(gameId, onTimeout);
    console.log(`⏱️ Timer de tour initialisé pour le match ${gameId}`);
  }

  // ─── Start next round ─────────────────────────────────────────────
  startNextRound(gameId: string, onTimeout?: () => void): Game | null {
    const game = this.games.get(gameId);
    if (!game || game.status !== GameStatus.ROUND_OVER) return null;

    game.startNewRound();

    if (onTimeout) {
      this.setTurnTimer(gameId, onTimeout);
    }

    return game;
  }

  scheduleNextRound(gameId: string, onRoundStart: () => void): void {
    this.clearRoundTimer(gameId);
    const timer = setTimeout(() => {
      onRoundStart();
    }, ROUND_BREAK_MS);
    this.roundTimers.set(gameId, timer);
  }

  private clearRoundTimer(gameId: string): void {
    const timer = this.roundTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(gameId);
    }
  }

  // ─── Play card ────────────────────────────────────────────────────
  playCard(
    gameId: string,
    playerId: string,
    cardId: string,
    newType?: CardType,
    onTimeout?: () => void
  ): {
    success: boolean;
    message?: string;
    game?: Game;
    waitingForCounter?: boolean;
    roundOver?: boolean;
    matchOver?: boolean;
  } {
    const game = this.games.get(gameId);
    if (!game) return { success: false, message: "Jeu introuvable" };

    this.clearTurnTimer(gameId);
    const result = game.playCard(playerId, cardId, newType);

    if (result.success) {
      if (result.waitingForCounter && onTimeout) {
        this.setCounterTimeoutTimer(gameId, onTimeout);
      }

      if (game.status === GameStatus.PLAYING) {
        this.setTurnTimer(gameId, onTimeout);
      }
    }

    return {
      ...result,
      game: result.success ? game : undefined,
    };
  }

  // ─── Counter decision ─────────────────────────────────────────────
  handleCounterDecision(
    gameId: string,
    playerId: string,
    willCounter: boolean,
    cardId?: string,
    onTimeout?: () => void
  ): { success: boolean; message?: string; game?: Game } {
    const game = this.games.get(gameId);
    if (!game) return { success: false, message: "Match introuvable" };

    // Annuler le timer existant
    this.clearCounterTimeoutTimer(gameId);
    const result = game.handleCounterDecision(playerId, willCounter, cardId);

    // Si un nouveau timer est nécessaire
    if (
      result.success &&
      game.status === GameStatus.WAITING_FOR_COUNTER &&
      onTimeout
    ) {
      this.setCounterTimeoutTimer(gameId, onTimeout);
    }

    if (result.success && game.status === GameStatus.PLAYING) {
      this.setTurnTimer(gameId, onTimeout);
    }

    return {
      ...result,
      game: result.success ? game : undefined,
    };
  }

  // private setTimeoutTimer(gameId: string, onTimeout: () => void): void {
  //   this.clearTimeoutTimer(gameId);

  //   const game = this.games.get(gameId);
  //   if (!game || !game.pendingEffect?.timeoutAt) return;

  //   const timeUntilTimeout = game.pendingEffect.timeoutAt - Date.now();
  //   if (timeUntilTimeout <= 0) {
  //     onTimeout();
  //     return;
  //   }

  //   const timer = setTimeout(() => {
  //     const currentGame = this.games.get(gameId);
  //     if (currentGame && currentGame.checkAndApplyTimeout()) {
  //       onTimeout();
  //     }
  //   }, timeUntilTimeout);

  //   this.timeoutTimers.set(gameId, timer);
  // }

  // private clearTimeoutTimer(gameId: string): void {
  //   const timer = this.timeoutTimers.get(gameId);
  //   if (timer) {
  //     clearTimeout(timer);
  //     this.timeoutTimers.delete(gameId);
  //   }
  // }

  drawCard(
    gameId: string,
    playerId: string,
    onTimeout?: () => void
  ): { success: boolean; message?: string; game?: Game } {
    const game = this.games.get(gameId);
    if (!game) return { success: false, message: "Match introuvable" };

    // Annuler le timer si c'est une pioche suite à un +2
    if (
      game.pendingEffect?.type === "draw2" &&
      game.pendingEffect.targetPlayerId === playerId
    ) {
      this.clearCounterTimeoutTimer(gameId);
    }

    this.clearTurnTimer(gameId);
    const result = game.drawCard(playerId);

    if (result.success && game.status === GameStatus.PLAYING) {
      this.setTurnTimer(gameId, onTimeout);
    }

    return {
      ...result,
      game: result.success ? game : undefined,
    };
  }

  // ─── Auto-play quand le tour expire (côté serveur) ─────────────
  handleTurnTimeout(gameId: string): {
    action: "draw" | "play" | "none";
    playerId?: string;
    cardId?: string;
    game?: Game;
  } {
    const game = this.games.get(gameId);
    if (!game || game.status !== GameStatus.PLAYING) return { action: "none" };

    const currentPlayer = game.getCurrentPlayer();
    console.log(
      `⏱️ Timeout de tour pour ${currentPlayer.username} dans le match ${gameId}`
    );

    const auto = game.autoPlay(currentPlayer.id);

    if (auto.action === "play" && auto.cardId) {
      const result = game.playCard(currentPlayer.id, auto.cardId);
      if (result.success) {
        return {
          action: "play",
          playerId: currentPlayer.id,
          cardId: auto.cardId,
          game,
        };
      }
    }

    // Sinon pioche
    const drawResult = game.drawCard(currentPlayer.id);
    if (drawResult.success) {
      return { action: "draw", playerId: currentPlayer.id, game };
    }

    return { action: "none" };
  }

  // ─── Timer de counter (pour +2 / blocage) ──────────────────────
  private setCounterTimeoutTimer(gameId: string, onTimeout?: () => void): void {
    this.clearCounterTimeoutTimer(gameId);
    const game = this.games.get(gameId);
    if (!game?.pendingEffect?.timeoutAt || !onTimeout) return;

    const delay = Math.max(0, game.pendingEffect.timeoutAt - Date.now());
    const timer = setTimeout(() => {
      const g = this.games.get(gameId);
      if (g?.checkAndApplyTimeout()) onTimeout();
    }, delay);
    this.timeoutTimers.set(gameId, timer);
  }

  private clearCounterTimeoutTimer(gameId: string): void {
    const timer = this.timeoutTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(gameId);
    }
  }

  // ─── Timer de tour (auto-play après 30s) ───────────────────────
  setTurnTimer(gameId: string, onTimeout?: () => void): void {
    this.clearTurnTimer(gameId);
    if (!onTimeout) return;

    const timer = setTimeout(() => {
      const result = this.handleTurnTimeout(gameId);
      if (result.action !== "none") onTimeout();
    }, TURN_TIMEOUT_MS);
    this.turnTimers.set(gameId, timer);
  }

  private clearTurnTimer(gameId: string): void {
    const timer = this.turnTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.turnTimers.delete(gameId);
    }
  }

  getGameState(gameId: string, playerId: string): GameState | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    const player = game.getPlayerById(playerId);
    if (!player) return null;

    const playerIdx = game.getPlayerIndex(playerId);
    const opponent = game.players.find((p) => p.id !== playerId)!;

    let pendingEffectForPlayer = undefined;
    if (game.pendingEffect) {
      const counterNumber =
        game.pendingEffect.type === "block"
          ? CardNumber.UN
          : game.pendingEffect.type === "draw2"
          ? CardNumber.DEUX
          : CardNumber.SEPT;
      pendingEffectForPlayer = {
        type: game.pendingEffect.type,
        sourcePlayerId: game.pendingEffect.sourcePlayerId,
        targetPlayerId: game.pendingEffect.targetPlayerId,
        canCounter: game.pendingEffect.canCounter,
        drawCount: game.pendingEffect.drawCount,
        timeoutAt: game.pendingEffect.timeoutAt,
        canYouCounter:
          player.hasCardWithNumber(counterNumber) &&
          game.pendingEffect.targetPlayerId === playerId,
        mustYouDecide:
          game.pendingEffect.targetPlayerId === playerId &&
          game.status === GameStatus.WAITING_FOR_COUNTER,
      };
    }

    // Determine round/match winner from player's perspective
    let roundWinner: "you" | "opponent" | undefined;
    if (game.roundWinner) {
      roundWinner = game.roundWinner === playerId ? "you" : "opponent";
    }

    let matchWinner: "you" | "opponent" | undefined;
    if (game.matchWinner) {
      matchWinner = game.matchWinner === playerId ? "you" : "opponent";
    }

    // Player info
    const youInfo: PlayerInfo = {
      id: player.id,
      username: player.username || "Vous",
      avatar: player.avatar || "🎴",
    };

    const opponentInfo: PlayerInfo = {
      id: opponent.id,
      username: opponent.username || "Adversaire",
      avatar: opponent.avatar || "🃏",
    };

    return {
      gameId: game.id,
      yourHand: player.hand,
      opponentCardCount: opponent.hand.length,
      lastCard: game.getLastCard(),
      currentType: game.currentType,
      isYourTurn:
        game.getCurrentPlayer().id === playerId &&
        game.status === GameStatus.PLAYING,
      deckCount: game.deck.length,
      discardPileCount: game.discardPile.length,
      pendingEffect: pendingEffectForPlayer,
      status: game.status,
      turnDeadline: game.turnDeadline,
      // Match info
      yourScore: game.scores[playerIdx],
      opponentScore: game.scores[playerIdx === 0 ? 1 : 0],
      currentRound: game.currentRound,
      targetScore: TARGET_SCORE,
      roundWinner,
      matchWinner,
      // Player info
      you: youInfo,
      opponent: opponentInfo,
      // Game mode
      mode: game.mode,
    };
  }

  removeGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (game) {
      this.clearCounterTimeoutTimer(gameId);
      this.clearTurnTimer(gameId);
      this.clearRoundTimer(gameId);
      game.players.forEach((player) => {
        this.playerGameMap.delete(player.id);
        this.socketPlayerMap.delete(player.socketId);
      });
      this.games.delete(gameId);
      console.log(`Jeu supprimé: ${gameId}`);
    }
  }

  // ─── Disconnect ───────────────────────────────────────────────────
  handlePlayerDisconnect(socketId: string): {
    gameId: string;
    disconnectedPlayerId: string;
    opponentSocketId: string;
    game: Game;
  } | null {
    const playerId = this.socketPlayerMap.get(socketId);
    if (!playerId) return null;

    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) return null;

    const game = this.games.get(gameId);
    if (!game) return null;

    // Trouver l'adversaire
    const opponent = game.getOpponentOf(playerId);
    if (!opponent) return null;

    // Marquer la partie comme abandonnée
    game.abandonMatch(playerId);
    this.clearCounterTimeoutTimer(gameId);
    this.clearTurnTimer(gameId);
    this.clearRoundTimer(gameId);

    return {
      gameId,
      disconnectedPlayerId: playerId,
      opponentSocketId: opponent.socketId,
      game,
    };
  }

  getActiveGamesCount(): number {
    return this.games.size;
  }

  getAllGames(): Game[] {
    return Array.from(this.games.values());
  }
}
