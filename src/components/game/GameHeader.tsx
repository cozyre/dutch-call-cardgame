"use client";

import type { ReactNode } from "react";
import { HowToPlayButton } from "@/components/help/HowToPlayButton";
import { cn } from "@/lib/format";
import { boardHeadline } from "./game-ui";
import type { GameView } from "@/game/types";

interface GameHeaderProps {
  view: GameView;
  /**
   * The computed board caption from GameBoard — `Room <code> · settings`,
   * or `Practice table · settings` on the practice route (plan §10).
   */
  roomLine: ReactNode;
  /** Remaining server-window time, already offset-corrected, or null. */
  clock: string | null;
  onLeave: () => void;
}

/**
 * The mobile board header: the step headline, the room line and the timer
 * pill, plus the shared How-to-play dialog and the accent Leave action.
 * On desktop the turn sidebar carries all of this instead.
 */
export function GameHeader({ view, roomLine, clock, onLeave }: GameHeaderProps) {
  const headline = boardHeadline(view);
  const mine = view.turnPlayerId === view.youId && view.phase === "playing";

  return (
    <header className="flex items-start justify-between gap-3 md:hidden">
      <div className="min-w-0">
        <h1
          className={cn(
            "text-h1",
            mine ? "text-oranje" : "text-tile",
          )}
        >
          {headline}
        </h1>
        <p className="mt-1 truncate text-caption text-glaze">{roomLine}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <HowToPlayButton className="h-12 px-3 text-label" />
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex h-12 items-center justify-center rounded-pill border-[1.5px] border-oranje px-3 text-label font-medium text-oranje transition-colors hover:bg-oranje/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oranje"
        >
          Leave
        </button>
        {clock ? (
          <span
            aria-label={`Time remaining ${clock}`}
            className="inline-flex h-12 items-center rounded-pill border-2 border-oranje px-4 text-label font-semibold text-tile"
          >
            {clock}
          </span>
        ) : null}
      </div>
    </header>
  );
}
