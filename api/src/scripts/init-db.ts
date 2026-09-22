import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error("MONGODB_URI is not defined");
}

const client = new MongoClient(uri);
const DB_NAME = "cellulys";

async function initDatabase() {
    try {
        await client.connect();

        const db = client.db(DB_NAME);

        console.log("Connected to MongoDB Atlas");
        console.log("Initializing database...");

        const existingCollections = await db
            .listCollections({}, { nameOnly: true })
            .toArray();

        const existingNames = new Set(
            existingCollections.map((collection) => collection.name)
        );

        const normalCollections = [
            "players",
            "arenas",
            "seat_reservations",
            "arena_snapshots",
            "matches",
            "skins",
            "purchases",
            "moderation_log"
        ];

        for (const name of normalCollections) {
            if (!existingNames.has(name)) {
                await db.createCollection(name);
                console.log(`Created collection: ${name}`);
            } else {
                console.log(`Collection already exists: ${name}`);
            }
        }

        // Collection time-series obligatoire
        if (!existingNames.has("telemetry")) {
            await db.createCollection("telemetry", {
                timeseries: {
                    timeField: "ts",
                    metaField: "meta",
                    granularity: "seconds"
                }
            });

            console.log("Created time-series collection: telemetry");
        } else {
            console.log("Collection already exists: telemetry");
        }

        // =========================
        // INDEXES
        // =========================

        // players
        await db.collection("players").createIndex(
            { username: 1 },
            {
                unique: true,
                name: "username_unique"
            }
        );

        // seat_reservations : token unique
        await db.collection("seat_reservations").createIndex(
            { token: 1 },
            {
                unique: true,
                name: "seat_token_unique"
            }
        );

        // seat_reservations : expiration automatique après 30 secondes
        await db.collection("seat_reservations").createIndex(
            { createdAt: 1 },
            {
                expireAfterSeconds: 30,
                name: "seat_reservation_ttl"
            }
        );

        // Suppression de l'ancien index unique sur playerId
        const seatIndexes = await db
            .collection("seat_reservations")
            .indexes();

        if (seatIndexes.some((index) => index.name === "seat_player_unique")) {
            await db
                .collection("seat_reservations")
                .dropIndex("seat_player_unique");

            console.log("Removed obsolete index: seat_player_unique");
        }

        // Historique des parties
        await db.collection("matches").createIndex(
            {
                playerId: 1,
                endedAt: -1
            },
            {
                name: "matches_player_history"
            }
        );

        // Idempotence des achats
        await db.collection("purchases").createIndex(
            {
                playerId: 1,
                idempotencyKey: 1
            },
            {
                unique: true,
                name: "purchase_idempotency_unique"
            }
        );

        // Journal de modération
        await db.collection("moderation_log").createIndex(
            { at: -1 },
            {
                name: "moderation_log_date"
            }
        );

        console.log("Indexes created");

        // =========================
        // ARENAS
        // =========================

        const arenas = db.collection("arenas");

        await arenas.updateOne(
            { _id: "arena-1" as any },
            {
                $setOnInsert: {
                    instance: "game-1",
                    status: "open",
                    capacity: 50,
                    playerCount: 0,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        await arenas.updateOne(
            { _id: "arena-2" as any },
            {
                $setOnInsert: {
                    instance: "game-2",
                    status: "open",
                    capacity: 50,
                    playerCount: 0,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        console.log("Default arenas initialized");
        console.log("Database initialization completed");
    } catch (error) {
        console.error("Database initialization failed:");
        console.error(error);

        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

initDatabase();