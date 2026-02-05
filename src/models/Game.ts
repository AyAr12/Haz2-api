import { v4 as uuidv4 } from "uuid";
import {
  IGame,
  IPlayer,
  ICard,
  GameStatus,
  CardType,
  CardNumber,
  PendingEffect,
  COUNTER_TIMEOUT_MS,
  AUTO_DRAW_TIMEOUT_MS,
  TURN_TIMEOUT_MS,
  TARGET_SCORE,
  GameMode,
} from "../types";
import { Card } from "./Card";

export class Game implements IGame {
  id: string;
  players: [IPlayer, IPlayer];
  deck: ICard[];
  discardPile: ICard[];
  currentPlayerIndex: 0 | 1;
  currentType: CardType;
  status: GameStatus;
  winner?: string;
  pendingEffect?: PendingEffect;
  turnDeadline?: number;

  // Match system
  scores: [number, number];
  currentRound: number;
  roundWinner?: string;
  matchWinner?: string;
  private roundStarterIndex: 0 | 1; // Alternates each round

  // Game mode
  mode: GameMode;
  privateRoomCode?: string;

  constructor(
    player1: IPlayer,
    player2: IPlayer,
    mode: GameMode = GameMode.RANDOM,
    privateRoomCode?: string
  ) {
    this.id = uuidv4();
    this.players = [player1, player2];
    this.scores = [0, 0];
    this.currentRound = 1;
    this.roundStarterIndex = 0;
    // this.deck = Card.shuffle(Card.createDeck());
    this.deck = [];
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.status = GameStatus.WAITING;
    this.currentType = CardType.MONNAIE; // Will be set properly
    this.mode = mode;
    this.privateRoomCode = privateRoomCode;
  }

  // private dealInitialCards(): void {
  //   for (let i = 0; i < 5; i++) {
  //     this.players[0].addCard(this.deck.pop()!);
  //     this.players[1].addCard(this.deck.pop()!);
  //   }
  // }

  // ─── Round setup ──────────────────────────────────────────────────
  startNewRound(): void {
    // Clear hands
    this.players[0].clearHand();
    this.players[1].clearHand();

    // Fresh deck
    this.deck = Card.shuffle(Card.createDeck());
    this.discardPile = [];

    // Deal 5 cards each
    for (let i = 0; i < 5; i++) {
      this.players[0].addCard(this.deck.pop()!);
      this.players[1].addCard(this.deck.pop()!);
    }

    // First card (no special)
    let firstCard = this.deck.pop()!;
    while (
      [CardNumber.UN, CardNumber.DEUX, CardNumber.SEPT].includes(
        firstCard.number
      )
    ) {
      this.deck.unshift(firstCard);
      this.deck = Card.shuffle(this.deck);
      firstCard = this.deck.pop()!;
    }
    this.discardPile.push(firstCard);
    this.currentType = firstCard.type;

    // Alternate who starts
    this.currentPlayerIndex = this.roundStarterIndex;
    this.roundStarterIndex = this.roundStarterIndex === 0 ? 1 : 0;

    this.pendingEffect = undefined;
    this.roundWinner = undefined;
    this.status = GameStatus.PLAYING;
    this.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
  }

  startMatch(): void {
    this.startNewRound();
  }

  // ─── Round end ────────────────────────────────────────────────────
  private endRound(winnerId: string): void {
    const winnerIdx = this.getPlayerIndex(winnerId);
    this.scores[winnerIdx]++;
    this.roundWinner = winnerId;
    this.turnDeadline = undefined;
    this.pendingEffect = undefined;

    // Check if match is over
    if (this.scores[winnerIdx] >= TARGET_SCORE) {
      this.status = GameStatus.MATCH_OVER;
      this.matchWinner = winnerId;
    } else {
      this.status = GameStatus.ROUND_OVER;
      this.currentRound++;
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────
  getCurrentPlayer(): IPlayer {
    return this.players[this.currentPlayerIndex];
  }

  getOpponent(): IPlayer {
    return this.players[this.currentPlayerIndex === 0 ? 1 : 0];
  }

  getPlayerById(playerId: string): IPlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  getOpponentOf(playerId: string): IPlayer | undefined {
    return this.players.find((p) => p.id !== playerId);
  }

  getLastCard(): ICard {
    return this.discardPile[this.discardPile.length - 1];
  }

  getPlayerIndex(playerId: string): 0 | 1 {
    return this.players[0].id === playerId ? 0 : 1;
  }

  canPlayCard(card: ICard, playerId: string): boolean {
    const lastCard = this.getLastCard();

    // Waiting for player decisionto counter
    if (this.status === GameStatus.WAITING_FOR_COUNTER) {
      if (this.pendingEffect?.targetPlayerId !== playerId) return false;
      if (this.pendingEffect.type === "block" && card.number === CardNumber.UN)
        return true;
      if (
        this.pendingEffect.type === "draw2" &&
        card.number === CardNumber.DEUX
      )
        return true;
      return false;
    }

    // Normal - verify turn of player
    if (this.getCurrentPlayer().id !== playerId) return false;

    // Verify the validity of the card played
    return card.type === this.currentType || card.number === lastCard.number;
  }

  hasPlayableCard(playerId: string): boolean {
    const player = this.getPlayerById(playerId);
    if (!player) return false;
    return player.hand.some((c) => this.canPlayCard(c, playerId));
  }

  playCard(
    playerId: string,
    cardId: string,
    newType?: CardType
  ): {
    success: boolean;
    message?: string;
    waitingForCounter?: boolean;
    roundOver?: boolean;
    matchOver?: boolean;
  } {
    const player = this.getPlayerById(playerId);
    if (!player) return { success: false, message: "Joueur introuvable" };

    // Verify if the player has the card
    if (!player.hasCard(cardId))
      return { success: false, message: "Vous n'avez pas cette carte" };

    const card = player.hand.find((c) => c.id === cardId)!;
    // Verify if the card can be played
    if (!this.canPlayCard(card, playerId))
      return { success: false, message: "Cette carte ne peut pas être jouée" };

    // Remove the card from player's hand and add to discard pile
    player.removeCard(cardId);
    this.discardPile.push(card);

    // Handle special card effects
    const effectResult = this.handleSpecialCard(card, playerId, newType);

    // Verify if the player has won
    if (player.hasWon()) {
      this.endRound(playerId);
      return {
        success: true,
        roundOver: true,
        matchOver: this.status === GameStatus.MATCH_OVER,
      };
    }

    return { success: true, waitingForCounter: effectResult.waitingForCounter };
  }

  private handleSpecialCard(
    card: ICard,
    playerId: string,
    newType?: CardType
  ): {
    waitingForCounter: boolean;
  } {
    const opponent = this.getOpponentOf(playerId)!;

    switch (card.number) {
      case CardNumber.UN: {
        // Contre d'un blocage existant
        if (
          this.pendingEffect?.type === "block" &&
          this.pendingEffect.targetPlayerId === playerId
        ) {
          if (opponent.hasCardWithNumber(CardNumber.UN)) {
            this.pendingEffect = {
              type: "block",
              sourcePlayerId: playerId,
              targetPlayerId: opponent.id,
              canCounter: true,
              timeoutAt: Date.now() + COUNTER_TIMEOUT_MS,
            };
            this.status = GameStatus.WAITING_FOR_COUNTER;
            return { waitingForCounter: true };
          }
          this.pendingEffect = {
            type: "block",
            sourcePlayerId: playerId,
            targetPlayerId: opponent.id,
            canCounter: false,
          };
          this.applyBlockEffect();
          return { waitingForCounter: false };
        }

        // Nouveau blocage
        if (opponent.hasCardWithNumber(CardNumber.UN)) {
          this.pendingEffect = {
            type: "block",
            sourcePlayerId: playerId,
            targetPlayerId: opponent.id,
            canCounter: true,
            timeoutAt: Date.now() + COUNTER_TIMEOUT_MS,
          };
          this.status = GameStatus.WAITING_FOR_COUNTER;
          return { waitingForCounter: true };
        }

        this.pendingEffect = {
          type: "block",
          sourcePlayerId: playerId,
          targetPlayerId: opponent.id,
          canCounter: false,
        };
        this.applyBlockEffect();
        return { waitingForCounter: false };
      }

      case CardNumber.DEUX: {
        const currentDrawCount =
          this.pendingEffect?.type === "draw2"
            ? (this.pendingEffect.drawCount || 0) + 2
            : 2;

        if (opponent.hasCardWithNumber(CardNumber.DEUX)) {
          this.pendingEffect = {
            type: "draw2",
            sourcePlayerId: playerId,
            targetPlayerId: opponent.id,
            canCounter: true,
            drawCount: currentDrawCount,
            timeoutAt: Date.now() + AUTO_DRAW_TIMEOUT_MS,
          };
          this.status = GameStatus.WAITING_FOR_COUNTER;
          return { waitingForCounter: true };
        }
        // L'adversaire n'a pas de 2 → pioche immédiate côté serveur aussi
        this.pendingEffect = {
          type: "draw2",
          sourcePlayerId: playerId,
          targetPlayerId: opponent.id,
          canCounter: false,
          drawCount: currentDrawCount,
        };
        this.applyDrawEffect(opponent.id);
        return { waitingForCounter: false };
      }

      case CardNumber.SEPT: {
        if (newType) this.currentType = newType;

        this.pendingEffect = undefined;
        this.nextTurn();
        return { waitingForCounter: false };
      }

      default: {
        // Carte normale
        this.currentType = card.type;
        this.pendingEffect = undefined;
        this.nextTurn();
        return { waitingForCounter: false };
      }
    }
  }

  // Décision de contre: le joueur choisit de contrer ou non
  handleCounterDecision(
    playerId: string,
    willCounter: boolean,
    cardId?: string
  ): {
    success: boolean;
    message?: string;
  } {
    if (this.status !== GameStatus.WAITING_FOR_COUNTER)
      return { success: false, message: "Pas d'effet en attente de contre" };

    if (this.pendingEffect?.targetPlayerId !== playerId)
      return { success: false, message: "Ce n'est pas à vous de décider" };

    if (willCounter) {
      if (!cardId)
        return { success: false, message: "Carte de contre non spécifiée" };
      // Le joueur va jouer sa carte de contre via playCard
      return this.playCard(playerId, cardId);
    }
    // Le joueur refuse de contrer
    if (this.pendingEffect.type === "block") {
      this.applyBlockEffect();
    } else if (this.pendingEffect.type === "draw2") {
      this.applyDrawEffect(playerId);
    }
    return { success: true };
  }

  // ─── Application of effects ───────────────────────────────────────────
  private applyBlockEffect(): void {
    this.currentType = this.getLastCard().type;

    // Le joueur source rejoue
    const sourceIdx = this.getPlayerIndex(this.pendingEffect!.sourcePlayerId);
    this.currentPlayerIndex = sourceIdx;
    this.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
    this.pendingEffect = undefined;
    this.status = GameStatus.PLAYING;
  }

  /**
   * Après un +2 (ou +4, +6…), le joueur qui pioche NE joue PAS.
   * C'est au joueur qui a posé le dernier 2 de rejouer.
   */
  private applyDrawEffect(targetPlayerId: string): void {
    const target = this.getPlayerById(targetPlayerId)!;
    const drawCount = this.pendingEffect?.drawCount || 2;

    for (let i = 0; i < drawCount; i++) {
      const card = this.drawFromDeck();
      if (card) target.addCard(card);
    }

    this.currentType = this.getLastCard().type;

    // Le joueur source (celui qui a posé le 2) rejoue
    const sourceIdx = this.getPlayerIndex(this.pendingEffect!.sourcePlayerId);
    this.currentPlayerIndex = sourceIdx;
    this.turnDeadline = Date.now() + TURN_TIMEOUT_MS;

    this.pendingEffect = undefined;
    this.status = GameStatus.PLAYING;
  }

  // Auto-pioche si timeout (appelé par le serveur)
  checkAndApplyTimeout(): boolean {
    if (
      this.status !== GameStatus.WAITING_FOR_COUNTER ||
      !this.pendingEffect?.timeoutAt
    )
      return false;

    if (Date.now() >= this.pendingEffect.timeoutAt) {
      if (this.pendingEffect.type === "draw2") {
        this.applyDrawEffect(this.pendingEffect.targetPlayerId);
        return true;
      }
      if (this.pendingEffect.type === "block") {
        this.applyBlockEffect();
        return true;
      }
    }
    return false;
  }

  drawCard(playerId: string): {
    success: boolean;
    message?: string;
    card?: ICard;
  } {
    const player = this.getPlayerById(playerId);
    if (!player) return { success: false, message: "Joueur introuvable" };

    // Si effet de pioche en attente
    if (
      this.pendingEffect?.type === "draw2" &&
      this.pendingEffect.targetPlayerId === playerId
    ) {
      this.applyDrawEffect(playerId);
      return {
        success: true,
        message: `Vous avez pioché ${
          this.pendingEffect?.drawCount || 2
        } cartes`,
      };
    }

    // Vérifier que c'est le tour du joueur
    if (this.getCurrentPlayer().id !== playerId) {
      return { success: false, message: "Ce n'est pas votre tour" };
    }

    // Pioche normale
    const card = this.drawFromDeck();
    if (!card) return { success: false, message: "Le deck est vide" };

    player.addCard(card);
    this.nextTurn();
    return { success: true, card };
  }

  // ─── Recyclage pioche ───────────────────────────────────────────
  private recycleDeck(): void {
    if (this.deck.length === 0 && this.discardPile.length > 1) {
      const lastCard = this.discardPile.pop()!;
      this.deck = Card.shuffle(this.discardPile);
      this.discardPile = [lastCard];
    }
  }

  private drawFromDeck(): ICard | null {
    this.recycleDeck();
    return this.deck.pop() || null;
  }

  // ─── Turn ───────────────────────────────────────────
  private nextTurn(): void {
    this.currentPlayerIndex = this.currentPlayerIndex === 0 ? 1 : 0;
    this.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
  }

  // ─── Auto-play (appelé quand le timer de tour expire) ──────────
  autoPlay(playerId: string): { action: "draw" | "play"; cardId?: string } {
    const player = this.getPlayerById(playerId);
    if (!player) return { action: "draw" };

    // Chercher une carte jouable (la première trouvée, hors spéciales de préférence)
    const normalPlayable = player.hand.find(
      (c) =>
        this.canPlayCard(c, playerId) &&
        ![CardNumber.UN, CardNumber.DEUX, CardNumber.SEPT].includes(c.number)
    );
    if (normalPlayable) return { action: "play", cardId: normalPlayable.id };

    const anyPlayable = player.hand.find((c) => this.canPlayCard(c, playerId));
    if (anyPlayable) return { action: "play", cardId: anyPlayable.id };

    return { action: "draw" };
  }

  // ─── Abandon / Déconnexion ──────────────────────────────────────
  abandonMatch(disconnectedPlayerId: string): void {
    const opponent = this.getOpponentOf(disconnectedPlayerId);
    if (opponent && this.status !== GameStatus.MATCH_OVER) {
      this.status = GameStatus.ABANDONED;
      this.matchWinner = opponent.id;
      this.turnDeadline = undefined;
      this.pendingEffect = undefined;
    }
  }
}
