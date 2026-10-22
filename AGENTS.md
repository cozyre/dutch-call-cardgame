# AGENTS.md

## Project
Web adaptation of the "Dutch Call" card game: real-time multiplayer (3-6 players), server-authoritative, no accounts.

## Status
- Scaffolded: Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4. `npm run dev / build / start / lint` exist.
- Phase 0 done: deps installed, `src/game/types.ts` contract (§4 of the plan) + `src/game/errors.ts`, `src/lib/env.ts`, `vitest.config.mts`, socket.io server bootstrap on :3001, placeholder Home. `npm run dev` starts Next on :3000 and the game server on :3001.
- **Phase 1 done (pure engine).** `src/game/**` implements: `rng.ts` (mulberry32), `deck.ts` (build/deal), `values.ts` (card values), `difficulty.ts` (5 presets + custom validation), `engine.ts` (the reducer: `applyAction` / `applyTimeout` / `createLobbyState`), `abilities.ts` (Jack/Queen), `scoring.ts` (standings), `view.ts` (`projectView`, the anti-cheat boundary), `testkit.ts` (fixtures + random-game harness). 127 vitest cases pass; `npm run bench` plays 1000 games with 0 invariant violations. The engine is pure — no `Date.now()`, no `Math.random()`, no I/O; ESLint enforces the import boundary.
- **Phase 2 done (authoritative game server).** `src/server/**` implements: `protocol.ts` (zod wire schemas, strict — a self-reported card value is rejected), `session.ts` (HMAC seat tokens + socket↔seat binding), `rooms.ts` (`RoomManager`: create/join/resume/settings/forfeit), `transport.ts` (Socket.io adapter; per-socket `game:view` projection), `timers.ts` (`DeadlineSweeper`: 30s decision windows, 8s reveals, 60s reconnect grace), `app.ts` (`createGameServer` factory), `index.ts` (bootstrap), `bots.ts` (headless bot client). `src/game/roster.ts` holds the pure roster helpers (seat removal only at a safe step boundary). Tests: `src/server/{protocol,rooms,integration}.test.ts` — 169 vitest cases pass in total. `npm run sim` plays headless games over real sockets and checks for leaks.
- Contract amendments made in Phase 2 (all recorded in `IMPLEMENTATION_PLAN.md`): the `burned` event's `rank` is `Rank | null` (a wrong burn discloses nothing); `GameView` gained `queenResolverId`; the protocol gained `room:settings` and `room:leave`.
- Phase 3 (menus / lobby) is next — see `IMPLEMENTATION_PLAN.md` §8.
- Product spec lives in `Dutch_Call_PRD.md` — read it before implementing any game logic. It is the source of truth for rules, scoring, and screens.
- Build plan lives in `IMPLEMENTATION_PLAN.md` — read it before writing any code. It defines build order, module boundaries, the type contracts every layer codes against, and the PRD's unresolved rule questions (resolved, with defaults).

## Stack (decided — see IMPLEMENTATION_PLAN.md §1)
- Next.js (App Router), React, TypeScript, npm. Frontend → Vercel.
- Realtime: a dedicated authoritative game server process (Socket.io) holding room state and timers. Game server → Fly.io/Railway/Render via Docker. The engine in `src/game/**` is transport-agnostic.
- Card art: in-repo SVG components (no external assets, no licensing risk).
- Tests: vitest. Engine-only game simulation harness for rule validation.

## Rules agents will likely get wrong (from PRD)
- Server-authoritative state: the server holds true hand/deck state; clients must never self-report card values (anti-cheat). "Peeked" cards are the only ones a client may know.
- A reveal binds to the **card**, not to the grid slot. If the slot's card is replaced (queen swap, swap-draw) the reveal dies — otherwise a player sees a card they never peeked.
- A **wrong burn discloses nothing**: the card returns to its slot face down and the `burned` event carries `rank: null`. Do not "helpfully" send the rank.
- A queen swap may pick **any** two cards: the holder's own grid and another player's, two other players', or two cards of one grid. A card cannot be swapped with itself.
- scoring: red King = 13, black King = 0, Jack/Queen = 10, number = face value; lowest total wins.
- Difficulty presets change cards/player and deck count (Easy 4/1 to Memorizer 12/3), plus Custom.
- Cards: standard 52-card deck, no jokers.
- Joining is name-only (host creates room; players join by code or shareable link).
- A client may act on a view that has gone stale; the server must **refuse** that action rather than apply it. A refusal is correct behaviour.

## Before writing any code
- Read `IMPLEMENTATION_PLAN.md` in full. It carries the type contracts (§4), the phase exit criteria, and the resolved rule ambiguities (§12).
- `IMPLEMENTATION_PLAN.md` §14 lists the gotchas that break this game most often — engine purity, per-player view projection, rank-based matching, match-window scope.