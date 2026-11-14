"use client";

import { cn } from "@/lib/format";
import type { CardSize } from "@/components/card/CardBack";
import { CardBack } from "@/components/card/CardBack";
import { CardFace } from "@/components/card/CardFace";
import type { GridCardView } from "@/game/types";

type SlotState = "idle" | "selectable" | "selected" | "danger" | "muted";

interface CardSlotProps {
  card: GridCardView;
  size: CardSize;
  state?: SlotState;
  /** The face is shown only while a peek reveal is live for this slot. */
  showFace: boolean;
  onClick?: () => void;
  /** Accessible label for the interactive slot (state-dependent). */
  actionLabel?: string;
}

/**
 * One grid slot. Face-down until a server reveal says otherwise; the orange
 * ring marks the selected/advancing interaction, the danger ring marks a
 * wrong-burn penalty, and muted deactivates an already-used slot.
 */
export function CardSlot({
  card,
  size,
  state = "idle",
  showFace,
  onClick,
  actionLabel,
}: CardSlotProps) {
  const interactive = state === "selectable" || state === "selected";
  const face = card.revealed;

  const content =
    showFace && face ? (
      <CardFace rank={face.rank} suit={face.suit} size={size} />
    ) : (
      <CardBack size={size} />
    );

  const className = cn(
    "relative rounded-card outline-none",
    "transition-[box-shadow,opacity] duration-150",
    state === "selectable" && "cursor-pointer hover:brightness-110",
    state === "selected" && "ring-2 ring-oranje ring-offset-2 ring-offset-ink",
    state === "danger" && "ring-2 ring-danger ring-offset-2 ring-offset-ink",
    state === "muted" && "opacity-40",
    interactive &&
      "focus-visible:ring-2 focus-visible:ring-oranje focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
  );

  if (!interactive) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel}
      className={cn("block", className)}
    >
      {content}
    </button>
  );
}
