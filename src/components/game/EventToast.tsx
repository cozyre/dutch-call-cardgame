"use client";

import { useEffect } from "react";
import { cn } from "@/lib/format";

export interface ToastItem {
  id: number;
  message: string;
  tone: "neutral" | "success" | "danger";
}

interface EventToastProps {
  toast: ToastItem | null;
  onDismiss: () => void;
}

const TOAST_MS = 4_000;

/**
 * Transient event / error feedback on mobile. The desktop sidebar keeps a
 * "Latest" list instead; both are fed from the same `game:event` stream and
 * are display-only — the view is the state.
 */
export function EventToast({ toast, onDismiss }: EventToastProps) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-24 z-40 flex justify-center md:top-6"
    >
      <p
        className={cn(
          "max-w-[360px] rounded-pill bg-raised px-5 py-3 text-label text-tile shadow-lg shadow-ink/60",
          toast.tone === "success" && "border border-success text-success",
          toast.tone === "danger" && "border border-danger text-danger",
        )}
      >
        {toast.message}
      </p>
    </div>
  );
}

/** The desktop sidebar's "Latest" feed — the last few events, newest last. */
export function EventFeed({ items }: { items: ToastItem[] }) {
  const latest = items.slice(-4);
  return (
    <div className="mt-auto pt-6">
      <p className="text-caption text-glaze">Latest</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {latest.map((item) => (
          <li
            key={item.id}
            className={cn(
              "text-caption",
              item.tone === "danger" ? "text-danger" : "text-glaze",
            )}
          >
            {item.message}
          </li>
        ))}
        {latest.length === 0 ? (
          <li className="text-caption text-glaze">Nothing yet</li>
        ) : null}
      </ul>
    </div>
  );
}
