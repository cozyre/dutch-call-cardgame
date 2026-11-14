"use client";

import { CardBack } from "@/components/card/CardBack";
import { CardFace } from "@/components/card/CardFace";
import type { CardSize } from "@/components/card/CardBack";
import type { GameView } from "@/game/types";
import { cn } from "@/lib/format";
import { rankLabel } from "./game-ui";

interface CenterPilesProps {
  view: GameView;
  desktop: boolean;
  /** Whether the drawn card should be highlighted (active player only). */
  highlightDrawn: boolean;
}

/**
 * The center panel: the draw pile (count only), the card you drew — visible
 * to you alone, ringed in orange — and the discard pile (top card + count).
 */
export function CenterPiles({ view, desktop, highlightDrawn }: CenterPilesProps) {
  const backSize: CardSize = desktop ? "L" : "S";
  const drawnSize: CardSize = "M";
  const discardSize: CardSize = desktop ? "M" : "S";

  return (
    <section
      aria-label="Center piles"
      className="flex items-start justify-center gap-8 rounded-panel bg-raised px-6 py-5 md:gap-14 md:px-10 md:py-7"
    >
      <Pile caption={`Draw · ${view.drawPileCount}`}>
        <CardBack size={backSize} />
      </Pile>

      {view.drawnCard ? (
        <Pile
          caption={desktop ? "You drew · only you can see it" : "You drew"}
        >
          <div
            className={cn(
              "rounded-card",
              highlightDrawn && "ring-2 ring-oranje ring-offset-2 ring-offset-raised",
            )}
          >
            <CardFace
              rank={view.drawnCard.rank}
              suit={view.drawnCard.suit}
              size={drawnSize}
              label={`You drew the ${rankLabel(view.drawnCard.rank)} of ${suitName(view.drawnCard.suit)}`}
            />
          </div>
        </Pile>
      ) : null}

      <Pile caption={desktop ? "Discard pile" : "Discard"}>
        {view.discardTop ? (
          <CardFace
            rank={view.discardTop.rank}
            suit={view.discardTop.suit}
            size={discardSize}
            label={`Discard top: ${rankLabel(view.discardTop.rank)} of ${suitName(view.discardTop.suit)}`}
          />
        ) : (
          <div
            className="rounded-card border border-dashed border-glaze/40"
            style={{
              width: CARD_BOX[discardSize].width,
              height: CARD_BOX[discardSize].height,
            }}
            aria-label="The discard pile is empty"
          />
        )}
      </Pile>
    </section>
  );
}

function Pile({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {children}
      <p className="text-caption text-glaze">{caption}</p>
    </div>
  );
}

const CARD_BOX: Record<CardSize, { width: number; height: number }> = {
  S: { width: 44, height: 62 },
  M: { width: 64, height: 90 },
  L: { width: 92, height: 130 },
};

function suitName(suit: string): string {
  switch (suit) {
    case "H":
      return "hearts";
    case "D":
      return "diamonds";
    case "C":
      return "clubs";
    default:
      return "spades";
  }
}
