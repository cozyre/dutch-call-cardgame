import type { Suit } from "@/game/types";

export const SUIT_PATHS: Record<Suit, string> = {
  D: "M12 2 L21 12 L12 22 L3 12 Z",
  H: "M12 21 C12 21 2 14.5 2 8.5 C2 5 4.5 3 7 3 C9 3 11 4.5 12 6 C13 4.5 15 3 17 3 C19.5 3 22 5 22 8.5 C22 14.5 12 21 12 21 Z",
  S: "M12 2 C12 2 2 9 2 14 C2 17 4 19 6.5 19 C8 19 9 18.5 10 17.5 C9.5 20 8 21.5 6 22 L18 22 C16 21.5 14.5 20 14 17.5 C15 18.5 16 19 17.5 19 C20 19 22 17 22 14 C22 9 12 2 12 2 Z",
  C: "M12 2 C9.5 2 7.5 4 7.5 6.5 C7.5 7.4 7.7 8.2 8.1 8.9 C7.4 8.5 6.6 8.3 5.8 8.3 C3.4 8.3 1.5 10.2 1.5 12.6 C1.5 15 3.4 16.9 5.8 16.9 C7.2 16.9 8.4 16 9.1 14.8 C8.9 17.6 7.4 20 5 21.5 L19 21.5 C16.6 20 15.1 17.6 14.9 14.8 C15.6 16 16.8 16.9 18.2 16.9 C20.6 16.9 22.5 15 22.5 12.6 C22.5 10.2 20.6 8.3 18.2 8.3 C17.4 8.3 16.6 8.5 15.9 8.9 C16.3 8.2 16.5 7.4 16.5 6.5 C16.5 4 14.5 2 12 2 Z",
};

interface SuitGlyphProps {
  suit: Suit;
  className?: string;
}

/** In-repo, licence-free suit art (no external assets). */
export function SuitGlyph({ suit, className }: SuitGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={SUIT_PATHS[suit]} />
    </svg>
  );
}

export function suitColorClass(suit: Suit): string {
  return suit === "H" || suit === "D" ? "text-suit-red" : "text-ink";
}
