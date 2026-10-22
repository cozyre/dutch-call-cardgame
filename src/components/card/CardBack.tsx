import { cn } from "@/lib/format";

export type CardSize = "S" | "M" | "L";

export const CARD_SIZES: Record<CardSize, { width: number; height: number }> = {
  S: { width: 44, height: 62 },
  M: { width: 64, height: 90 },
  L: { width: 92, height: 130 },
};

interface CardBackProps {
  size?: CardSize;
  className?: string;
}

/**
 * The design's tile card back: Delft blue, a light inner border, a diamond
 * motif and four corner dots. In-repo SVG — no external assets.
 */
export function CardBack({ size = "M", className }: CardBackProps) {
  const { width, height } = CARD_SIZES[size];
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 92 130"
      className={cn("block", className)}
      role="img"
      aria-label="Face-down card"
    >
      <rect width="92" height="130" rx="10" fill="var(--color-delft)" />
      <rect
        x="8"
        y="8"
        width="76"
        height="114"
        rx="4"
        fill="none"
        stroke="var(--color-tile)"
        strokeWidth="1.5"
      />
      <path
        d="M46 39 L70.84 65 L46 91 L21.16 65 Z"
        fill="var(--color-delft-light)"
        stroke="var(--color-tile)"
        strokeWidth="1.5"
      />
      <path d="M46 53.3 L57.18 65 L46 76.7 L34.82 65 Z" fill="var(--color-tile)" />
      <circle cx="18.4" cy="18.4" r="2.76" fill="var(--color-tile)" />
      <circle cx="73.6" cy="18.4" r="2.76" fill="var(--color-tile)" />
      <circle cx="18.4" cy="111.6" r="2.76" fill="var(--color-tile)" />
      <circle cx="73.6" cy="111.6" r="2.76" fill="var(--color-tile)" />
    </svg>
  );
}
