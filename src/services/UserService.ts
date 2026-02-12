import {
  User,
  IUser,
  AVATARS,
  getAvatarPath,
  isValidAvatarId,
  getRandomAvatar,
} from "../models/User";

// ─── Public Profile (envoyé au client) ─────────────────────────────────
export interface UserProfile {
  visitorId: string;
  username: string;
  avatarId: string; // ID de l'avatar
  avatarPath: string; // Chemin de l'image
  stats: {
    matchesPlayed: number;
    matchesWon: number;
    roundsPlayed: number;
    roundsWon: number;
    winStreak: number;
    bestWinStreak: number;
  };
  winRate: number;
}

// ─── Leaderboard Entry ─────────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatarId: string;
  avatarPath: string;
  matchesWon: number;
  matchesPlayed: number;
  winRate: number;
}

export class UserService {
  private static instance: UserService;

  private constructor() {}

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Trouve ou crée un utilisateur basé sur son visitorId (stocké en localStorage côté client)
   */
  async findOrCreateUser(visitorId: string, username?: string): Promise<IUser> {
    let user = await User.findOne({ visitorId });

    if (!user) {
      const randomAvatar = getRandomAvatar();
      user = await User.create({
        visitorId,
        username: username || this.generateUsername(),
        avatarId: randomAvatar.id,
      });
      console.log(`👤 Nouvel utilisateur créé: ${user.username}`);
    } else {
      // Mettre à jour lastSeenAt
      user.lastSeenAt = new Date();
      await user.save();
    }

    return user;
  }

  /**
   * Met à jour le profil d'un utilisateur
   */
  async updateProfile(
    visitorId: string,
    updates: { username?: string; avatarId?: string }
  ): Promise<IUser | null> {
    const updateData: Partial<IUser> = {};

    if (updates.username) {
      // Sanitize username
      updateData.username = updates.username.trim().slice(0, 20);
    }

    if (updates.avatarId) {
      // Validate avatar ID
      if (isValidAvatarId(updates.avatarId)) {
        updateData.avatarId = updates.avatarId;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return this.getUserByVisitorId(visitorId);
    }

    return User.findOneAndUpdate({ visitorId }, updateData, { new: true });
  }

  /**
   * Récupère un utilisateur par son ID MongoDB
   */
  async getUserById(userId: string): Promise<IUser | null> {
    return User.findById(userId);
  }

  /**
   * Récupère un utilisateur par son visitorId
   */
  async getUserByVisitorId(visitorId: string): Promise<IUser | null> {
    return User.findOne({ visitorId });
  }

  /**
   * Enregistre le résultat d'un match
   */
  async recordMatchResult(
    visitorId: string,
    won: boolean,
    roundsWon: number,
    totalRounds: number
  ): Promise<IUser | null> {
    const user = await User.findOne({ visitorId });
    if (!user) return null;

    await user.recordMatchResult(won, roundsWon, totalRounds);
    console.log(
      `📊 Stats mises à jour pour ${user.username}: ${
        won ? "Victoire" : "Défaite"
      }`
    );
    return user;
  }

  /**
   * Récupère le leaderboard (top joueurs par victoires)
   */
  async getLeaderboard(limit: number = 20): Promise<LeaderboardEntry[]> {
    const users = await User.find({ "stats.matchesPlayed": { $gt: 0 } })
      .sort({ "stats.matchesWon": -1 })
      .limit(limit)
      .lean();

    return users.map((user, index) => ({
      rank: index + 1,
      username: user.username,
      avatarId: user.avatarId,
      avatarPath: getAvatarPath(user.avatarId),
      matchesWon: user.stats.matchesWon,
      matchesPlayed: user.stats.matchesPlayed,
      winRate:
        user.stats.matchesPlayed > 0
          ? Math.round((user.stats.matchesWon / user.stats.matchesPlayed) * 100)
          : 0,
    }));
  }

  /**
   * Convertit un IUser en profil public
   */
  toPublicProfile(user: IUser): UserProfile {
    return {
      visitorId: user.visitorId,
      username: user.username,
      avatarId: user.avatarId,
      avatarPath: getAvatarPath(user.avatarId),
      stats: user.stats,
      winRate: user.winRate,
    };
  }

  // ─── Get Available Avatars ───────────────────────────────────────────
  getAvailableAvatars(): typeof AVATARS {
    return AVATARS;
  }

  // ─── Generate Random Username ────────────────────────────────────────
  private generateUsername(): string {
    const adjectives = ["Rapide", "Rusé", "Fort", "Malin", "Brave", "Sage"];
    const nouns = ["Joueur", "As", "Champion", "Pro", "Expert", "Maître"];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);
    return `${adj}${noun}${num}`;
  }
}
