import { EventEmitter } from "events";

export interface QueuedPlayer {
  visitorId: string;
  socketId: string;
  username: string;
  avatar: string;
  timestamp: number;
}

export class MatchmakingService extends EventEmitter {
  private queue: QueuedPlayer[] = [];
  private static instance: MatchmakingService;

  private constructor() {
    super();
  }

  static getInstance(): MatchmakingService {
    if (!MatchmakingService.instance) {
      MatchmakingService.instance = new MatchmakingService();
    }
    return MatchmakingService.instance;
  }

  addToQueue(
    visitorId: string,
    socketId: string,
    username: string,
    avatar: string
  ): void {
    // Vérifier si le joueur est déjà dans la queue
    const existingIndex = this.queue.findIndex(
      (p) => p.visitorId === visitorId
    );
    if (existingIndex !== -1) {
      this.queue.splice(existingIndex, 1);
    }

    this.queue.push({
      visitorId,
      socketId,
      username,
      avatar,
      timestamp: Date.now(),
    });

    console.log(
      `🎮 ${username} ajouté à la queue. Queue size: ${this.queue.length}`
    );

    // Essayer de matcher
    this.tryMatch();
  }

  removeFromQueue(visitorId: string): void {
    const index = this.queue.findIndex((p) => p.visitorId === visitorId);
    if (index !== -1) {
      const player = this.queue.splice(index, 1)[0];
      console.log(
        `🚪 ${player.username} retiré de la queue. Queue size: ${this.queue.length}`
      );
    }
  }

  removeFromQueueBySocket(socketId: string): void {
    const index = this.queue.findIndex((p) => p.socketId === socketId);
    if (index !== -1) {
      const player = this.queue.splice(index, 1)[0];
      console.log(
        `🚪 ${player.username} retiré de la queue (déconnexion). Queue size: ${this.queue.length}`
      );
    }
  }

  private tryMatch(): void {
    if (this.queue.length >= 2) {
      const player1 = this.queue.shift()!;
      const player2 = this.queue.shift()!;

      console.log(
        `⚔️ Match trouvé: ${player1.username} vs ${player2.username}`
      );

      // Émettre un événement pour créer le match
      this.emit("matchFound", player1, player2);
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isPlayerInQueue(visitorId: string): boolean {
    return this.queue.some((p) => p.visitorId === visitorId);
  }

  getPlayerInQueue(visitorId: string): QueuedPlayer | undefined {
    return this.queue.find((p) => p.visitorId === visitorId);
  }
}
