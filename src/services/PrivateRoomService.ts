import { PrivateRoom, IPrivateRoom, RoomStatus } from "../models/PrivateRoom";
import { EventEmitter } from "events";

export interface RoomJoinResult {
  success: boolean;
  message?: string;
  room?: IPrivateRoom;
}

export class PrivateRoomService extends EventEmitter {
  private static instance: PrivateRoomService;
  // Map pour tracker les rooms actives en mémoire (socketId -> roomCode)
  private activeRooms: Map<string, string> = new Map();

  private constructor() {
    super();
  }

  static getInstance(): PrivateRoomService {
    if (!PrivateRoomService.instance) {
      PrivateRoomService.instance = new PrivateRoomService();
    }
    return PrivateRoomService.instance;
  }

  /**
   * Crée une nouvelle room privée
   */
  async createRoom(
    hostVisitorId: string,
    hostSocketId: string
  ): Promise<IPrivateRoom> {
    // Annuler les anciennes rooms en attente de ce host
    await PrivateRoom.updateMany(
      { hostVisitorId, status: RoomStatus.WAITING },
      { status: RoomStatus.EXPIRED }
    );

    const room = await PrivateRoom.create({
      hostVisitorId,
      hostSocketId,
    });

    this.activeRooms.set(hostSocketId, room.code);
    console.log(`🏠 Room privée créée: ${room.code} par ${hostVisitorId}`);

    return room;
  }

  /**
   * Rejoindre une room privée
   */
  async joinRoom(
    code: string,
    guestVisitorId: string,
    guestSocketId: string
  ): Promise<RoomJoinResult> {
    const room = await PrivateRoom.findOne({ code });

    if (!room) {
      return { success: false, message: "Room introuvable" };
    }

    if (room.hostVisitorId === guestVisitorId) {
      return {
        success: false,
        message: "Vous ne pouvez pas rejoindre votre propre room",
      };
    }

    if (room.status !== RoomStatus.WAITING) {
      return { success: false, message: "Cette room n'est plus disponible" };
    }

    if (room.isExpired()) {
      room.status = RoomStatus.EXPIRED;
      await room.save();
      return { success: false, message: "Le lien a expiré" };
    }

    // Mettre à jour la room avec le guest
    room.guestVisitorId = guestVisitorId;
    room.guestSocketId = guestSocketId;
    room.status = RoomStatus.PLAYING;
    await room.save();

    this.activeRooms.set(guestSocketId, room.code);
    console.log(`🎮 ${guestVisitorId} a rejoint la room ${room.code}`);

    // Émettre l'événement pour démarrer le match
    this.emit("roomReady", room);

    return { success: true, room };
  }

  /**
   * Récupérer une room par son code
   */
  async getRoom(code: string): Promise<IPrivateRoom | null> {
    return PrivateRoom.findOne({ code });
  }

  /**
   * Récupérer une room par le socketId d'un participant
   */
  async getRoomBySocket(socketId: string): Promise<IPrivateRoom | null> {
    const code = this.activeRooms.get(socketId);
    if (!code) return null;
    return PrivateRoom.findOne({ code });
  }

  /**
   * Mettre à jour le socketId du host (reconnexion)
   */
  async updateHostSocket(
    code: string,
    hostSocketId: string
  ): Promise<IPrivateRoom | null> {
    const room = await PrivateRoom.findOneAndUpdate(
      { code, status: RoomStatus.WAITING },
      { hostSocketId },
      { new: true }
    );
    if (room) {
      this.activeRooms.set(hostSocketId, room.code);
    }
    return room;
  }

  /**
   * Annuler une room (host quitte avant le match)
   */
  async cancelRoom(code: string, hostVisitorId: string): Promise<boolean> {
    const result = await PrivateRoom.findOneAndUpdate(
      { code, hostVisitorId, status: RoomStatus.WAITING },
      { status: RoomStatus.EXPIRED }
    );

    if (result) {
      this.activeRooms.delete(result.hostSocketId || "");
      console.log(`❌ Room ${code} annulée par le host`);
      return true;
    }
    return false;
  }

  /**
   * Marquer une room comme terminée avec l'ID du jeu
   */
  async setGameId(code: string, gameId: string): Promise<void> {
    await PrivateRoom.findOneAndUpdate({ code }, { gameId });
  }

  /**
   * Gérer la déconnexion d'un socket
   */
  handleDisconnect(socketId: string): void {
    this.activeRooms.delete(socketId);
  }

  /**
   * Nettoyer les rooms expirées (appelé périodiquement)
   */
  async cleanupExpiredRooms(): Promise<number> {
    const result = await PrivateRoom.updateMany(
      {
        status: RoomStatus.WAITING,
        expiresAt: { $lt: new Date() },
      },
      { status: RoomStatus.EXPIRED }
    );
    return result.modifiedCount;
  }

  /**
   * Obtenir les rooms actives d'un utilisateur
   */
  async getActiveRooms(visitorId: string): Promise<IPrivateRoom[]> {
    return PrivateRoom.find({
      $or: [{ hostVisitorId: visitorId }, { guestVisitorId: visitorId }],
      status: { $in: [RoomStatus.WAITING, RoomStatus.PLAYING] },
    }).sort({ createdAt: -1 });
  }
}
