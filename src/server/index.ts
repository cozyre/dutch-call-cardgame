import { createServer } from "node:http";
import { Server } from "socket.io";
import { GAME_SERVER_PORT, NEXT_ORIGIN } from "../lib/env";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: [NEXT_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.emit("server:hello", { port: GAME_SERVER_PORT });

  socket.on("ping", (payload: unknown) => {
    socket.emit("pong", payload ?? null);
  });
});

httpServer.listen(GAME_SERVER_PORT, () => {
  console.log(`[game-server] listening on http://localhost:${GAME_SERVER_PORT}`);
});

function shutdown(signal: string): void {
  console.log(`[game-server] ${signal} received, shutting down`);
  io.close(() => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
