import { ObjectId } from "mongodb";
import { getDatabase } from "../database.js";
import type { GamePlayer } from "./types.js";

/**
 * Enregistre la partie d'un joueur éliminé dans MongoDB Atlas.
 */
export async function saveMatch(
    arenaId: string,
    player: GamePlayer,
    killedBy: string
): Promise<void> {
    const db = getDatabase();

    const endedAt = new Date();

    const survivalSec = Math.floor(
        (endedAt.getTime() - player.startedAt.getTime()) / 1000
    );

    await db.collection("matches").insertOne({
        arenaId,
        playerId: new ObjectId(player.id),
        username: player.username,
        startedAt: player.startedAt,
        endedAt,
        maxMass: player.maxMass,
        kills: player.kills,
        survivalSec,
        killedBy,
        rewardGems: 0
    });
}