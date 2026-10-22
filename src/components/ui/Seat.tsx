import { cn } from "@/lib/format";
import { Avatar } from "./Avatar";

interface SeatProps {
  name: string;
  status: string;
  active?: boolean;
  connected?: boolean;
  isHost?: boolean;
  className?: string;
}

/**
 * The design's Seat component (Figma `Component bench` 2:172):
 * Idle / Active / Offline — a 36 px avatar, a name and a one-line status.
 * Orange is reserved for the active seat ring.
 */
export function Seat({
  name,
  status,
  active = false,
  connected = true,
  isHost = false,
  className,
}: SeatProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative shrink-0">
        <Avatar name={name} size={36} offline={!connected} />
        {active ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-oranje"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-label font-medium text-tile">
          <span className="truncate">{name}</span>
          {isHost ? <span className="shrink-0 text-caption text-glaze">Host</span> : null}
        </p>
        <p className="truncate text-caption text-glaze">{status}</p>
      </div>
    </div>
  );
}
