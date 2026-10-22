"use client";

import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/format";
import type { LobbyPlayerView } from "@/server/protocol";

interface PlayerListProps {
  players: LobbyPlayerView[];
  youId: string | null;
  maxPlayers: number;
}

/**
 * The lobby roster. Empty seats fill up to the six-player maximum; the
 * viewer's own row gets the orange avatar and an extra beat of space on
 * mobile, exactly as in the design.
 */
export function PlayerList({ players, youId, maxPlayers }: PlayerListProps) {
  const missing = Math.max(0, maxPlayers - players.length);

  return (
    <section className="rounded-panel bg-raised p-4 md:p-6">
      <h2 className="text-h2 text-tile">
        Players {players.length}/{maxPlayers}
      </h2>
      <ul className="mt-10 flex flex-col gap-3 md:mt-3">
        {players.map((player) => {
          const isYou = player.id === youId;
          const labels = [
            player.isHost ? "Host" : null,
            isYou ? "You" : null,
          ].filter(Boolean);
          return (
            <li
              key={player.id}
              className={cn(
                "flex items-center gap-3",
                isYou && "mb-[30px] md:mb-0",
              )}
            >
              <Avatar
                name={player.name}
                size={40}
                tone={isYou ? "oranje" : "delft"}
                offline={!player.connected}
              />
              <p className="min-w-0 flex-1 truncate text-label font-medium text-tile">
                {player.name}
              </p>
              <p className="shrink-0 text-caption text-glaze">
                {!player.connected
                  ? "Reconnecting…"
                  : labels.length > 0
                    ? labels.join(" · ")
                    : null}
              </p>
            </li>
          );
        })}
        {Array.from({ length: missing }).map((_, index) => (
          <li key={`empty-${index}`} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded-full border-[1.5px] border-dashed border-glaze/28"
            />
            <p className="text-label text-glaze">Waiting for a player…</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
