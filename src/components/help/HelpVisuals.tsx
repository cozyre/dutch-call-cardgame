import type { ReactNode } from "react";
import { CardBack } from "@/components/card/CardBack";
import { CardFace } from "@/components/card/CardFace";
import { cn } from "@/lib/format";

interface WellProps {
  children: ReactNode;
  className?: string;
}

/** A decorative card well; the surrounding copy carries the accessible text. */
function Well({ children, className }: WellProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-input border border-glaze/15 bg-ink/40 p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HelpSetupVisual() {
  return (
    <Well className="grid grid-cols-3 justify-items-center gap-2">
      <CardBack size="M" />
      <CardBack size="M" />
      <CardBack size="M" />
      <CardBack size="M" />
      <span className="rounded-card ring-2 ring-tile">
        <CardFace rank="7" suit="H" size="M" />
      </span>
      <CardBack size="M" />
    </Well>
  );
}

export function HelpTurnVisual() {
  return (
    <Well className="flex items-center justify-center gap-3">
      <CardFace rank="9" suit="D" size="M" />
      <ArrowIcon className="h-5 w-5 shrink-0 text-glaze" />
      <div className="grid grid-cols-2 gap-2">
        <CardBack size="S" />
        <CardBack size="S" />
        <CardBack size="S" />
        <CardBack size="S" />
      </div>
    </Well>
  );
}

export function HelpMatchVisual() {
  return (
    <Well className="flex items-center justify-center gap-3">
      <CardFace rank="8" suit="C" size="M" />
      <CardFace rank="8" suit="S" size="M" />
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-success/15 text-success">
        <CheckIcon className="h-5 w-5" />
      </span>
    </Well>
  );
}

export function HelpAbilitiesVisual() {
  return (
    <Well className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-3">
        <CardFace rank="J" suit="C" size="M" />
        <EyeIcon className="h-5 w-5 shrink-0 text-glaze" />
        <span className="text-caption text-glaze">Peek one</span>
      </div>
      <div className="flex items-center justify-center gap-3">
        <CardFace rank="Q" suit="D" size="M" />
        <SwapIcon className="h-5 w-5 shrink-0 text-glaze" />
        <span className="text-caption text-glaze">Swap or skip</span>
      </div>
    </Well>
  );
}

export function HelpDutchVisual() {
  return (
    <Well className="flex items-center justify-center gap-3">
      <CardFace rank="A" suit="S" size="M" />
      <span className="rounded-pill bg-tile/10 px-3 py-1 text-caption text-tile">
        1 card
      </span>
    </Well>
  );
}

const SCORING = [
  { rank: "K", suit: "H", label: "Red king", value: "13 points" },
  { rank: "K", suit: "S", label: "Black king", value: "0 points" },
  { rank: "J", suit: "C", label: "Jack", value: "10 points" },
  { rank: "Q", suit: "D", label: "Queen", value: "10 points" },
  { rank: "7", suit: "S", label: "Number card", value: "7 points" },
] as const;

export function HelpScoringVisual() {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {SCORING.map((item) => (
        <li
          key={`${item.rank}-${item.suit}`}
          className="flex flex-col items-center rounded-input border border-glaze/15 bg-ink/40 px-2 py-3 text-center"
        >
          <span aria-hidden="true">
            <CardFace rank={item.rank} suit={item.suit} size="M" />
          </span>
          <span className="mt-2 text-caption text-glaze">{item.label}</span>
          <span className="text-label text-tile">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

interface IconProps {
  className?: string;
}

function ArrowIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h16" />
      <path d="m15 7 5 5-5 5" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

function EyeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function SwapIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h13" />
      <path d="m14 5 3 3-3 3" />
      <path d="M20 16H7" />
      <path d="m10 13-3 3 3 3" />
    </svg>
  );
}
