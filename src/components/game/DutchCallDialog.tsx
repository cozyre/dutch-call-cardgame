"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { GameView } from "@/game/types";

interface DutchCallDialogProps {
  view: GameView;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Native accessible confirmation for the Dutch Call: the game ends when play
 * returns to the caller (plan A6/A8). Focus trap and Escape come from the
 * browser, like the shared How-to-play dialog.
 */
export function DutchCallDialog({ view, onClose, onConfirm }: DutchCallDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    confirmRef.current?.focus();
  }, []);

  const caller = view.players.find((player) => player.id === view.youId);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="dutch-call-title"
      aria-describedby="dutch-call-body"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="help-dialog m-auto w-[calc(100vw-1.5rem)] max-w-[420px] rounded-panel border-0 bg-transparent p-0 text-tile outline-none"
    >
      <div className="rounded-panel bg-raised p-6">
        <h2 id="dutch-call-title" className="text-h2 text-tile">
          Call Dutch?
        </h2>
        <p id="dutch-call-body" className="mt-2 text-body text-glaze">
          Every other player takes one more turn. When play returns to
          {caller ? ` ${caller.name}` : " you"}, all grids are revealed and the
          lowest total wins.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <Button variant="primary" fullWidth onClick={onConfirm}>
            Call Dutch
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Not yet
          </Button>
        </div>
      </div>
    </dialog>
  );
}
