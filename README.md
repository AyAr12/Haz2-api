# 🎴 Jeu de Cartes Multiplayer 1vs1

Serveur de jeu de cartes multijoueur en temps réel avec Express, TypeScript et Socket.IO.

## 📋 Règles du Jeu

### Informations de base
- **Nombre de cartes**: 40
- **Numéros**: 1, 2, 3, 4, 5, 6, 7, 10, 11, 12
- **Types**: monnaie, épée, plat, bâton
- **Cartes distribuées au début**: 5 par joueur
- **Objectif**: Poser toutes ses cartes en premier

### Règles de jeu
- Une carte peut être posée si elle correspond au **numéro OU au type** de la dernière carte posée
- Chaque joueur pose **1 carte par tour**
- Si aucune carte ne peut être jouée, le joueur **pioche une carte**

### 🃏 Cartes Spéciales

#### Numéro 1 - Blocage
- Bloque l'adversaire de jouer son tour
- Peut être contré par un autre 1
- Les contres peuvent s'enchaîner

#### Numéro 2 - Pioche +2
- Oblige l'adversaire à piocher 2 cartes
- Peut être contré par un autre 2
- Les 2 s'accumulent (2+2=4, 4+2=6, etc.)
- Le dernier qui ne peut pas contrer pioche le cumul

#### Numéro 7 - Changement de type
- Permet au joueur de changer le type actif
- Peut être contré par un autre 7
- Les contres peuvent s'enchaîner

## 🏗️ Architecture

```
card-game/
├── src/
│   ├── models/          # Modèles de données
│   │   ├── Card.ts      # Carte et génération du deck
│   │   ├── Player.ts    # Joueur
│   │   └── Game.ts      # Logique du jeu
│   ├── services/        # Services métier
│   │   ├── GameService.ts        # Gestion des parties
│   │   └── MatchmakingService.ts # Matchmaking
│   ├── types/           # Définitions TypeScript
│   │   └── index.ts
│   └── server.ts        # Point d'entrée
├── package.json
└── tsconfig.json
```

## 🚀 Installation

```bash
# Installer les dépendances
npm install

# Développement avec hot reload
npm run dev

# Build pour production
npm run build

# Démarrer en production
npm start
```

## 🔌 Événements Socket.IO

### Client → Serveur

#### `findMatch`
Rechercher un adversaire
```typescript
socket.emit('findMatch', { playerId: 'player123' });
```

#### `cancelSearch`
Annuler la recherche
```typescript
socket.emit('cancelSearch', { playerId: 'player123' });
```

#### `playCard`
Jouer une carte
```typescript
socket.emit('playCard', {
  gameId: 'game123',
  playerId: 'player123',
  cardId: 'card456',
  newType?: 'monnaie' // Optionnel, pour le numéro 7
});
```

#### `drawCard`
Piocher une carte
```typescript
socket.emit('drawCard', {
  gameId: 'game123',
  playerId: 'player123'
});
```

### Serveur → Client

#### `queueJoined`
Confirmation d'entrée dans la queue
```typescript
{
  message: 'Recherche d\'un adversaire...',
  queueSize: 1
}
```

#### `matchFound`
Match trouvé
```typescript
{
  gameId: 'game123',
  opponentId: 'player456',
  gameState: {
    gameId: 'game123',
    yourHand: [...],
    opponentCardCount: 5,
    lastCard: {...},
    currentType: 'monnaie',
    isYourTurn: true,
    deckCount: 30,
    discardPileCount: 1,
    pendingEffect?: {...}
  }
}
```

#### `gameUpdate`
Mise à jour de l'état du jeu
```typescript
{
  gameId: 'game123',
  yourHand: [...],
  opponentCardCount: 4,
  lastCard: {...},
  currentType: 'épée',
  isYourTurn: false,
  deckCount: 29,
  discardPileCount: 2,
  pendingEffect?: {
    type: 'draw2',
    canCounter: true,
    drawCount: 4
  }
}
```

#### `gameOver`
Fin de partie
```typescript
{
  winner: 'player123',
  isWinner: true
}
```

#### `error`
Erreur
```typescript
{
  message: 'Ce n\'est pas votre tour'
}
```

## 🎮 Flux de jeu

1. **Connexion**: Le client se connecte via Socket.IO
2. **Matchmaking**: Le joueur clique sur "Trouver un adversaire"
3. **Match trouvé**: Dès qu'un 2ème joueur arrive, le match démarre
4. **Tour de jeu**: Les joueurs alternent en jouant des cartes ou en piochant
5. **Effets spéciaux**: Les cartes 1, 2, 7 déclenchent des effets
6. **Victoire**: Le premier à poser toutes ses cartes gagne

## 🔒 Sécurité Anti-Triche

Le serveur est l'autorité centrale:
- ✅ Valide chaque coup
- ✅ Vérifie que c'est le bon tour
- ✅ Vérifie que le joueur possède la carte
- ✅ Vérifie que la carte peut être jouée
- ✅ Gère la distribution aléatoire
- ✅ Les joueurs ne voient que leur main

## 📊 API REST

### GET `/health`
Statut du serveur
```json
{
  "status": "ok",
  "activeGames": 5,
  "queueSize": 2
}
```

## 🧪 Tests

```bash
# À implémenter
npm test
```

## 📝 Variables d'environnement

```env
PORT=3000
NODE_ENV=development
```

## 🛠️ Technologies

- **Express**: Framework web
- **Socket.IO**: Communication temps réel
- **TypeScript**: Typage statique
- **UUID**: Génération d'identifiants uniques

## 📄 License

MIT