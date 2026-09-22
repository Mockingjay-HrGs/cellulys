import Fastify from "fastify";

const app = Fastify({
    logger: true
});

const INSTANCE_ID = process.env.INSTANCE_ID ?? "game-dev";

app.get("/health", async () => {
    return {
        status: "ok",
        service: "game",
        instance: INSTANCE_ID
    };
});

app.get("/game/:instance/health", async (request) => {
    const { instance } = request.params as { instance: string };

    return {
        status: "ok",
        service: "game",
        instance: INSTANCE_ID,
        requestedInstance: instance
    };
});

const start = async () => {
    try {
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