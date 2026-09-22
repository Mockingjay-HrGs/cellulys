import { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { getDatabase } from "../database.js";

interface JwtPayload {
    sub: string;
    username: string;
    role: string;
}

export async function playerRoutes(app: FastifyInstance) {
    app.get(
        "/me",
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
            const user = request.user as JwtPayload;

            const db = getDatabase();

            const player = await db.collection("players").findOne(
                {
                    _id: new ObjectId(user.sub)
                },
                {
                    projection: {
                        passwordHash: 0
                    }
                }
            );

            if (!player) {
                return reply.status(404).send({
                    type: "about:blank",
                    title: "Not Found",
                    status: 404,
                    detail: "Player not found"
                });
            }

            return reply.status(200).send({
                id: player._id,
                username: player.username,
                role: player.role,
                gems: player.gems,
                ownedSkins: player.ownedSkins,
                equippedSkin: player.equippedSkin,
                stats: player.stats
            });
        }
    );
}