const WebSocket = require("ws");

const BASE_URL = "http://localhost:8080";
const WS_URL = "ws://localhost:8080";

const username = process.env.BOT_USERNAME;
const password = process.env.BOT_PASSWORD;
const arenaId = process.env.ARENA_ID || "arena-1";

async function main() {
    if (!username || !password) {
        throw new Error("BOT_USERNAME et BOT_PASSWORD sont obligatoires");
    }

    // 1. Connexion à l'API
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
    });

    if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const { token } = await loginResponse.json();

    // 2. Réservation d'une place
    const joinResponse = await fetch(
        `${BASE_URL}/api/v1/arenas/${arenaId}/join`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!joinResponse.ok) {
        throw new Error(`Join failed: ${joinResponse.status}`);
    }

    const { websocketUrl } = await joinResponse.json();

    // 3. Connexion WebSocket
    const socket = new WebSocket(`${WS_URL}${websocketUrl}`);

    let seq = 0;
    let inputInterval;

    let stateCount = 0;
    let receivedBytes = 0;
    const startedAt = Date.now();

    socket.on("open", () => {
        console.log("BOT_CONNECTED");

        // Envoie une direction toutes les 100 ms
        inputInterval = setInterval(() => {
            seq++;

            socket.send(JSON.stringify({
                t: "input",
                seq,
                dx: Math.random() * 2 - 1,
                dy: Math.random() * 2 - 1
            }));
        }, 100);
    });

    socket.on("message", (raw) => {
        receivedBytes += raw.length;
        const message = JSON.parse(raw.toString());

        if (message.t === "state") {
            stateCount++;
        }

        if (message.t === "welcome") {
            console.log("BOT_WELCOME", message.playerId);
        }

        if (message.t === "dead") {
            console.log("BOT_DEAD");
        }
    });

    socket.on("close", (code, reason) => {
        clearInterval(inputInterval);
        const durationSec = (Date.now() - startedAt) / 1000;

        console.log("BOT_STATS", {
            username,
            durationSec: durationSec.toFixed(1),
            statesPerSec: (stateCount / durationSec).toFixed(1),
            bytesPerSec: Math.round(receivedBytes / durationSec)
        });
        console.log("BOT_DISCONNECTED", code, reason.toString());
    });

    socket.on("error", (error) => {
        console.error("BOT_ERROR", error.message);
    });
}

main().catch(console.error);