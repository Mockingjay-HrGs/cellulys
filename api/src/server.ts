import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import { playerRoutes } from "./routes/player.js";
import { arenaRoutes } from "./routes/arenas.js";

import { connectDatabase, getDatabase } from "./database.js";
import { authRoutes } from "./routes/auth.js";

const app = Fastify({
    logger: true
});

app.get("/health", async (request, reply) => {
    try {
        const db = getDatabase();
        await db.command({ ping: 1 });

        return {
            status: "ok",
            service: "api",
            database: "connected"
        };
    } catch {
        return reply.status(503).send({
            status: "error",
            service: "api",
            database: "disconnected"
        });
    }
});

const start = async () => {
    try {
        // Connexion MongoDB Atlas
        await connectDatabase();

        // Vérification du secret JWT
        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
            throw new Error("JWT_SECRET is not defined");
        }

        // JWT valable 15 minutes
        await app.register(jwt, {
            secret: jwtSecret,
            sign: {
                expiresIn: "15m"
            }
        });

        // Rate limiting
        await app.register(rateLimit);

        // Routes d'authentification
        await app.register(authRoutes, {
            prefix: "/api/v1/auth"
        });

        await app.register(playerRoutes, {
            prefix: "/api/v1"
        });


        await app.register(arenaRoutes, {
            prefix: "/api/v1"
        });

        // Démarrage du serveur
        await app.listen({
            port: Number(process.env.PORT) || 3000,
            host: "0.0.0.0"
        });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};

start();