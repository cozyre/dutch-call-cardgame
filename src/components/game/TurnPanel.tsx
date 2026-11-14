"use client";

import type { ReactNode } from "react";
import { HowToPlayButton } from "@/components/help/HowToPlayButton";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/format";
import type { Target } from "@/game/types";
import type { GameView } from "@/game/types";
import {
  boardHeadline,
  cardName,
  formatClock,
  isMyTurn,
  rankLabel,
} from "./game-ui";

export interface TurnPanelProps {
  view: GameView;
  /** The offset-corrected server clock, ms. */
  now: number;
  /**
   * The computed board caption from GameBoard — `Room <code> · settings` on
   * the desktop sidebar, or `Practice table · settings` on the practice
   * route (plan §10).
   */
  roomLine: ReactNode;
  /** The own-grid slot the active player pre-selected for a swap. */
  selectedSlot: number | null;
  queenPicks: Target[];
  onDraw: () => void;
  onSwap: () => void;
  onDiscard: () => void;
  onDutchCall: () => void;
  onQueenSwap: () => void;
  onDeclineQueen: () => void;
}

/**
 * Everything the active player (and everyone waiting) needs to act, as a
 * pure function of the view. Rendered pinned to the bottom on mobile and as
 * the 360 px right sidebar on desktop (design 5:351).
 */
export function TurnPanelContent({
  view,
  now,
  roomLine,
  selectedSlot,
  queenPicks,
  onDraw,
  onSwap,
  onDiscard,
  onDutchCall,
  onQueenSwap,
  onDeclineQueen,
}: TurnPanelProps) {
  const mine = isMyTurn(view);
  const deadline = view.deadlineAt;
  const clock = deadline !== null && deadline > now ? formatClock(deadline - now) : null;

  const body = bodyCopy(view, selectedSlot, queenPicks);
  const showDraw = view.stepKind === "turnStart" && mine && view.canDraw;
  const showChoiceActions =
    view.stepKind === "awaitChoice" && mine && (view.canSwapDrawn || view.canDiscardDrawn);
  const showQueenActions =
    view.stepKind === "awaitQueenSwap" && view.queenResolverId === view.youId;

  return (
    <div className="flex min-h-0 flex-col">
      {/* desktop-only headline block; mobile carries it in the page header */}
      <div className="hidden md:block">
        <p className="text-caption text-glaze">{roomLine}</p>
        <h1 className={cn("mt-2 text-display-l", mine ? "text-oranje" : "text-tile")}>
          {boardHeadline(view)}
        </h1>
        {clock ? (
          <p
            aria-label={`Time remaining ${clock}`}
            className="mt-4 inline-flex items-center rounded-pill border-2 border-oranje px-4 py-1.5 text-label font-semibold text-tile"
          >
            {clock === "0:00"
              ? "Time is up"
              : `${clock} ${clockUnitFor(view.stepKind)}`}
          </p>
        ) : null}
      </div>

      {body ? <p className="mt-4 text-body text-glaze md:mt-6">{body}</p> : null}

      <div className="mt-4 flex flex-col gap-3 md:mt-6">
        {showDraw ? (
          <Button variant="primary" fullWidth onClick={onDraw}>
            Draw
          </Button>
        ) : null}

        {showChoiceActions ? (
          <>
            <Button
              variant="primary"
              fullWidth
              onClick={onSwap}
              disabled={selectedSlot === null}
            >
              Swap with selected card
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={onDiscard}
              disabled={!view.canDiscardDrawn}
            >
              Discard the {view.drawnCard ? rankLabel(view.drawnCard.rank) : "card"}
            </Button>
          </>
        ) : null}

        {view.canDutchCall ? (
          <Button variant="accent" fullWidth onClick={onDutchCall}>
            Dutch Call
          </Button>
        ) : null}

        {showQueenActions ? (
          <>
            <Button
              variant="primary"
              fullWidth
              onClick={onQueenSwap}
              disabled={queenPicks.length !== 2}
            >
              Swap selected cards
            </Button>
            <Button variant="secondary" fullWidth onClick={onDeclineQueen}>
              Skip swap
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** What happened / what to do — per the copy rules, no apologies. */
function bodyCopy(
  view: GameView,
  selectedSlot: number | null,
  queenPicks: Target[],
): string | null {
  const mine = isMyTurn(view);
  const turnPlayer = view.players.find((player) => player.id === view.turnPlayerId);

  switch (view.stepKind) {
    case "setupPeek":
      return mine || view.myPeekTokens > 0
        ? "Tap one of your cards to peek at it."
        : "Everyone is peeking at one card.";
    case "turnStart":
      if (mine) {
        return view.canDutchCall
          ? "You have one card left. Draw, or call Dutch and end the round."
          : "Draw the top card of the center pile.";
      }
      return turnPlayer ? `Waiting for ${turnPlayer.name}…` : "Waiting for a player…";
    case "awaitChoice": {
      if (!mine) {
        return turnPlayer ? `${turnPlayer.name} is choosing…` : null;
      }
      if (!view.drawnCard) return null;
      const name = cardName(view.drawnCard.rank, view.drawnCard.suit);
      return selectedSlot === null
        ? `You drew a ${name}. Only you can see it. Tap one of your cards to swap with it, or discard the ${rankLabel(view.drawnCard.rank)}.`
        : "Card selected. Swap with it, or discard the drawn card.";
    }
    case "matchWindow":
      return null; // the MatchBanner owns this copy
    case "awaitPeek":
      return view.myPeekTokens > 0
        ? `You may peek at ${view.myPeekTokens === 1 ? "one of your cards" : `${view.myPeekTokens} of your cards`}.`
        : "Players with a peek token may look at one of their cards.";
    case "awaitQueenSwap": {
      if (view.queenResolverId === view.youId) {
        return queenPicks.length === 0
          ? "Pick any two cards — your grid or anyone else's — to swap them."
          : queenPicks.length === 1
            ? "Pick the second card."
            : "Both cards picked. Swap them, or skip.";
      }
      const resolver = view.players.find(
        (player) => player.id === view.queenResolverId,
      );
      return resolver ? `Waiting for ${resolver.name} to swap two cards…` : null;
    }
    case "gameOver":
      return null;
    default:
      return null;
  }
}

function clockUnitFor(stepKind: GameView["stepKind"]): string {
  switch (stepKind) {
    case "awaitChoice":
      return "left to choose";
    case "matchWindow":
      return "left to match";
    case "setupPeek":
    case "awaitPeek":
      return "left to peek";
    case "awaitQueenSwap":
      return "left to swap";
    default:
      return "left";
  }
}

/**
 * The sidebar footer: the shared How-to-play dialog and the accent Leave
 * action pinned to the bottom of the 360 px turn sidebar.
 */
export function TurnPanelFooter({
  onLeave,
}: {
  onLeave: () => void;
}) {
  return (
    <div className="mt-auto flex flex-col gap-2 pt-6">
      <HowToPlayButton appearance="link" className="justify-start px-0" />
      <Button variant="accent" fullWidth onClick={onLeave}>
        Leave room
      </Button>
    </div>
  );
}
