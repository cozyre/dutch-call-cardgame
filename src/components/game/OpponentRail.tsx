"use client";

import { Avatar } from "@/components/ui/Avatar";
import { CardBack } from "@/components/card/CardBack";
import { cn } from "@/lib/format";
import { seatStatus } from "./game-ui";
import type { GameView, Target } from "@/game/types";

interface OpponentRailProps {
  view: GameView;
  now: number;
  desktop: boolean;
  /**
   * When the viewer is resolving a queen swap, opponent cards become
   * pickable — on mobile the rail expands to show the grids (the design's
   * ability prompts reuse the same tokens).
   */
  pickingQueenTargets: boolean;
  queenPicks: Target[];
  onPickOpponent: (playerId: string, cardIndex: number) => void;
}

/**
 * The opponents: compact Seat pills on mobile (horizontally scrollable), a
 * row of panels with face-down S grids on desktop. Opponent cards are always
 * backs — the projection never carries their values.
 */
export function OpponentRail({
  view,
  now,
  desktop,
  pickingQueenTargets,
  queenPicks,
  onPickOpponent,
}: OpponentRailProps) {
  const opponents = view.players.filter((player) => player.id !== view.youId);

  if (desktop) {
    return (
      <section
        aria-label="Opponents"
        className="grid grid-cols-2 gap-6 lg:grid-cols-3"
      >
        {opponents.map((player) => {
          const disconnected = !player.connected && player.disconnectedAt !== null;
          return (
            <div
              key={player.id}
              className={cn(
                "rounded-panel bg-raised p-5",
                disconnected && "opacity-50",
              )}
            >
              <SeatPill view={view} player={player} now={now} />
              <OpponentGrid
                cardCount={player.cardCount}
                picking={pickingQueenTargets}
                picked={queenPicks.some(
                  (pick) => pick.playerId === player.id,
                )}
                pickedIndices={queenPicks
                  .filter((pick) => pick.playerId === player.id)
                  .map((pick) => pick.cardIndex)}
                onPick={(index) => onPickOpponent(player.id, index)}
                disabled={disconnected}
              />
            </div>
          );
        })}
      </section>
    );
  }

  return (
    <section
      aria-label="Opponents"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      {opponents.map((player) => {
        const disconnected = !player.connected && player.disconnectedAt !== null;
        return (
          <div
            key={player.id}
            className={cn(
              "flex min-w-max items-center rounded-pill bg-raised py-2 pl-2 pr-4",
              player.id === view.turnPlayerId && "ring-2 ring-oranje",
              disconnected && "opacity-50",
            )}
          >
            <SeatPill view={view} player={player} now={now} />
          </div>
        );
      })}
      {pickingQueenTargets
        ? opponents.map((player) => (
            <div
              key={`grid-${player.id}`}
              className="min-w-max rounded-panel bg-raised p-4"
            >
              <p className="mb-2 text-caption text-glaze">
                {player.name} · pick a card
              </p>
              <OpponentGrid
                cardCount={player.cardCount}
                picking
                picked={queenPicks.some((pick) => pick.playerId === player.id)}
                pickedIndices={queenPicks
                  .filter((pick) => pick.playerId === player.id)
                  .map((pick) => pick.cardIndex)}
                onPick={(index) => onPickOpponent(player.id, index)}
              />
            </div>
          ))
        : null}
    </section>
  );
}

function SeatPill({
  view,
  player,
  now,
}: {
  view: GameView;
  player: GameView["players"][number];
  now: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative shrink-0">
        <Avatar name={player.name} size={36} offline={!player.connected} />
        {player.id === view.turnPlayerId ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-oranje"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-label font-medium text-tile">{player.name}</p>
        <p
          className={cn(
            "truncate text-caption",
            player.id === view.turnPlayerId ? "text-oranje" : "text-glaze",
          )}
        >
          {seatStatus(view, player, now)}
        </p>
      </div>
    </div>
  );
}

function OpponentGrid({
  cardCount,
  picking,
  picked,
  pickedIndices,
  onPick,
  disabled = false,
}: {
  cardCount: number;
  picking: boolean;
  picked: boolean;
  pickedIndices: number[];
  onPick: (index: number) => void;
  disabled?: boolean;
}) {
  const columns = cardCount <= 0 ? 1 : Math.min(4, Math.max(1, Math.ceil(cardCount / Math.ceil(cardCount / 3))));
  const rows = Math.max(1, Math.ceil(cardCount / columns));

  return (
    <div
      className="mt-4 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 44px))` }}
      aria-label={picking ? `${cardCount} face-down cards, pick one` : `${cardCount} face-down cards`}
    >
      {Array.from({ length: cardCount }, (_, index) => {
        const isPicked = pickedIndices.includes(index);
        const selectable = picking && !disabled && (!picked || isPicked);
        if (!selectable) {
          return (
            <div
              key={index}
              className={cn("rounded-card", isPicked && "ring-2 ring-oranje")}
            >
              <CardBack size="S" />
            </div>
          );
        }
        return (
          <button
            key={index}
            type="button"
            onClick={() => onPick(index)}
            aria-label={`Pick face-down card ${index + 1} for the swap`}
            className={cn(
              "rounded-card outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-oranje",
              isPicked ? "ring-2 ring-oranje" : "hover:brightness-110",
            )}
          >
            <CardBack size="S" />
          </button>
        );
      })}
      {/* keep the grid shape stable when cards run out */}
      {cardCount === 0 ? (
        <span className="text-caption text-glaze">no cards left</span>
      ) : null}
      <span className="sr-only">
        {rows} row{rows === 1 ? "" : "s"} of {columns}
      </span>
    </div>
  );
}
