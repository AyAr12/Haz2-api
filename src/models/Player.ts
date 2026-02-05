import { IPlayer, ICard, CardNumber } from "../types";

export class Player implements IPlayer {
  id: string;
  socketId: string;
  hand: ICard[];
  isReady: boolean;
  username: string;
  avatar: string;

  constructor(
    id: string,
    socketId: string,
    username: string = "Player",
    avatar: string = "🎴"
  ) {
    this.id = id;
    this.socketId = socketId;
    this.hand = [];
    this.isReady = false;
    this.username = username;
    this.avatar = avatar;
  }

  addCard(card: ICard): void {
    this.hand.push(card);
  }

  removeCard(cardId: string): ICard | null {
    const index = this.hand.findIndex((c) => c.id === cardId);
    if (index === -1) return null;
    return this.hand.splice(index, 1)[0];
  }

  hasCard(cardId: string): boolean {
    return this.hand.some((c) => c.id === cardId);
  }

  hasWon(): boolean {
    return this.hand.length === 0;
  }

  hasCardWithNumber(number: CardNumber): boolean {
    return this.hand.some((c) => c.number === number);
  }

  getCardsWithNumber(number: CardNumber): ICard[] {
    return this.hand.filter((c) => c.number === number);
  }

  clearHand(): void {
    this.hand = [];
  }
}
