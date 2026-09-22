import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error("MONGODB_URI is not defined");
}

const client = new MongoClient(uri);

let db: Db;

export async function connectDatabase(): Promise<Db> {
    await client.connect();

    db = client.db("cellulys");

    await db.command({ ping: 1 });

    console.log("Connected to MongoDB Atlas");

    return db;
}

export function getDatabase(): Db {
    if (!db) {
        throw new Error("Database not connected");
    }

    return db;
}