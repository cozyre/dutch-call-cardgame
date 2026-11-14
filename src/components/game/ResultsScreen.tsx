"use client";

import { Avatar } from "@/components/ui/Avatar";
import { CardFace } from "@/components/card/CardFace";
import { Button } from "@/components/ui/Button";
import type { GameView, Standing } from "@/game/types";
import { cn } from "@/lib/format";

interface ResultsScreenProps {
  view: GameView;
  /** Whether the viewer may start the next game (plan §10, host-only). */
  isHost: boolean;
  /** The host's name for the waiting copy; "the host" when unknown. */
  hostName: string;
  /**
   * Accepted for the practice route (plan §10): the results actions are the
   * same there — `onRematch` restarts the practice deal and `onLeave`
   * returns to the practice setup — so it drives no visual difference yet.
   */
  practice?: boolean;
  /** True while the rematch request is in flight (owned by GameBoard). */
  pending: boolean;
  onRematch: () => void;
  onLeave: () => void;
}

/**
 * The end-of-round screen (design 3:187 mobile / 5:160 desktop): the winner,
 * the standings with every grid face-up, and the rematch actions. The host
 * gets "Play again" (`room:rematch`, plan §10) above a secondary
 * "Leave room"; everyone else waits for the host. Exactly one primary
 * action on the screen — the one-orange rule.
 */
export function ResultsScreen({
  view,
  isHost,
  hostName,
  pending,
  onRematch,
  onLeave,
}: ResultsScreenProps) {
  const standings = view.result ?? [];
  const winners = standings.filter((standing) => standing.isWinner);
  const lowest = standings.length ? standings[0].total : 0;
  const caller = view.players.find((player) => player.id === view.dutchCallerId);
  const outright = winners.some((standing) => standing.wonOutright);

  const headline =
    winners.length === 0
      ? "Round over"
      : winners.length === 1
        ? `${winners[0].name} wins`
        : `${winners.map((standing) => standing.name).join(" & ")} tie for the win`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-4 py-10 md:px-10 md:py-16">
      <header className="md:grid md:grid-cols-2 md:items-start md:gap-10">
        <div className="md:sticky md:top-16">
          <p className="text-caption text-glaze">
            {caller ? `${caller.name} called Dutch` : "Round over"}
          </p>
          <h1
            className={cn(
              "mt-1 text-display-l text-tile",
              winners.length === 1 && "md:text-display-xl",
            )}
          >
            {headline}
          </h1>
          <p className="mt-2 text-label font-semibold text-oranje">
            {outright
              ? `${winners[0]?.name ?? "A player"} emptied their grid — instant win`
              : `Lowest total: ${lowest} point${lowest === 1 ? "" : "s"}`}
          </p>
          <div className="mt-6 flex flex-col items-start gap-3 md:mt-10">
            {isHost ? (
              <Button
                variant="primary"
                fullWidth
                onClick={onRematch}
                disabled={pending}
                className="md:w-[320px]"
              >
                {pending ? "Starting…" : "Play again"}
              </Button>
            ) : (
              <p className="text-label text-glaze">
                Waiting for {hostName} to start the next game…
              </p>
            )}
            <Button variant="secondary" fullWidth onClick={onLeave} className="md:w-[320px]">
              Leave room
            </Button>
          </div>
        </div>

        <ol className="mt-8 flex flex-col gap-4 md:mt-0 md:gap-5">
          {standings.map((standing, index) => (
            <StandingRow
              key={standing.playerId}
              standing={standing}
              rank={index + 1}
              you={standing.playerId === view.youId}
            />
          ))}
        </ol>
      </header>
    </main>
  );
}

function StandingRow({
  standing,
  rank,
  you,
}: {
  standing: Standing;
  rank: number;
  you: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-panel bg-raised p-5 md:p-6",
        standing.isWinner && "ring-2 ring-oranje",
      )}
    >
      <div className="flex items-center gap-4">
        <span className="w-6 text-h1 text-glaze">{rank}</span>
        <Avatar name={standing.name} size={36} tone={standing.isWinner ? "oranje" : "delft"} />
        <p className="min-w-0 flex-1 truncate text-h2 text-tile">
          {standing.name}
          {you ? " (you)" : ""}
        </p>
        <span className="text-h1 text-tile">{standing.total}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5 md:mt-5">
        {standing.grid.map((card, index) => (
          <CardFace
            key={`${card.rank}-${card.suit}-${index}`}
            rank={card.rank}
            suit={card.suit}
            size="S"
            label={`${cardLabel(card.rank, card.suit)}, worth ${card.value}`}
          />
        ))}
        {standing.grid.length === 0 ? (
          <p className="text-caption text-success">Emptied the grid</p>
        ) : null}
      </div>
    </li>
  );
}

function cardLabel(rank: string, suit: string): string {
  const suits: Record<string, string> = {
    S: "spades",
    H: "hearts",
    D: "diamonds",
    C: "clubs",
  };
  return `${rank} of ${suits[suit] ?? suit}`;
}
