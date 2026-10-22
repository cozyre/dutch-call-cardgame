"use client";

import { HowToPlayButton } from "@/components/help/HowToPlayButton";
import { Button } from "@/components/ui/Button";

interface LobbyHeaderProps {
  onLeave: () => void;
}

/** The lobby header: title, lobby bounds, help and exit. */
export function LobbyHeader({ onLeave }: LobbyHeaderProps) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-h1 text-tile md:text-display-l">Lobby</h1>
        <p className="mt-1 max-w-[342px] text-body text-glaze md:max-w-none">
          Share the code or link. You need 3-6 players to start.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end md:mt-[10px] md:self-auto">
        <HowToPlayButton />
        <Button variant="accent" onClick={onLeave}>
          Leave room
        </Button>
      </div>
    </header>
  );
}
