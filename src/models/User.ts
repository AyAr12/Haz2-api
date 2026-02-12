import mongoose, { Schema, Document } from "mongoose";

// ─── Available Avatars ─────────────────────────────────────────────────
// Liste des avatars disponibles (images dans /public/images/avatars/)
export const AVATARS = [
  { id: "avatar_1", path: "/images/avatars/avatar_1.png", name: "Joueur 1" },
  { id: "avatar_2", path: "/images/avatars/avatar_2.png", name: "Joueur 2" },
  { id: "avatar_3", path: "/images/avatars/avatar_3.png", name: "Joueur 3" },
  { id: "avatar_4", path: "/images/avatars/avatar_4.png", name: "Joueur 4" },
  { id: "avatar_5", path: "/images/avatars/avatar_5.png", name: "Joueur 5" },
  { id: "avatar_6", path: "/images/avatars/avatar_6.png", name: "Joueur 6" },
  { id: "avatar_7", path: "/images/avatars/avatar_7.png", name: "Joueur 7" },
  { id: "avatar_8", path: "/images/avatars/avatar_8.png", name: "Joueur 8" },
  { id: "avatar_9", path: "/images/avatars/avatar_9.png", name: "Joueur 9" },
  { id: "avatar_10", path: "/images/avatars/avatar_10.png", name: "Joueur 10" },
  { id: "avatar_11", path: "/images/avatars/avatar_11.png", name: "Joueur 11" },
  { id: "avatar_12", path: "/images/avatars/avatar_12.png", name: "Joueur 12" },
];

// Helper pour obtenir le chemin d'un avatar par son ID
export function getAvatarPath(avatarId: string): string {
  const avatar = AVATARS.find((a) => a.id === avatarId);
  return avatar?.path || AVATARS[0].path;
}

// Helper pour obtenir un avatar aléatoire
export function getRandomAvatar(): { id: string; path: string } {
  const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  return { id: avatar.id, path: avatar.path };
}

// Helper pour valider si un avatar ID existe
export function isValidAvatarId(avatarId: string): boolean {
  return AVATARS.some((a) => a.id === avatarId);
}

export interface IUserStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  roundsPlayed: number;
  roundsWon: number;
  winStreak: number;
  bestWinStreak: number;
}

export interface IUser extends Document {
  visitorId: string; // ID unique généré côté client (localStorage)
  username: string;
  avatarId: string;
  stats: IUserStats;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  // Méthodes
  recordMatchResult(
    won: boolean,
    roundsWon: number,
    roundsPlayed: number
  ): Promise<IUser>;
  winRate: number;
}

const UserStatsSchema = new Schema<IUserStats>(
  {
    matchesPlayed: { type: Number, default: 0 },
    matchesWon: { type: Number, default: 0 },
    matchesLost: { type: Number, default: 0 },
    roundsPlayed: { type: Number, default: 0 },
    roundsWon: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    bestWinStreak: { type: Number, default: 0 },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    visitorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 20,
      trim: true,
    },
    avatarId: {
      type: String,
      required: true,
      default: () => getRandomAvatar().id,
      validate: {
        validator: (v: string) => isValidAvatarId(v),
        message: "Avatar invalide"
      }
    },
    stats: {
      type: UserStatsSchema,
      default: () => ({}),
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Méthodes d'instance
UserSchema.methods.recordMatchResult = async function (
  won: boolean,
  roundsWon: number,
  roundsPlayed: number
): Promise<IUser> {
  this.stats.matchesPlayed++;
  this.stats.roundsPlayed += roundsPlayed;
  this.stats.roundsWon += roundsWon;

  if (won) {
    this.stats.matchesWon++;
    this.stats.winStreak++;
    if (this.stats.winStreak > this.stats.bestWinStreak) {
      this.stats.bestWinStreak = this.stats.winStreak;
    }
  } else {
    this.stats.matchesLost++;
    this.stats.winStreak = 0;
  }

  return this.save();
};

// Virtuals
UserSchema.virtual("winRate").get(function () {
  if (this.stats.matchesPlayed === 0) return 0;
  return Math.round((this.stats.matchesWon / this.stats.matchesPlayed) * 100);
});

UserSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    const { _id, __v, ...rest } = ret;
    return { id: _id, ...rest };
  },
});

export const User = mongoose.model<IUser>("User", UserSchema);
