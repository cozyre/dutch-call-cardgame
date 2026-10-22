"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { HowToPlayDialog } from "./HowToPlayDialog";

type HelpAppearance = "link" | "ghost";

interface HowToPlayButtonProps {
  appearance?: HelpAppearance;
  className?: string;
}

const APPEARANCES: Record<HelpAppearance, string> = {
  link: "justify-start px-0 text-glaze hover:text-tile",
  ghost: "px-4 text-glaze hover:bg-tile/5 hover:text-tile",
};

/**
 * Shared How-to-play trigger. Uses a native button rather than the shared
 * Button so the Home link can sit flush with the form without fighting the
 * Button's base padding.
 */
export function HowToPlayButton({
  appearance = "ghost",
  className,
}: HowToPlayButtonProps) {
  const [open, setOpen] = useState(false);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  function openDialog() {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOpen(true);
  }

  const closeDialog = useCallback(() => {
    const trigger = previouslyFocused.current;
    previouslyFocused.current = null;
    setOpen(false);
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  }, []);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openDialog}
        className={cn(
          "inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-pill text-body font-medium",
          "transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oranje",
          APPEARANCES[appearance],
          className,
        )}
      >
        <HelpIcon />
        How to play
      </button>
      {open ? <HowToPlayDialog onClose={closeDialog} /> : null}
    </>
  );
}

function HelpIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 1 1 3.7 2.24c-.84.49-1.3.98-1.3 1.96" />
      <path d="M12 16.8h.01" />
    </svg>
  );
}
