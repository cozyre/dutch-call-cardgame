/**
 * Seat-token and name storage. A seat token is the only proof of a seat, so
 * it is kept per room code and survives a refresh (plan §8, "Resume").
 */

const SEAT_PREFIX = "dutchcall:seat:";
const NAME_KEY = "dutchcall:name";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function saveSeatToken(code: string, seatToken: string): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(SEAT_PREFIX + code.toUpperCase(), seatToken);
}

export function loadSeatToken(code: string): string | null {
  if (!hasStorage()) return null;
  return window.localStorage.getItem(SEAT_PREFIX + code.toUpperCase());
}

export function clearSeatToken(code: string): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(SEAT_PREFIX + code.toUpperCase());
}

export function savePlayerName(name: string): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(NAME_KEY, name);
}

export function loadPlayerName(): string {
  if (!hasStorage()) return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}
