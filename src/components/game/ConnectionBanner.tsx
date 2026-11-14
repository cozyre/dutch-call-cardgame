"use client";

import { cn } from "@/lib/format";
import { formatClock, RECONNECT_GRACE_MS } from "./game-ui";

interface ConnectionBannerProps {
  /** The tab's own socket status. */
  status: "connecting" | "connected" | "disconnected";
  /** When this player's own seat was marked disconnected (server clock). */
  disconnectedAt: number | null;
  now: number;
  desktop?: boolean;
}

/**
 * Reconnect feedback. The seat survives a 60 s grace window, then the server
 * forfeits it — the countdown here is display-only.
 */
export function ConnectionBanner({ status, disconnectedAt, now, desktop = false }: ConnectionBannerProps) {
  if (status === "connected" && disconnectedAt === null) return null;

  const graceLeft =
    disconnectedAt !== null
      ? Math.max(0, RECONNECT_GRACE_MS - Math.max(0, now - disconnectedAt))
      : null;
  const clock = graceLeft !== null ? formatClock(graceLeft) : null;

  return (
    <div
      role="status"
      className={cn(
        "rounded-panel border border-danger bg-raised p-4",
        desktop && "md:p-5",
      )}
    >
      <p className="text-label font-semibold text-danger">
        {status === "connected" ? "You lost connection" : "Reconnecting…"}
      </p>
      <p className="mt-1 text-caption text-glaze">
        {clock
          ? `Your seat waits ${clock} before it is forfeited.`
          : "Trying to reach the game server…"}
      </p>
    </div>
  );
}
