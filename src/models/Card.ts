import { v4 as uuidv4 } from 'uuid';
import { ICard, CardType, CardNumber } from '../types';

export class Card implements ICard {
  id: string;
  type: CardType;
  number: CardNumber;

  constructor(type: CardType, number: CardNumber) {
    this.id = uuidv4();
    this.type = type;
    this.number = number;
  }

  static createDeck(): ICard[] {
    const deck: ICard[] = [];
    const types = [CardType.MONNAIE, CardType.EPEE, CardType.PLAT, CardType.BATON];
    const numbers = [
      CardNumber.UN,
      CardNumber.DEUX,
      CardNumber.TROIS,
      CardNumber.QUATRE,
      CardNumber.CINQ,
      CardNumber.SIX,
      CardNumber.SEPT,
      CardNumber.DIX,
      CardNumber.ONZE,
      CardNumber.DOUZE
    ];

    // 4t × 10n = 40c
    for (const type of types) {
      for (const number of numbers) {
        deck.push(new Card(type, number));
      }
    }
    return deck;
  }

  static shuffle(deck: ICard[]): ICard[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}