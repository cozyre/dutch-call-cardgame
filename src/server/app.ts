import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { RoomManager } from "./rooms";
import { SeatTokenService, SessionRegistry } from "./session";
import { setupTransport } from "./transport";
import { DeadlineSweeper } from "./timers";

/**
 * The game server as a composable unit: an HTTP server, a Socket.io
 * server, the room registry and the deadline sweeper.
 *
 * `index.ts` is only the bootstrap; everything else in this file can be
 * created in-process, which is what the integration tests do.
 */

export interface GameServerOptions {
  port?: number;
  /** Signing secret for seat tokens. A random one is used when omitted. */
  secret?: string;
  corsOrigin?: string[];
  sweepIntervalMs?: number;
  reconnectGraceMs?: number;
  /** Start the deadline sweeper immediately (default: true). */
  autoStart?: boolean;
}

export interface GameServer {
  httpServer: HttpServer;
  io: Server;
  rooms: RoomManager;
  sessions: SessionRegistry;
  sweeper: DeadlineSweeper;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: {
      origin: options.corsOrigin ?? ["http://localhost:3000"],
      methods: ["GET", "POST"],
    },
  });

  const tokens = new SeatTokenService(options.secret);
  const rooms = new RoomManager(tokens);
  const sessions = new SessionRegistry();

  setupTransport({
    io,
    rooms,
    sessions,
    port: () => {
      const address = httpServer.address();
      return typeof address === "object" && address ? address.port : 0;
    },
  });

  const sweeper = new DeadlineSweeper(
    { io, rooms, sessions },
    {
      ...(options.sweepIntervalMs === undefined
        ? {}
        : { intervalMs: options.sweepIntervalMs }),
      ...(options.reconnectGraceMs === undefined
        ? {}
        : { reconnectGraceMs: options.reconnectGraceMs }),
    },
  );

  if (options.autoStart !== false) sweeper.start();

  return {
    httpServer,
    io,
    rooms,
    sessions,
    sweeper,
    listen(port = options.port ?? 0): Promise<number> {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, () => {
          const address = httpServer.address();
          const bound = typeof address === "object" && address ? address.port : port;
          resolve(bound);
        });
      });
    },
    close(): Promise<void> {
      sweeper.stop();
      return new Promise((resolve) => {
        io.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
  };
}
