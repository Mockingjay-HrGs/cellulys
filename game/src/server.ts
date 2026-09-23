import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { RawData } from "ws";
import { connectDatabase, getDatabase } from "./database.js";
import { arenaManager } from "./game/ArenaManager.js";
import { startGameLoop } from "./game/GameLoop.js";

const app = Fastify({
    logger: true
});

const INSTANCE_ID = process.env.INSTANCE_ID ?? "game-dev";

app.get("/health", async (_request, reply) => {
    try {
        const db = getDatabase();

        await db.command({ ping: 1 });

        return {
            status: "ok",
            service: "game",
            instance: INSTANCE_ID,
            database: "connected"
        };
    } catch {
        return reply.status(503).send({
            status: "error",
            service: "game",
            instance: INSTANCE_ID,
            database: "disconnected"
        });
    }
});

app.get("/game/:instance/health", async (request, reply) => {
    const { instance } = request.params as {
        instance: string;
    };

    try {
        const db = getDatabase();

        await db.command({ ping: 1 });

        return {
            status: "ok",
            service: "game",
            instance: INSTANCE_ID,
            requestedInstance: instance,
            database: "connected"
        };
    } catch {
        return reply.status(503).send({
            status: "error",
            service: "game",
            instance: INSTANCE_ID,
            requestedInstance: instance,
            database: "disconnected"
        });
    }
});

const start = async () => {
    try {
        await connectDatabase();
        await app.register(websocket);

        startGameLoop();

        app.log.info({
            event: "game_loop_started",
            instance: INSTANCE_ID,
            tickRate: 25,
            tickIntervalMs: 40
        });

        app.get(
            "/game/:instance",
            { websocket: true },
            async (socket, request) => {
                const { instance } = request.params as {
                    instance: string;
                };

                const { seat } = request.query as {
                    seat?: string;
                };

                app.log.info({
                    event: "websocket_request_debug",
                    instanceFromUrl: instance,
                    serverInstance: INSTANCE_ID,
                    url: request.url,
                    seatProvided: Boolean(seat)
                });

                // Vérifie que la connexion arrive sur la bonne instance
                if (instance !== INSTANCE_ID) {
                    socket.close(4001, "Invalid game instance");
                    return;
                }

                // Le seatToken est obligatoire
                if (!seat) {
                    socket.close(4001, "Missing seat token");
                    return;
                }

                try {
                    const db = getDatabase();

                    const reservations = db.collection("seat_reservations");
                    const arenas = db.collection("arenas");
                    const players = db.collection("players");

                    /*
                     * Consommation atomique du token.
                     *
                     * Le token doit :
                     * - exister
                     * - ne pas avoir déjà été utilisé
                     * - avoir moins de 30 secondes
                     */
                    const reservation = await reservations.findOneAndUpdate(
                        {
                            token: seat,
                            used: false,
                            createdAt: {
                                $gt: new Date(Date.now() - 30_000)
                            }
                        },
                        {
                            $set: {
                                used: true
                            }
                        },
                        {
                            returnDocument: "after"
                        }
                    );

                    if (!reservation) {
                        socket.close(
                            4001,
                            "Invalid or expired seat token"
                        );
                        return;
                    }

                    // Vérifie que l'arène appartient à cette instance
                    const arena = await arenas.findOne({
                        _id: reservation.arenaId as any,
                        instance: INSTANCE_ID
                    });

                    if (!arena) {
                        socket.close(
                            4001,
                            "Invalid arena for this instance"
                        );
                        return;
                    }

                    // Récupère le joueur
                    const player = await players.findOne({
                        _id: reservation.playerId
                    });

                    if (!player) {
                        socket.close(4001, "Player not found");
                        return;
                    }

                    // Vérifie le bannissement
                    if (
                        player.banned === true ||
                        player.banned?.active === true
                    ) {
                        socket.close(4003, "Player banned");
                        return;
                    }

                    const playerId =
                        reservation.playerId.toString();

                    // Ajoute réellement le joueur dans l'état
                    // de l'arène conservé en mémoire.
                    const gamePlayer = arenaManager.addPlayer(
                        reservation.arenaId,
                        playerId,
                        player.username
                    );

                    const initialCell = gamePlayer.cells[0];

                    if (!initialCell) {
                        socket.close(1011, "Player has no cell");
                        return;
                    }

                    app.log.info({
                        event: "player_spawned",
                        instance: INSTANCE_ID,
                        arenaId: reservation.arenaId,
                        playerId,
                        x: initialCell.x,
                        y: initialCell.y,
                        mass: initialCell.mass
                    });

                    // Message initial prévu par le protocole
                    socket.send(
                        JSON.stringify({
                            t: "welcome",
                            playerId,
                            arena: reservation.arenaId,
                            w: 5000,
                            h: 5000,
                            tickRate: 25
                        })
                    );

                    socket.on("message", (rawMessage: RawData) => {
                        try {
                            const message = JSON.parse(rawMessage.toString());

                            if (message.t === "input") {
                                const dx = Number(message.dx);
                                const dy = Number(message.dy);
                                const seq = Number(message.seq);

                                if (
                                    !Number.isFinite(dx) ||
                                    !Number.isFinite(dy) ||
                                    !Number.isInteger(seq)
                                ) {
                                    socket.send(
                                        JSON.stringify({
                                            t: "error",
                                            message: "Invalid input"
                                        })
                                    );
                                    return;
                                }

                                const currentPlayer = arenaManager.getPlayer(
                                    reservation.arenaId,
                                    playerId
                                );

                                if (!currentPlayer) {
                                    return;
                                }

                                // Ignore les anciens inputs
                                if (seq <= currentPlayer.input.seq) {
                                    return;
                                }

                                // Le client donne uniquement une direction.
                                // La position reste calculée par le serveur.
                                currentPlayer.input = {
                                    dx,
                                    dy,
                                    seq
                                };
                            }

                            if (message.t === "ping") {
                                socket.send(
                                    JSON.stringify({
                                        t: "pong",
                                        ts: message.ts
                                    })
                                );
                            }
                        } catch {
                            socket.send(
                                JSON.stringify({
                                    t: "error",
                                    message: "Malformed message"
                                })
                            );
                        }
                    });

                    const stateInterval = setInterval(() => {
                        const currentArena = arenaManager.getArena(
                            reservation.arenaId
                        );

                        const currentPlayer = arenaManager.getPlayer(
                            reservation.arenaId,
                            playerId
                        );

                        if (!currentArena) {
                            return;
                        }

                        if (!currentPlayer) {
                            socket.send(
                                JSON.stringify({
                                    t: "dead",
                                    arenaId: reservation.arenaId
                                })
                            );

                            clearInterval(stateInterval);
                            socket.close(1000, "Player eliminated");

                            return;
                        }

                        socket.send(
                            JSON.stringify({
                                t: "state",
                                tick: currentArena.tick,
                                ack: currentPlayer.input.seq,

                                you: currentPlayer.cells.map((cell) => ({
                                    id: cell.id,
                                    x: cell.x,
                                    y: cell.y,
                                    mass: cell.mass
                                })),

                                add: Array.from(currentArena.food.values()).map((food) => ({
                                    id: food.id,
                                    type: "food",
                                    x: food.x,
                                    y: food.y,
                                    mass: food.mass
                                })),
                                upd: [],
                                del: []
                            })
                        );
                    }, 40);

                    socket.on("close", () => {
                        clearInterval(stateInterval);
                        // Retire le joueur de l'état en mémoire
                        arenaManager.removePlayer(
                            reservation.arenaId,
                            playerId
                        );

                        app.log.info({
                            event: "websocket_disconnected",
                            instance: INSTANCE_ID,
                            arenaId: reservation.arenaId,
                            playerId
                        });
                    });
                } catch (error) {
                    app.log.error({
                        event: "websocket_authentication_error",
                        error
                    });

                    socket.close(
                        4001,
                        "Authentication error"
                    );
                }
            }
        );

        await app.listen({
            port: Number(process.env.PORT) || 3001,
            host: "0.0.0.0"
        });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};

start();