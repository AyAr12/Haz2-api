import { User, IUser, AVATARS } from "../models/User";

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
      // Générer un username par défaut si non fourni
      const defaultUsername =
        username || `Joueur${Math.floor(Math.random() * 10000)}`;
      const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];

      user = await User.create({
        visitorId,
        username: defaultUsername,
        avatar: randomAvatar,
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
    updates: { username?: string; avatar?: string }
  ): Promise<IUser | null> {
    const user = await User.findOne({ visitorId });
    if (!user) return null;

    if (
      updates.username &&
      updates.username.length >= 2 &&
      updates.username.length <= 20
    ) {
      user.username = updates.username.trim();
    }

    if (updates.avatar && AVATARS.includes(updates.avatar)) {
      user.avatar = updates.avatar;
    }

    await user.save();
    console.log(`👤 Profil mis à jour: ${user.username}`);
    return user;
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
  async getLeaderboard(limit: number = 10): Promise<IUser[]> {
    return User.find({ "stats.matchesPlayed": { $gte: 5 } })
      .sort({ "stats.matchesWon": -1 })
      .limit(limit)
      .select("username avatar stats");
  }

  /**
   * Liste des avatars disponibles
   */
  getAvailableAvatars(): string[] {
    return AVATARS;
  }

  /**
   * Convertit un IUser en profil public
   */
  toPublicProfile(user: IUser): {
    id: string;
    username: string;
    avatar: string;
    stats: typeof user.stats;
    winRate: number;
  } {
    return {
      id: user._id.toString(),
      username: user.username,
      avatar: user.avatar,
      stats: user.stats,
      winRate: user.winRate,
    };
  }
}
