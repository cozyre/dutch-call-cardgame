"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  HelpAbilitiesVisual,
  HelpDutchVisual,
  HelpMatchVisual,
  HelpScoringVisual,
  HelpSetupVisual,
  HelpTurnVisual,
} from "./HelpVisuals";

interface HowToPlayDialogProps {
  onClose: () => void;
}

/**
 * Native modal dialog so focus trapping and Escape come from the browser.
 * Content scrolls inside a fixed-height panel; the page behind is locked.
 */
export function HowToPlayDialog({ onClose }: HowToPlayDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) dialog.showModal();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="how-to-play-title"
      aria-describedby="how-to-play-intro"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="help-dialog m-auto w-[calc(100vw-1.5rem)] max-w-[720px] rounded-panel border-0 bg-transparent p-0 text-tile outline-none"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-panel bg-raised md:max-h-[min(860px,calc(100dvh-4rem))]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-glaze/20 px-5 py-4 md:px-8 md:py-6">
          <div>
            <h2
              id="how-to-play-title"
              className="text-h1 text-tile md:text-display-l"
            >
              How to play
            </h2>
            <p className="mt-1 text-label text-glaze">The rules, at a glance.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close how to play"
            onClick={() => dialogRef.current?.close()}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-pill text-glaze transition-colors hover:bg-tile/5 hover:text-tile focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oranje"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-8 md:py-6">
          <p id="how-to-play-intro" className="text-body text-glaze">
            For 3–6 players. Empty your grid, or call Dutch and finish with the
            lowest total.
          </p>

          <ol className="mt-6 flex flex-col gap-6">
            <HelpStep number={1} title="Set up" visual={<HelpSetupVisual />}>
              Everyone gets 4–12 face-down cards depending on the host’s
              difficulty. Before play, peek privately at one of them.
            </HelpStep>

            <HelpStep number={2} title="Your turn" visual={<HelpTurnVisual />}>
              Draw the top centre card. Swap it into your grid — the card it
              replaces goes to the discard pile — or discard the drawn card. You
              have 30 seconds.
            </HelpStep>

            <HelpStep
              number={3}
              title="Match window"
              visual={<HelpMatchVisual />}
            >
              Whenever a card is discarded, everyone gets 30 seconds to burn
              cards of the same rank from their own grid. A correct burn removes
              the card; a wrong guess adds a face-down penalty card.
            </HelpStep>

            <HelpStep
              number={4}
              title="Jacks and Queens"
              visual={<HelpAbilitiesVisual />}
            >
              Discard a Jack and every player may peek at one of their own cards.
              Discard a Queen and you may blind-swap any two cards, or skip.
            </HelpStep>

            <HelpStep number={5} title="Dutch Call" visual={<HelpDutchVisual />}>
              With exactly one card left, on your turn, call Dutch. The game
              ends when the turn returns to you. Emptying your grid wins
              instantly.
            </HelpStep>
          </ol>

          <section className="mt-8 border-t border-glaze/20 pt-6">
            <div className="flex items-center gap-3">
              <StepNumber number={6} />
              <h3 className="text-h2 text-tile">Scoring</h3>
            </div>
            <p className="mt-2 text-body text-glaze">
              When the round ends, total the cards still in your grid. Lowest
              total wins.
            </p>
            <HelpScoringVisual />
            <p className="mt-4 text-label text-glaze">
              Red King 13 · Black King 0 · Jack or Queen 10 · number cards face
              value.
            </p>
          </section>
        </div>
      </div>
    </dialog>
  );
}

interface HelpStepProps {
  number: number;
  title: string;
  visual: ReactNode;
  children: ReactNode;
}

function HelpStep({ number, title, visual, children }: HelpStepProps) {
  return (
    <li className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-center md:gap-6">
      <div>
        <div className="flex items-center gap-3">
          <StepNumber number={number} />
          <h3 className="text-h2 text-tile">{title}</h3>
        </div>
        <p className="mt-2 text-body text-glaze">{children}</p>
      </div>
      <div className="w-full md:w-[220px]">{visual}</div>
    </li>
  );
}

function StepNumber({ number }: { number: number }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-tile/10 text-label font-semibold text-tile">
      {number}
    </span>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
