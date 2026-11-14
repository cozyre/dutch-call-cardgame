"use client";

import { cn } from "@/lib/format";
import {
  formatClock,
  matchBannerBody,
  wrongBurnCopy,
} from "./game-ui";
import type { GameView, Rank } from "@/game/types";

type MatchFeedback = "none" | "wrong" | "correct";

interface MatchBannerProps {
  view: GameView;
  now: number;
  /** The player who opened the window with their discard. */
  discardedBy: string;
  discardedRank: Rank;
  feedback: MatchFeedback;
  desktop?: boolean;
}

/**
 * The match window banner: the rank everyone is matching, the countdown and
 * the instruction. The danger variant is the design's wrong-guess feedback —
 * it never names the burned card (plan gotcha 17).
 */
export function MatchBanner({
  view,
  now,
  discardedBy,
  discardedRank,
  feedback,
  desktop = false,
}: MatchBannerProps) {
  const deadline = view.matchWindow?.deadlineAt ?? null;
  const clock = deadline !== null ? formatClock(deadline - now) : null;

  if (desktop) {
    return (
      <div
        className={cn(
          "rounded-panel border p-4",
          feedback === "wrong" ? "border-danger" : "border-glaze/20",
        )}
      >
        {feedback === "wrong" ? (
          <p className="text-label font-semibold text-danger">{wrongBurnCopy()}</p>
        ) : null}
        {feedback === "correct" ? (
          <p className="text-label font-semibold text-success">
            Matched — the card left your grid.
          </p>
        ) : null}
        <p className="mt-2 text-body text-glaze">
          {matchBannerBody(view, discardedBy, discardedRank)}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-live="polite"
      className={cn(
        "rounded-panel border bg-raised p-5",
        feedback === "wrong" ? "border-danger" : "border-transparent",
      )}
    >
      {feedback === "wrong" ? (
        <h2 className="text-h2 text-tile">{wrongBurnCopy()}</h2>
      ) : null}
      {feedback === "correct" ? (
        <h2 className="text-h2 text-success">Matched — card burned</h2>
      ) : null}
      {feedback === "none" ? (
        <h2 className="text-h2 text-tile">Match window</h2>
      ) : null}
      <p className="mt-2 text-body text-glaze">
        {matchBannerBody(view, discardedBy, discardedRank)}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span
          aria-label={`Match window ends in ${clock ?? "0:00"}`}
          className="inline-flex h-10 items-center rounded-pill border-2 border-oranje px-4 text-label font-semibold text-tile"
        >
          {clock ?? "0:00"}
        </span>
        <span className="text-caption text-glaze">to discard a match</span>
      </div>
    </section>
  );
}
