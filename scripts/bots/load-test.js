const fs = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");

const accounts = JSON.parse(
    fs.readFileSync(path.join(__dirname, "accounts.json"), "utf8")
);

const botCount = 5;
const processes = [];

for (const account of accounts.slice(0, botCount)) {
    const child = spawn(process.execPath, [path.join(__dirname, "bot.js")], {
        env: {
            ...process.env,
            BOT_USERNAME: account.username,
            BOT_PASSWORD: account.password,
            ARENA_ID: "arena-1"
        },
        stdio: "inherit"
    });

    processes.push(child);
}

process.on("SIGINT", () => {
    for (const child of processes) {
        child.kill("SIGINT");
    }
    process.exit(0);
});