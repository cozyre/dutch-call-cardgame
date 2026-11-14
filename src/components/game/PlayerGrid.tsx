"use client";

import { CardSlot } from "./CardSlot";
import { CARD_SIZES, type CardSize } from "@/components/card/CardBack";
import type { GridCardView, Target } from "@/game/types";
import { cn } from "@/lib/format";

interface PlayerGridProps {
  /** The viewer's own grid (values may be revealed) or an opponent's. */
  grid: GridCardView[];
  size: CardSize;
  columns: number;
  /**
   * Which slots are currently interactive, with the state to render them in.
   * Keys are grid indices; everything else renders idle.
   */
  slotStates?: Record<number, "selectable" | "selected" | "danger" | "muted">;
  /** Slots whose reveal is still within the client display window. */
  faceSlots?: Set<number>;
  onSlotClick?: (index: number) => void;
  /** Accessible verb for a selectable slot ("peek at", "burn", …). */
  actionVerb?: string;
  className?: string;
}

const SLOT_GAP_PX = 12;

/**
 * A card grid: the player's own (interactive, reveals possible) or an
 * opponent's (always face-down). Cards wrap before they shrink — slots keep
 * their fixed size and flow into a new row, so the grid never distorts.
 */
export function PlayerGrid({
  grid,
  size,
  columns,
  slotStates = {},
  faceSlots,
  onSlotClick,
  actionVerb,
  className,
}: PlayerGridProps) {
  const { width } = CARD_SIZES[size];
  return (
    <div
      className={cn("flex flex-wrap content-start gap-x-3 gap-y-3", className)}
      style={{ maxWidth: columns * width + (columns - 1) * SLOT_GAP_PX }}
    >
      {grid.map((entry) => {
        const state = slotStates[entry.index] ?? "idle";
        return (
          <div key={entry.index} style={{ width, height: CARD_SIZES[size].height }} className="shrink-0">
            <CardSlot
              card={entry}
              size={size}
              state={state}
              showFace={faceSlots?.has(entry.index) ?? false}
              onClick={onSlotClick ? () => onSlotClick(entry.index) : undefined}
              actionLabel={
                state === "selectable" && actionVerb
                  ? `${actionVerb} card ${entry.index + 1}`
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Opponent grids are picked by player id + index during a queen swap, so the
 * parent needs selectable states keyed by index for a specific owner.
 */
export function opponentSlotStates(
  grid: GridCardView[],
  picks: Target[],
  ownerId: string,
): Record<number, "selectable" | "selected"> {
  const states: Record<number, "selectable" | "selected"> = {};
  for (const entry of grid) {
    const picked = picks.some(
      (pick) => pick.playerId === ownerId && pick.cardIndex === entry.index,
    );
    states[entry.index] = picked ? "selected" : "selectable";
  }
  return states;
}
