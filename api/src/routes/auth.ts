import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { getDatabase } from "../database.js";

interface AuthBody {
    username: string;
    password: string;
}

export async function authRoutes(app: FastifyInstance) {

    // REGISTER

    app.post<{ Body: AuthBody }>(
        "/register",
        {
            config: {
                rateLimit: {
                    max: 5,
                    timeWindow: "1 minute"
                }
            }
        },
        async (request, reply) => {
            const { username, password } = request.body;

            if (!username || !password) {
                return reply.status(400).send({
                    type: "about:blank",
                    title: "Bad Request",
                    status: 400,
                    detail: "Username and password are required"
                });
            }

            if (username.length < 3 || username.length > 30) {
                return reply.status(400).send({
                    type: "about:blank",
                    title: "Bad Request",
                    status: 400,
                    detail: "Username must contain between 3 and 30 characters"
                });
            }

            if (password.length < 8) {
                return reply.status(400).send({
                    type: "about:blank",
                    title: "Bad Request",
                    status: 400,
                    detail: "Password must contain at least 8 characters"
                });
            }

            const db = getDatabase();
            const players = db.collection("players");

            const existingPlayer = await players.findOne({
                username
            });

            if (existingPlayer) {
                return reply.status(409).send({
                    type: "about:blank",
                    title: "Conflict",
                    status: 409,
                    detail: "Username already exists"
                });
            }

            const passwordHash = await bcrypt.hash(password, 12);

            const player = {
                username,
                passwordHash,
                role: "player",
                gems: 0,
                ownedSkins: [],
                equippedSkin: null,
                banned: false,

                stats: {
                    gamesPlayed: 0,
                    bestScore: 0,
                    totalScore: 0
                },

                createdAt: new Date()
            };

            const result = await players.insertOne(player);

            return reply.status(201).send({
                id: result.insertedId,
                username,
                role: "player",
                gems: 0
            });
        }
    );

    // LOGIN

    app.post<{ Body: AuthBody }>(
        "/login",
        {
            config: {
                rateLimit: {
                    max: 5,
                    timeWindow: "1 minute"
                }
            }
        },
        async (request, reply) => {
            const { username, password } = request.body;

            if (!username || !password) {
                return reply.status(400).send({
                    type: "about:blank",
                    title: "Bad Request",
                    status: 400,
                    detail: "Username and password are required"
                });
            }

            const db = getDatabase();
            const players = db.collection("players");

            const player = await players.findOne({
                username
            });

            // Même erreur si le compte n'existe pas
            // ou si le mot de passe est incorrect
            if (!player) {
                return reply.status(401).send({
                    type: "about:blank",
                    title: "Unauthorized",
                    status: 401,
                    detail: "Invalid username or password"
                });
            }

            const passwordValid = await bcrypt.compare(
                password,
                player.passwordHash
            );

            if (!passwordValid) {
                return reply.status(401).send({
                    type: "about:blank",
                    title: "Unauthorized",
                    status: 401,
                    detail: "Invalid username or password"
                });
            }

            // Vérification du bannissement
            if (player.banned) {
                return reply.status(403).send({
                    type: "about:blank",
                    title: "Forbidden",
                    status: 403,
                    detail: "Player is banned"
                });
            }

            // JWT valable 15 minutes
            const token = app.jwt.sign({
                sub: player._id.toString(),
                username: player.username,
                role: player.role
            });

            return reply.status(200).send({
                token,
                expiresIn: 900,

                player: {
                    id: player._id,
                    username: player.username,
                    role: player.role,
                    gems: player.gems
                }
            });
        }
    );
}