"use client";

import { Button } from "@/components/ui/Button";

interface LobbyHeaderProps {
  onLeave: () => void;
}

/** The lobby header: title, lobby bounds and the host's exit (desktop only). */
export function LobbyHeader({ onLeave }: LobbyHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-h1 text-tile md:text-display-l">Lobby</h1>
        <p className="mt-1 max-w-[342px] text-body text-glaze md:max-w-none">
          Share the code or link. You need 3-6 players to start.
        </p>
      </div>
      <Button
        variant="ghost"
        onClick={onLeave}
        className="max-md:hidden md:mt-[10px]"
      >
        Leave room
      </Button>
    </header>
  );
}
