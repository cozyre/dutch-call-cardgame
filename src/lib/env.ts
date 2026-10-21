export const DEFAULT_GAME_SERVER_PORT = 3001;

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_GAME_SERVER_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_GAME_SERVER_PORT;
  }
  return parsed;
}

export const GAME_SERVER_PORT: number = parsePort(process.env.GAME_SERVER_PORT);

export const GAME_SERVER_URL: string =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ??
  process.env.GAME_SERVER_URL ??
  `http://localhost:${GAME_SERVER_PORT}`;

export const NEXT_ORIGIN: string =
  process.env.NEXT_PUBLIC_ORIGIN ?? "http://localhost:3000";
