import mongoose, { Schema, Document } from "mongoose";
import { nanoid } from "nanoid";

export enum RoomStatus {
  WAITING = "waiting", // En attente d'un adversaire
  PLAYING = "playing", // Partie en cours
  FINISHED = "finished", // Partie terminée
  EXPIRED = "expired", // Lien expiré
}

export interface IPrivateRoom extends Document {
  code: string; // Code court pour le lien (ex: "abc123")
  hostVisitorId: string; // visitorId du créateur
  hostSocketId?: string; // socketId actuel du host
  guestVisitorId?: string; // visitorId de l'invité (une fois qu'il rejoint)
  guestSocketId?: string; // socketId actuel du guest
  gameId?: string; // ID de la partie une fois créée
  status: RoomStatus;
  createdAt: Date;
  expiresAt: Date;
  isExpired(): boolean; // Méthode pour vérifier si la room est expirée
}

const PrivateRoomSchema = new Schema<IPrivateRoom>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => nanoid(8), // Code de 8 caractères
    },
    hostVisitorId: {
      type: String,
      required: true,
      index: true,
    },
    hostSocketId: {
      type: String,
    },
    guestVisitorId: {
      type: String,
    },
    guestSocketId: {
      type: String,
    },
    gameId: {
      type: String,
    },
    status: {
      type: String,
      enum: Object.values(RoomStatus),
      default: RoomStatus.WAITING,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000), // Expire dans 30 minutes
      index: { expires: 0 }, // TTL index - supprime automatiquement les rooms expirées
    },
  },
  {
    timestamps: true,
  }
);

// Méthodes d'instance
PrivateRoomSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

PrivateRoomSchema.methods.canJoin = function (visitorId: string): boolean {
  // Le host ne peut pas rejoindre sa propre room comme guest
  if (this.hostVisitorId === visitorId) return false;
  // La room doit être en attente
  if (this.status !== RoomStatus.WAITING) return false;
  // Ne doit pas être expirée
  if (this.isExpired()) return false;
  return true;
};

// JSON transform
// PrivateRoomSchema.set("toJSON", {
//   virtuals: true,
//   transform: (_doc, ret) => {
//     ret.id = ret._id;
//     delete ret._id;
//     delete ret.__v;
//     return ret;
//   },
// });

PrivateRoomSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    const { _id, __v, ...rest } = ret;
    return { id: _id, ...rest };
  },
});

export const PrivateRoom = mongoose.model<IPrivateRoom>(
  "PrivateRoom",
  PrivateRoomSchema
);
