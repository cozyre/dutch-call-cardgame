"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * A shared wall-clock store. Components subscribe only while a countdown is
 * meaningful — a server deadline, a live reveal or a reconnect grace window —
 * so the interval runs (and re-renders happen) only when a clock is live.
 *
 * All timers on the board are display-only (plan §9): the server executes
 * the timeouts; this hook just keeps the countdowns honest.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let ticker: ReturnType<typeof setInterval> | null = null;
/** Cached snapshot so `getSnapshot` stays stable between ticks. */
let snapshot = 0;

function ensureTicking(): void {
  if (ticker) return;
  snapshot = Date.now();
  ticker = setInterval(() => {
    snapshot = Date.now();
    for (const listener of listeners) listener();
  }, 250);
}

function maybeStop(): void {
  if (ticker && listeners.size === 0) {
    clearInterval(ticker);
    ticker = null;
  }
}

function subscribe(onChange: Listener): () => void {
  listeners.add(onChange);
  ensureTicking();
  return () => {
    listeners.delete(onChange);
    maybeStop();
  };
}

function getSnapshot(): number {
  return snapshot;
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * The client wall clock, ticking at 250 ms while `active`. With
 * `active = false` nothing is scheduled and the last value stays frozen,
 * which is what an idle board wants.
 */
export function useNow(active: boolean): number {
  const subscribeActive = useCallback(
    (onChange: Listener) => (active ? subscribe(onChange) : () => {}),
    [active],
  );
  return useSyncExternalStore(subscribeActive, getSnapshot, getServerSnapshot);
}

/** Tracks the design's desktop breakpoint (≥ 768 px). */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
