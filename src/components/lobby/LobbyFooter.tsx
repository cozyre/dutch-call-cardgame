"use client";

import { Button } from "@/components/ui/Button";

interface LobbyFooterProps {
  isHost: boolean;
  canStart: boolean;
  playerCount: number;
  minPlayers: number;
  error: string | null;
  onStart: () => void;
}

/** Start control and the one-line status under the settings. */
export function LobbyFooter({
  isHost,
  canStart,
  playerCount,
  minPlayers,
  error,
  onStart,
}: LobbyFooterProps) {
  const missing = Math.max(0, minPlayers - playerCount);
  const status = canStart
    ? isHost
      ? `${playerCount} players joined · ready when you are.`
      : `${playerCount} players joined · waiting for the host to start.`
    : `Waiting for ${missing} more ${missing === 1 ? "player" : "players"}…`;

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      {isHost ? (
        <Button
          variant="primary"
          fullWidth
          onClick={onStart}
          disabled={!canStart}
          className="md:order-2 md:w-[142px]"
        >
          Start game
        </Button>
      ) : null}
      <div className="flex flex-col gap-1 md:order-1">
        <p className="text-center text-label text-glaze md:text-left md:text-body">
          {status}
        </p>
        {error ? (
          <p className="text-center text-caption text-danger md:text-left" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
