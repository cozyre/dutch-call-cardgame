import { createGameServer } from "./app";
import { GAME_SERVER_PORT, NEXT_ORIGIN } from "../lib/env";

/**
 * Bootstrap for the standalone game server process.
 *
 * The Next.js app is the frontend only; all game state lives in this
 * process's memory.
 */

const server = createGameServer({
  port: GAME_SERVER_PORT,
  corsOrigin: [
    NEXT_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
});

server
  .listen(GAME_SERVER_PORT)
  .then((port) => {
    console.log(`[game-server] listening on http://localhost:${port}`);
  })
  .catch((error: unknown) => {
    console.error("[game-server] failed to start", error);
    process.exit(1);
  });

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[game-server] ${signal} received, shutting down`);
  server
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
