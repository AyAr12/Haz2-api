import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import type { Request, Response } from "express";

import { GameService } from "./services/GameService";
import {
  MatchmakingService,
  QueuedPlayer,
} from "./services/MatchmakingService";
import { CardType, GameMode, GameStatus } from "./types";
import { UserService } from "./services/UserService";
import { PrivateRoomService } from "./services/PrivateRoomService";
import { AVATARS, isValidAvatarId } from "./models/User";
import { connectDatabase } from "./config/database";

const allowedOrigin = process.env.FRONTEND_BASE_URL || "*";
// const allowedOrigin = "http://localhost:5173";

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
  },
});

const gameService = GameService.getInstance();
const matchmaking = MatchmakingService.getInstance();
const userService = UserService.getInstance();
const privateRoomService = PrivateRoomService.getInstance();

// const FRONTEND_BASE_URL =
//   process.env.FRONTEND_BASE_URL || "http://localhost:5173";
const FRONTEND_BASE_URL = "http://localhost:5173";

// Helpers
function broadcastGameState(gameId: string, game: any) {
  game.players.forEach((player: any) => {
    const state = gameService.getGameState(gameId, player.id);

    io.to(player.socketId).emit("gameUpdate", state);
  });
}

function checkRoundOrMatchOver(gameId: string, game: any) {
  if (game.status === GameStatus.ROUND_OVER) {
    // Notify round over
    game.players.forEach((player: any) => {
      const isWinner = game.roundWinner === player.id;
      const playerIdx = game.players[0].id === player.id ? 0 : 1;
      io.to(player.socketId).emit("roundOver", {
        roundWinner: game.roundWinner,
        isWinner,
        roundNumber: game.currentRound - 1, // Round that just ended
        scores: game.scores,
        yourScore: game.scores[playerIdx],
        opponentScore: game.scores[playerIdx === 0 ? 1 : 0],
      });
    });

    // Schedule next round
    gameService.scheduleNextRound(gameId, () => {
      const handler = createTimeoutHandler(gameId);
      const updatedGame = gameService.startNextRound(gameId, handler);
      if (updatedGame) {
        // Notify round start
        updatedGame.players.forEach((player: any) => {
          io.to(player.socketId).emit("roundStart", {
            roundNumber: updatedGame.currentRound,
          });
        });
        broadcastGameState(gameId, updatedGame);
      }
    });
  }

  if (
    game.status === GameStatus.MATCH_OVER ||
    game.status === GameStatus.ABANDONED
  ) {
    const reason =
      game.status === GameStatus.ABANDONED
        ? "opponent_disconnected"
        : "match_won";
    const totalRounds = game.scores[0] + game.scores[1];

    if (game.status === GameStatus.MATCH_OVER) {
      const winnerIdx = game.matchWinner === game.players[0].id ? 0 : 1;
      const loserIdx = winnerIdx === 0 ? 1 : 0;
      userService.recordMatchResult(
        game.players[winnerIdx].id,
        true,
        game.scores[winnerIdx],
        totalRounds
      );
      userService.recordMatchResult(
        game.players[loserIdx].id,
        false,
        game.scores[loserIdx],
        totalRounds
      );
    }
    game.players.forEach((player: any) => {
      const playerIdx = game.players[0].id === player.id ? 0 : 1;
      io.to(player.socketId).emit("matchOver", {
        matchWinner: game.matchWinner,
        isWinner: player.id === game.matchWinner,
        finalScore: game.scores,
        yourScore: game.scores[playerIdx],
        opponentScore: game.scores[playerIdx === 0 ? 1 : 0],
        reason,
      });
    });
    setTimeout(() => gameService.removeGame(gameId), 5000);
  }
}

function createTimeoutHandler(gameId: string) {
  return () => {
    const game = gameService.getGame(gameId);
    if (game) {
      broadcastGameState(gameId, game);
      checkRoundOrMatchOver(gameId, game);
    }
  };
}

/**
 * Gère le forfait d'un joueur (déconnexion ou abandon volontaire)
 * Donne la victoire à l'adversaire
 */
function handlePlayerForfeit(
  gameId: string,
  visitorIdOrSocketId: string,
  isSocketId: boolean = false
) {
  const game = gameService.getGame(gameId);
  if (
    !game ||
    game.status === GameStatus.MATCH_OVER ||
    game.status === GameStatus.ABANDONED
  ) {
    return null;
  }

  // Trouver le joueur qui abandonne et l'adversaire
  let forfeitingPlayer: any;
  let opponent: any;

  if (isSocketId) {
    forfeitingPlayer = game.players.find(
      (p: any) => p.socketId === visitorIdOrSocketId
    );
  } else {
    forfeitingPlayer = game.players.find(
      (p: any) => p.id === visitorIdOrSocketId
    );
  }

  if (!forfeitingPlayer) return null;

  opponent = game.players.find((p: any) => p.id !== forfeitingPlayer.id);
  if (!opponent) return null;

  // Marquer le match comme abandonné et définir le gagnant
  game.status = GameStatus.ABANDONED;
  game.matchWinner = opponent.id;

  const opponentIdx = game.players[0].id === opponent.id ? 0 : 1;
  const forfeitingIdx = opponentIdx === 0 ? 1 : 0;

  // Enregistrer le résultat
  const totalRounds = game.scores[0] + game.scores[1] || 1;
  userService.recordMatchResult(
    opponent.id,
    true,
    game.scores[opponentIdx],
    totalRounds
  );
  userService.recordMatchResult(
    forfeitingPlayer.id,
    false,
    game.scores[forfeitingIdx],
    totalRounds
  );

  // Créer le résultat du match pour l'adversaire
  const matchResult = {
    matchWinner: opponent.id,
    isWinner: true,
    finalScore: game.scores,
    yourScore: game.scores[opponentIdx],
    opponentScore: game.scores[forfeitingIdx],
    reason: "opponent_disconnected" as const,
  };

  return {
    opponent,
    forfeitingPlayer,
    matchResult,
    game,
  };
}

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    activeGames: gameService.getActiveGamesCount(),
    queueSize: matchmaking.getQueueSize(),
  });
});

app.get("/api/avatars", (_req: Request, res: Response) =>
  res.json({
    avatars: AVATARS.map((a) => ({
      id: a.id,
      path: a.path,
      name: a.name,
    })),
  })
);

app.get("/api/leaderboard", async (_req: Request, res: Response) => {
  try {
    const leaderboard = await userService.getLeaderboard(20);
    res.json({ leaderboard });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/profile/:visitorId", async (req: Request, res: Response) => {
  try {
    const user = await userService.getUserByVisitorId(req.params.visitorId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
    return res.json({ profile: userService.toPublicProfile(user) });
  } catch {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /api/profile/:visitorId - Mettre à jour le profil ─────────────
app.put("/api/profile/:visitorId", async (req, res) => {
  try {
    const { username, avatarId } = req.body;

    // Validation
    if (avatarId && !isValidAvatarId(avatarId)) {
      return res.status(400).json({ error: "Avatar invalide" });
    }

    const user = await userService.updateProfile(req.params.visitorId, {
      username,
      avatarId,
    });

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    return res.json({ profile: userService.toPublicProfile(user) });
  } catch {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/room/:code", async (req: Request, res: Response) => {
  try {
    const room = await privateRoomService.getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Room introuvable" });
    const host = await userService.getUserByVisitorId(room.hostVisitorId);
    return res.json({
      code: room.code,
      status: room.status,
      hostUsername: host?.username || "Joueur",
      expiresAt: room.expiresAt.getTime(),
    });
  } catch {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Socket.IO ──────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`🔌 Client connecté: ${socket.id}`);

  socket.on(
    "authenticate",
    async (data: { visitorId: string; username?: string }) => {
      try {
        const user = await userService.findOrCreateUser(
          data.visitorId,
          data.username
        );
        gameService.registerSocket(socket.id, data.visitorId);
        socket.emit("profileLoaded", userService.toPublicProfile(user));
      } catch {
        socket.emit("error", { message: "Erreur d'authentification" });
      }
    }
  );

  socket.on(
    "updateProfile",
    async (data: {
      visitorId: string;
      username?: string;
      avatarId?: string;
    }) => {
      try {
        const user = await userService.updateProfile(data.visitorId, {
          username: data.username,
          avatarId: data.avatarId,
        });
        if (user)
          socket.emit("profileUpdated", userService.toPublicProfile(user));
      } catch {
        socket.emit("error", { message: "Erreur de mise à jour" });
      }
    }
  );

  socket.on("findMatch", async (data: { visitorId: string }) => {
    try {
      const user = await userService.getUserByVisitorId(data.visitorId);
      if (!user) {
        socket.emit("error", { message: "Utilisateur non trouvé" });
        return;
      }
      gameService.registerSocket(socket.id, data.visitorId);
      matchmaking.addToQueue(
        data.visitorId,
        socket.id,
        user.username,
        user.avatarId
      );
      socket.emit("queueJoined", {
        message: "Recherche d'un adversaire...",
        queueSize: matchmaking.getQueueSize(),
      });
    } catch {
      socket.emit("error", { message: "Erreur" });
    }
  });

  socket.on("cancelSearch", (data: { visitorId: string }) => {
    matchmaking.removeFromQueue(data.visitorId);
    socket.emit("searchCancelled", { message: "Recherche annulée" });
  });

  socket.on("createPrivateRoom", async (data: { visitorId: string }) => {
    try {
      const user = await userService.getUserByVisitorId(data.visitorId);
      if (!user) {
        socket.emit("error", { message: "Utilisateur non trouvé" });
        return;
      }
      const room = await privateRoomService.createRoom(
        data.visitorId,
        socket.id
      );
      const shareUrl = `${FRONTEND_BASE_URL}/join/${room.code}`;
      socket.emit("roomCreated", {
        code: room.code,
        status: room.status,
        hostUsername: user.username,
        expiresAt: room.expiresAt.getTime(),
        shareUrl,
      });
      socket.emit("waitingForOpponent", { roomCode: room.code, shareUrl });
    } catch {
      socket.emit("error", { message: "Erreur création room" });
    }
  });

  socket.on(
    "joinPrivateRoom",
    async (data: { visitorId: string; code: string }) => {
      try {
        const user = await userService.getUserByVisitorId(data.visitorId);
        if (!user) {
          socket.emit("error", { message: "Utilisateur non trouvé" });
          return;
        }
        const result = await privateRoomService.joinRoom(
          data.code,
          data.visitorId,
          socket.id
        );
        if (!result.success) {
          socket.emit("error", { message: result.message });
          return;
        }
        socket.emit("roomJoined", {
          message: "Room rejointe",
          roomCode: data.code,
        });
      } catch {
        socket.emit("error", { message: "Erreur connexion room" });
      }
    }
  );

  socket.on(
    "cancelPrivateRoom",
    async (data: { visitorId: string; code: string }) => {
      const cancelled = await privateRoomService.cancelRoom(
        data.code,
        data.visitorId
      );
      if (cancelled) socket.emit("roomCancelled", { message: "Room annulée" });
    }
  );

  socket.on(
    "playCard",
    (data: {
      gameId: string;
      playerId: string;
      cardId: string;
      newType?: CardType;
    }) => {
      const handler = createTimeoutHandler(data.gameId);
      const result = gameService.playCard(
        data.gameId,
        data.playerId,
        data.cardId,
        data.newType,
        handler
      );
      if (result.success && result.game) {
        broadcastGameState(data.gameId, result.game);
        checkRoundOrMatchOver(data.gameId, result.game);
      } else socket.emit("error", { message: result.message });
    }
  );

  socket.on(
    "counterDecision",
    (data: {
      gameId: string;
      playerId: string;
      willCounter: boolean;
      cardId?: string;
    }) => {
      const handler = createTimeoutHandler(data.gameId);
      const result = gameService.handleCounterDecision(
        data.gameId,
        data.playerId,
        data.willCounter,
        data.cardId,
        handler
      );
      if (result.success && result.game) {
        broadcastGameState(data.gameId, result.game);
        checkRoundOrMatchOver(data.gameId, result.game);
      } else socket.emit("error", { message: result.message });
    }
  );

  socket.on("drawCard", (data: { gameId: string; playerId: string }) => {
    const handler = createTimeoutHandler(data.gameId);
    const result = gameService.drawCard(data.gameId, data.playerId, handler);
    if (result.success && result.game)
      broadcastGameState(data.gameId, result.game);
    else socket.emit("error", { message: result.message });
  });

  // ─── Abandon volontaire (bouton Quitter) ────────────────────────────────
  socket.on("leaveGame", (data: { gameId: string; playerId: string }) => {
    console.log(`🚪 Joueur ${data.playerId} quitte le match ${data.gameId}`);

    const result = handlePlayerForfeit(data.gameId, data.playerId, false);

    if (result) {
      const { opponent, matchResult } = result;

      // Notifier l'adversaire de la victoire par forfait
      io.to(opponent.socketId).emit("opponentDisconnected", {
        message: "Votre adversaire a quitté la partie",
        matchResult,
      });

      // Confirmer au joueur qui quitte
      socket.emit("gameLeft", { message: "Vous avez quitté la partie" });

      // Supprimer le match après un délai
      setTimeout(() => gameService.removeGame(data.gameId), 5000);
    }
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Client déconnecté: ${socket.id}`);
    const playerId = gameService.getPlayerIdBySocket(socket.id);
    if (playerId) matchmaking.removeFromQueue(playerId);
    privateRoomService.handleDisconnect(socket.id);

    const disconnectResult = gameService.handlePlayerDisconnect(socket.id);
    if (disconnectResult) {
      const { opponentSocketId, game, gameId, disconnectedPlayerId } =
        disconnectResult;
      const opponentIdx = game.players[0].id === disconnectedPlayerId ? 1 : 0;
      const forfeitingIdx = opponentIdx === 0 ? 1 : 0;

      const matchResult = {
        matchWinner: game.matchWinner,
        isWinner: true,
        finalScore: game.scores,
        yourScore: game.scores[opponentIdx],
        opponentScore: game.scores[forfeitingIdx],
        reason: "opponent_disconnected" as const,
      };

      // Notifier l'adversaire avec le matchResult
      io.to(opponentSocketId).emit("opponentDisconnected", {
        message: "Votre adversaire s'est déconnecté",
        matchResult,
      });
      userService.recordMatchResult(
        game.players[opponentIdx].id,
        true,
        game.scores[opponentIdx],
        game.scores[0] + game.scores[1] || 1
      );
      setTimeout(() => gameService.removeGame(gameId), 5000);
    }
    gameService.unregisterSocket(socket.id);
    matchmaking.removeFromQueueBySocket(socket.id);
  });
});

// ─── Events ─────────────────────────────────────────────────────────

matchmaking.on(
  "matchFound",
  async (player1: QueuedPlayer, player2: QueuedPlayer) => {
    try {
      const user1 = await userService.getUserByVisitorId(player1.visitorId);
      const user2 = await userService.getUserByVisitorId(player2.visitorId);
      if (!user1 || !user2) return;

      const game = gameService.createMatch(
        player1.visitorId,
        player1.socketId,
        user1.username,
        user1.avatarId, // ✅ FIX
        player2.visitorId,
        player2.socketId,
        user2.username,
        user2.avatarId, // ✅ FIX
        GameMode.RANDOM
      );
      // ✅ FIX: Initialiser le timer de tour côté serveur dès le début du match
      const handler = createTimeoutHandler(game.id);
      gameService.initializeTurnTimer(game.id, handler);

      io.to(player1.socketId).emit("matchFound", {
        gameId: game.id,
        opponentId: player2.visitorId,
        gameState: gameService.getGameState(game.id, player1.visitorId),
      });
      io.to(player2.socketId).emit("matchFound", {
        gameId: game.id,
        opponentId: player1.visitorId,
        gameState: gameService.getGameState(game.id, player2.visitorId),
      });
    } catch (e) {
      console.error("Erreur matchFound:", e);
    }
  }
);

privateRoomService.on("roomReady", async (room) => {
  try {
    const host = await userService.getUserByVisitorId(room.hostVisitorId);
    const guest = await userService.getUserByVisitorId(room.guestVisitorId!);
    if (!host || !guest) return;

    const game = gameService.createMatch(
      room.hostVisitorId,
      room.hostSocketId!,
      host.username,
      host.avatarId,
      room.guestVisitorId!,
      room.guestSocketId!,
      guest.username,
      guest.avatarId,
      GameMode.PRIVATE,
      room.code
    );
    await privateRoomService.setGameId(room.code, game.id);

    // ✅ FIX: Initialiser le timer de tour côté serveur dès le début du match
    const handler = createTimeoutHandler(game.id);
    gameService.initializeTurnTimer(game.id, handler);

    io.to(room.hostSocketId!).emit("matchFound", {
      gameId: game.id,
      opponentId: room.guestVisitorId,
      gameState: gameService.getGameState(game.id, room.hostVisitorId),
    });
    io.to(room.guestSocketId!).emit("matchFound", {
      gameId: game.id,
      opponentId: room.hostVisitorId,
      gameState: gameService.getGameState(game.id, room.guestVisitorId!),
    });
  } catch (e) {
    console.error("Erreur roomReady:", e);
  }
});

// ─── Start Server ───────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectDatabase();
  httpServer.listen(PORT, () => {
    console.log(`🎮 Serveur démarré sur le port ${PORT}`);
    console.log(`📊 Mode: Best of 9 (Premier à 5 manches)`);
  });
}

startServer();

export { app, httpServer, io };
