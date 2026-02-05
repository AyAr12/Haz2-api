import mongoose, { Schema, Document } from "mongoose";

// Liste d'avatars prédéfinis
export const AVATARS = [
  "🎴",
  "🃏",
  "👑",
  "⚔️",
  "🛡️",
  "🏆",
  "🎯",
  "🔥",
  "💎",
  "🌟",
  "🦁",
  "🦊",
  "🐺",
  "🦅",
  "🐉",
  "🎭",
];

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
  avatar: string;
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
    avatar: {
      type: String,
      default: "🎴",
      enum: AVATARS,
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

// JSON transform
// UserSchema.set("toJSON", {
//   virtuals: true,
//   transform: (_doc, ret) => {
//     ret.id = ret._id;
//     delete ret._id;
//     delete ret.__v;
//     // On garde visitorId pour usage interne mais on le retire de la réponse publique
//     return ret;
//   },
// });

UserSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    const { _id, __v, ...rest } = ret;
    return { id: _id, ...rest };
  },
});

export const User = mongoose.model<IUser>("User", UserSchema);
