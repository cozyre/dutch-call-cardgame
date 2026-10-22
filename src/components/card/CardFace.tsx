import type { Rank, Suit } from "@/game/types";
import { cn } from "@/lib/format";
import { CARD_SIZES, type CardSize } from "./CardBack";
import { SUIT_PATHS } from "./SuitGlyph";

type Point = [number, number];

const PIPS: Partial<Record<Rank, Point[]>> = {
  "2": [
    [46, 38],
    [46, 92],
  ],
  "3": [
    [46, 30],
    [46, 65],
    [46, 100],
  ],
  "4": [
    [32, 38],
    [60, 38],
    [32, 92],
    [60, 92],
  ],
  "5": [
    [32, 38],
    [60, 38],
    [46, 65],
    [32, 92],
    [60, 92],
  ],
  "6": [
    [32, 32],
    [60, 32],
    [32, 65],
    [60, 65],
    [32, 98],
    [60, 98],
  ],
  "7": [
    [32, 32],
    [60, 32],
    [46, 48],
    [32, 65],
    [60, 65],
    [32, 98],
    [60, 98],
  ],
  "8": [
    [32, 32],
    [60, 32],
    [46, 48],
    [32, 65],
    [60, 65],
    [46, 82],
    [32, 98],
    [60, 98],
  ],
  "9": [
    [32, 28],
    [60, 28],
    [32, 52],
    [60, 52],
    [46, 65],
    [32, 78],
    [60, 78],
    [32, 102],
    [60, 102],
  ],
  "10": [
    [32, 26],
    [60, 26],
    [46, 39],
    [32, 52],
    [60, 52],
    [32, 78],
    [60, 78],
    [46, 91],
    [32, 104],
    [60, 104],
  ],
};

interface CardFaceProps {
  rank: Rank;
  suit: Suit;
  size?: CardSize;
  className?: string;
  /** Overrides the accessible label; defaults to "7 of hearts". */
  label?: string;
}

const SUIT_NAMES: Record<Suit, string> = {
  S: "spades",
  H: "hearts",
  D: "diamonds",
  C: "clubs",
};

const RANK_NAMES: Record<Rank, string> = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king",
};

/**
 * A real card face rendered from the server-provided rank + suit.
 * Vector pips for 2–10, a large suit for the ace, and a letterform for the
 * court cards. Red for hearts/diamonds, ink for spades/clubs.
 */
export function CardFace({ rank, suit, size = "M", className, label }: CardFaceProps) {
  const { width, height } = CARD_SIZES[size];
  const color = suit === "H" || suit === "D" ? "var(--color-suit-red)" : "var(--color-ink)";
  const suitPath = SUIT_PATHS[suit];

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 92 130"
      className={cn("block", className)}
      role="img"
      aria-label={label ?? `${RANK_NAMES[rank]} of ${SUIT_NAMES[suit]}`}
    >
      <rect
        width="92"
        height="130"
        rx="10"
        fill="var(--color-tile)"
        stroke="var(--color-tile-dim)"
        strokeWidth="1"
      />

      <CornerIndex rank={rank} suitPath={suitPath} color={color} />
      <CornerIndex
        rank={rank}
        suitPath={suitPath}
        color={color}
        transform="translate(85 122) rotate(180)"
      />

      {rank === "A" ? (
        <g transform="translate(34 55)" fill={color}>
          <path d={suitPath} transform="scale(1.42)" />
        </g>
      ) : PIPS[rank] ? (
        <g fill={color}>
          {PIPS[rank]!.map(([x, y]) => (
            <g key={`${x}-${y}`} transform={`translate(${x - 6} ${y - 6})`}>
              <path d={suitPath} transform="scale(0.5)" />
            </g>
          ))}
        </g>
      ) : (
        <g fill={color}>
          <text
            x="46"
            y="76"
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontSize="34"
            fontWeight="700"
          >
            {rank}
          </text>
          <g transform="translate(38 82)">
            <path d={suitPath} transform="scale(0.66)" />
          </g>
        </g>
      )}
    </svg>
  );
}

interface CornerIndexProps {
  rank: Rank;
  suitPath: string;
  color: string;
  transform?: string;
}

function CornerIndex({ rank, suitPath, color, transform }: CornerIndexProps) {
  return (
    <g transform={transform} fill={color}>
      <g transform="translate(7 8)">
        <text
          x="0"
          y="10"
          fontFamily="var(--font-display)"
          fontSize={rank === "10" ? 11 : 13}
          fontWeight="700"
        >
          {rank}
        </text>
        <g transform="translate(1 13)">
          <path d={suitPath} transform="scale(0.4)" />
        </g>
      </g>
    </g>
  );
}
