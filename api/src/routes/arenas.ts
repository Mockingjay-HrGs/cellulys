import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "../database.js";

interface JwtPayload {
    sub: string;
    username: string;
    role: string;
}

interface JoinParams {
    id: string;
}

export async function arenaRoutes(app: FastifyInstance) {

    // =========================
    // LISTE DES ARENES
    // =========================

    app.get("/arenas", async (_request, reply) => {
        const db = getDatabase();

        const arenas = await db
            .collection("arenas")
            .find({})
            .sort({ _id: 1 })
            .toArray();

        return reply.status(200).send({
            arenas: arenas.map((arena) => ({
                id: arena._id,
                instance: arena.instance,
                status: arena.status,
                capacity: arena.capacity,
                playerCount: arena.playerCount,
                availableSlots: Math.max(
                    0,
                    arena.capacity - arena.playerCount
                )
            }))
        });
    });

    // =========================
    // REJOINDRE UNE ARENE
    // =========================

    app.post<{ Params: JoinParams }>(
        "/arenas/:id/join",
        {
            onRequest: async (request, reply) => {
                try {
                    await request.jwtVerify();
                } catch {
                    return reply.status(401).send({
                        type: "about:blank",
                        title: "Unauthorized",
                        status: 401,
                        detail: "Invalid or expired token"
                    });
                }
            }
        },
        async (request, reply) => {
            const { id } = request.params;
            const user = request.user as JwtPayload;

            const db = getDatabase();

            const players = db.collection("players");
            const arenas = db.collection("arenas");
            const reservations = db.collection("seat_reservations");

            // Vérifie que le joueur existe et n'est pas banni
            const player = await players.findOne({
                _id: new ObjectId(user.sub)
            });

            if (!player) {
                return reply.status(404).send({
                    type: "about:blank",
                    title: "Not Found",
                    status: 404,
                    detail: "Player not found"
                });
            }

            if (
                player.banned === true ||
                player.banned?.active === true
            ) {
                return reply.status(403).send({
                    type: "about:blank",
                    title: "Forbidden",
                    status: 403,
                    detail: "Player is banned"
                });
            }

            // Vérifie d'abord que l'arène existe
            const existingArena = await arenas.findOne({
                _id: id as any
            });

            if (!existingArena) {
                return reply.status(404).send({
                    type: "about:blank",
                    title: "Not Found",
                    status: 404,
                    detail: "Arena not found"
                });
            }

            /*
             * Réservation atomique de la place.
             *
             * MongoDB incrémente playerCount uniquement si :
             * - l'arène est ouverte
             * - playerCount < capacity
             */
            const arena = await arenas.findOneAndUpdate(
                {
                    _id: id as any,
                    status: "open",
                    $expr: {
                        $lt: ["$playerCount", "$capacity"]
                    }
                },
                {
                    $inc: {
                        playerCount: 1
                    },
                    $set: {
                        updatedAt: new Date()
                    }
                },
                {
                    returnDocument: "after"
                }
            );

            // Plus de place disponible
            if (!arena) {
                return reply.status(409).send({
                    type: "about:blank",
                    title: "Conflict",
                    status: 409,
                    detail: "Arena is full or unavailable"
                });
            }

            const seatToken = randomUUID();

            try {
                await reservations.insertOne({
                    arenaId: id,
                    playerId: new ObjectId(user.sub),
                    token: seatToken,
                    used: false,
                    createdAt: new Date()
                });
            } catch (error) {
                /*
                 * Si la création de la réservation échoue,
                 * on rend la place à l'arène.
                 */
                await arenas.updateOne(
                    {
                        _id: id as any,
                        playerCount: {
                            $gt: 0
                        }
                    },
                    {
                        $inc: {
                            playerCount: -1
                        },
                        $set: {
                            updatedAt: new Date()
                        }
                    }
                );

                throw error;
            }

            // L'arène devient full à 50/50
            if (arena.playerCount >= arena.capacity) {
                await arenas.updateOne(
                    {
                        _id: id as any,
                        playerCount: {
                            $gte: arena.capacity
                        }
                    },
                    {
                        $set: {
                            status: "full",
                            updatedAt: new Date()
                        }
                    }
                );
            }

            return reply.status(201).send({
                arenaId: id,
                instance: arena.instance,
                seatToken,
                expiresIn: 30,
                websocketUrl:
                    `/game/${arena.instance}?seat=${seatToken}`
            });
        }
    );
}