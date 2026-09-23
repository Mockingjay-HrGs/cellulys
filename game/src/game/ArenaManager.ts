import { randomUUID } from "crypto";
import type {
    ArenaState,
    GamePlayer
} from "./types.js";

const MAP_WIDTH = 5000;
const MAP_HEIGHT = 5000;
const INITIAL_MASS = 10;
const FOOD_COUNT = 1000;
const FOOD_MASS = 1;

export class ArenaManager {
    private arenas = new Map<string, ArenaState>();

    private generateFood(arena: ArenaState): void {
        for (let i = 0; i < FOOD_COUNT; i++) {
            const foodId = randomUUID();

            arena.food.set(foodId, {
                id: foodId,
                x: Math.random() * MAP_WIDTH,
                y: Math.random() * MAP_HEIGHT,
                mass: FOOD_MASS
            });
        }
    }

    getOrCreateArena(arenaId: string): ArenaState {
        let arena = this.arenas.get(arenaId);

        if (!arena) {
            arena = {
                id: arenaId,
                width: MAP_WIDTH,
                height: MAP_HEIGHT,
                tick: 0,
                players: new Map(),
                food: new Map()
            };

            this.arenas.set(arenaId, arena);
            this.generateFood(arena);

        }

        return arena;
    }

    addPlayer(
        arenaId: string,
        playerId: string,
        username: string
    ): GamePlayer {
        const arena = this.getOrCreateArena(arenaId);

        const player: GamePlayer = {
            id: playerId,
            username,

            cells: [
                {
                    id: randomUUID(),
                    x: Math.random() * MAP_WIDTH,
                    y: Math.random() * MAP_HEIGHT,
                    mass: INITIAL_MASS
                }
            ],

            input: {
                dx: 0,
                dy: 0,
                seq: 0
            },

            connectedAt: Date.now(),
            startedAt: new Date(),
            maxMass: INITIAL_MASS,
            kills: 0
        };


// Ajout du joueur dans l'arène
        arena.players.set(playerId, player);

        return player;
    }

    removePlayer(
        arenaId: string,
        playerId: string
    ): void {
        const arena = this.arenas.get(arenaId);

        if (!arena) {
            return;
        }

        arena.players.delete(playerId);
    }

    getArena(arenaId: string): ArenaState | undefined {
        return this.arenas.get(arenaId);
    }

    getArenas(): IterableIterator<ArenaState> {
        return this.arenas.values();
    }

    getPlayer(arenaId: string, playerId: string): GamePlayer | undefined {
        return this.arenas.get(arenaId)?.players.get(playerId);
    }
}

export const arenaManager = new ArenaManager();