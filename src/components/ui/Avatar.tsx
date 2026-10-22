import { cn, initials } from "@/lib/format";

type AvatarSize = 36 | 40;

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  /** The viewer's own seat uses the action orange in the lobby. */
  tone?: "delft" | "oranje";
  dimmed?: boolean;
  offline?: boolean;
  className?: string;
}

/** A Delft-tile avatar with initials; 40 px in the lobby, 36 px in-game. */
export function Avatar({
  name,
  size = 40,
  tone = "delft",
  dimmed = false,
  offline = false,
  className,
}: AvatarProps) {
  const text = size === 40 ? "text-label" : "text-caption";
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-semibold",
          text,
          tone === "oranje" ? "bg-oranje text-ink" : "bg-delft text-tile",
          (dimmed || offline) && "opacity-50",
        )}
        style={{ width: size, height: size }}
      >
        {initials(name)}
      </div>
      {offline ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-raised bg-danger"
        />
      ) : null}
    </div>
  );
}
