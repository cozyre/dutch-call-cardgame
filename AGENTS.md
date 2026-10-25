# AGENTS.md

## Project
Web adaptation of the "Dutch Call" card game: real-time multiplayer (3-6 players), server-authoritative, no accounts.

## Status
- Scaffolded: Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4. `npm run dev / build / start / lint` exist.
- Phase 0 done: deps installed, `src/game/types.ts` contract (§4 of the plan) + `src/game/errors.ts`, `src/lib/env.ts`, `vitest.config.mts`, socket.io server bootstrap on :3001, placeholder Home. `npm run dev` starts Next on :3000 and the game server on :3001.
- **Phase 1 done (pure engine).** `src/game/**` implements: `rng.ts` (mulberry32), `deck.ts` (build/deal), `values.ts` (card values), `difficulty.ts` (5 presets + custom validation), `engine.ts` (the reducer: `applyAction` / `applyTimeout` / `createLobbyState`), `abilities.ts` (Jack/Queen), `scoring.ts` (standings), `view.ts` (`projectView`, the anti-cheat boundary), `testkit.ts` (fixtures + random-game harness). 127 vitest cases pass; `npm run bench` plays 1000 games with 0 invariant violations. The engine is pure — no `Date.now()`, no `Math.random()`, no I/O; ESLint enforces the import boundary.
- **Phase 2 done (authoritative game server).** `src/server/**` implements: `protocol.ts` (zod wire schemas, strict — a self-reported card value is rejected), `session.ts` (HMAC seat tokens + socket↔seat binding), `rooms.ts` (`RoomManager`: create/join/resume/settings/forfeit), `transport.ts` (Socket.io adapter; per-socket `game:view` projection), `timers.ts` (`DeadlineSweeper`: 30s decision windows, 8s reveals, 60s reconnect grace), `app.ts` (`createGameServer` factory), `index.ts` (bootstrap), `bots.ts` (headless bot client). `src/game/roster.ts` holds the pure roster helpers (seat removal only at a safe step boundary). Tests: `src/server/{protocol,rooms,integration}.test.ts` — 169 vitest cases pass in total. `npm run sim` plays headless games over real sockets and checks for leaks.
- Contract amendments made in Phase 2 (all recorded in `IMPLEMENTATION_PLAN.md`): the `burned` event's `rank` is `Rank | null` (a wrong burn discloses nothing); `GameView` gained `queenResolverId`; the protocol gained `room:settings` and `room:leave`.
- **Phase 3 done (Home + lobby):** `src/lib/client/**` (socket client with pending queue, seat-token storage, resume); `src/components/{home,lobby,ui,card}/**`; Home create/join (code + `?room=` prefill) and `/room/[code]` lobby with invite copy, seat list, host-only settings (presets + custom steppers, inline errors), start, leave and reconnect. The game board is still a Phase 4 placeholder (`GameInProgress`). Also landed: the provided logo/favicon (`public/logo.png`, `src/app/favicon.ico`, Home title lockup), a shared accessible How-to-Play dialog (`src/components/help/**`) reachable from Home, Lobby and the game header, an orange-outline `accent` Button variant used by `Leave room`, and the responsive Home layout rules (fan only below `md`; tablet/desktop 482 px centered form; desktop hero appears at `xl`, scaled to 0.92 until `1440`). Verified against the Figma Home/Lobby frames at 390 and 1440, with breakpoint/browser checks at 390/768/1024/1280/1439/1440. 175 vitest cases pass; lint, tsc and production build are clean.
- Phase 4 (game board) is next — see `IMPLEMENTATION_PLAN.md` §9. The UI/UX design for every screen already exists in Figma; read it before writing any component (see "UI/UX design system" below).
- Product spec lives in `Dutch_Call_PRD.md` — read it before implementing any game logic. It is the source of truth for rules, scoring, and screens.
- Build plan lives in `IMPLEMENTATION_PLAN.md` — read it before writing any code. It defines build order, module boundaries, the type contracts every layer codes against, and the PRD's unresolved rule questions (resolved, with defaults).

## Stack (decided — see IMPLEMENTATION_PLAN.md §1)
- Next.js (App Router), React, TypeScript, npm. Frontend → Vercel.
- Realtime: a dedicated authoritative game server process (Socket.io) holding room state and timers. Game server → Fly.io/Railway/Render via Docker. The engine in `src/game/**` is transport-agnostic.
- Card art: in-repo SVG components (no external assets, no licensing risk).
- Tests: vitest. Engine-only game simulation harness for rule validation.

## UI/UX design system — the Figma file is the contract
- **Design file:** "Dutch Call – UI/UX Design (Mobile + Desktop)" — https://www.figma.com/design/z6RIAsrYU0eNdaC62WaCa9 (file key `z6RIAsrYU0eNdaC62WaCa9`). Pages: `Foundations & Components` (`0:1`), `Mobile · 390` (`1:4`), `Desktop · 1440` (`1:5`).
- **The rule:** any screen you build or touch must match that design. Never invent a colour, font, radius, spacing step, breakpoint or layout. The tokens mirrored below are a copy of the design's `Foundations` frame (`2:83`) — **if this file and Figma disagree, Figma wins and you fix this file in the same change.**
- Read the design before writing UI code, and keep the two in sync: PRD/plan own the *rules*, Figma owns the *look*.

### Design tokens (mirror of the Figma `Foundations` frame)
Colours — one orange action colour on a Delft-tile blue table:

| token | value | used for |
|---|---|---|
| `table/ink` | `#0E1B45` | table background |
| `table/raised` | `#182F78` | panels, seats |
| `delft` | `#2349A8` | card back, avatars |
| `delft-light` | `#3F66C9` | card-back accent |
| `tile` | `#F5F7FD` | card face, text on dark |
| `tile-dim` | `#DCE3F5` | card edge |
| `glaze` | `#A9BCEB` | secondary text, 1px strokes |
| `oranje` | `#FF7A1A` | primary action, active turn — **never decorative** |
| `suit-red` | `#D6303F` | hearts, diamonds, red King |
| `success` | `#3FCF9B` | correct match |
| `danger` | `#FF5C6C` | wrong match, penalty |

Type — **Bricolage Grotesque** for UI, **Fraunces** for card faces:

| token | size / line-height | weight |
|---|---|---|
| `display/xl` | 64 / 68 (tracking −2) | ExtraBold |
| `display/l` | 40 / 44 | ExtraBold |
| `heading/h1` | 28 / 34 | Bold |
| `heading/h2` | 20 / 26 | SemiBold |
| `body/default` | 16 / 24 | Regular |
| `label/default` | 14 / 20 | Medium |
| `caption` | 12 / 16 | Medium |
| `code/room` | 52 / 56 (tracking +4) | ExtraBold |

Layout & behaviour (design's own rules):
- Breakpoints: mobile `0–767` (design at 390), desktop `768+` (design at 1440, content max-width **1200**).
- Spacing scale **4 / 8 / 12 / 16 / 24 / 32 / 48**. Radius: **card 10, input 14, panel 20, pill 999**. Touch targets ≥ 48 px; primary buttons 52 px tall and full-width on mobile.
- Card grid: max **4 rows × 5 columns**; `columns = ceil(cards / rows)`; your grid uses L/M cards, opponents use S. Mobile: ≤ 6 cards use L (3 columns), 7+ use M (4–5 columns). Desktop: your row L, opponents S in 3 columns. **Cards wrap before they shrink.**
- Orange marks the active turn and the one action that advances it: primary button, active seat ring, timer pill. Nothing else.
- Server timers (30 s) are always visible as a countdown pill; reconnect grace is 1 min. Hidden cards always show the tile back.
- Motion and sound are out of scope for MVP — every state is static. (The design's "peek re-hides after ~3 s" is client-side only; the server reveal window stays 8 s per plan §12 A5, and a client must never keep a value past it.)

### Components (Figma `Component bench` frame `2:172`)
- **Card** — `Type` Back/Black/Red × `Size` S/M/L. Sizes: S 44×62, M 64×90, L 92×130. Rank/suit art in the mock is a placeholder: render the real deck from the server-provided card id, keep the tile card back.
- **Button** — Primary / Secondary / Ghost / Accent, 52 px tall. Accent is the orange-outline variant (`Leave room`) and is not a second primary action.
- **Seat** — Idle / Active / Offline: 36 px avatar, name, status (`6 cards`, `Their turn · 0:24`, `Reconnecting 0:42`).
- **How to play** — shared native `<dialog>` + trigger (`src/components/help/**`), used on Home, Lobby and the game header. Native focus trap/Escape, X/backdrop close, focus returns to the trigger.

### Screens (frame ids to implement against)
- Mobile 390: Home `3:79` · Lobby (host) `3:125` · Board, your turn + drawn card `4:61` · Board, match window `4:187` · Results `3:187`.
- Desktop 1440: Home `5:2` · Lobby (host) `5:74` · Board, your turn `5:351` · Results `5:160`.
- Home responsive rules: fan only below `md`; `md–1279` is the 482 px centered form with no hero; `xl` (1280) shows the desktop hero scaled to `0.92`; `≥1440` is full scale on the 1200 px content rail. The hero may run past the rail but must never clip or create horizontal overflow.
- Mobile board: opponents scroll horizontally, action sheet pinned to the bottom. Desktop board: **360 px turn sidebar on the right**, opponents across the top, your cards at the bottom.
- Turn states to cover: waiting for others → your turn: draw → drawn: swap or discard (30 s) → match window for everyone (30 s) → Jack peek → Queen swap (pick two cards, or skip) → Dutch Call (only with exactly 1 card) → disconnected seat (1 min grace).
- Copy: say what happened and what to do, no apologies (`Wrong guess — penalty card added.`, `Waiting for a player…`, `Priya lost connection`, `Reconnecting 0:42`).
- Not drawn yet, but same tokens: Jack/Queen ability prompts, Dutch Call confirm, custom-difficulty stepper, join-by-link error (room full / not found), reconnect screen.

### Reading the design with Composio (Figma toolkit)
The Composio CLI is a Linux/macOS binary — on this Windows box run it inside WSL (`wsl -d Ubuntu -- bash -lc '...'`, binary at `~/.local/bin/composio`). The CLI is already logged in with an **active Figma connection** (`figma_briggs-gorse`), so no re-auth is needed.

```bash
composio tools list figma                                    # 52 Figma tools
composio execute FIGMA_GET_FILE_METADATA -d '{"file_key":"z6RIAsrYU0eNdaC62WaCa9"}'
composio execute FIGMA_GET_FILE_JSON -d '{"file_key":"z6RIAsrYU0eNdaC62WaCa9","depth":2}'          # page + frame tree
composio execute FIGMA_GET_FILE_JSON -d '{"file_key":"z6RIAsrYU0eNdaC62WaCa9","ids":"4:61","depth":6}'  # one screen
composio execute FIGMA_DOWNLOAD_FIGMA_IMAGES -d '{"file_key":"...","images":[{"node_id":"2:92","file_name":"swatch.png","format":"svg"}]}'
```
Caveats: Figma rate-limits the file endpoint (HTTP 429) — space calls out, one screen per minute is safe; and the connected token lacks `file_variables:read`, so `FIGMA_EXTRACT_DESIGN_TOKENS` / `FIGMA_GET_LOCAL_VARIABLES` return empty/403 — read the tokens from the `Foundations` frame instead. Large responses are written to a file (`storedInFile: true`) rather than stdout.

### Implementing the tokens
- Tailwind v4 is CSS-first: put the tokens in the `@theme` block of `src/app/globals.css` (`--color-ink: #0e1b45;` …, `--radius-card: 10px;` …) and consume them as utilities (`bg-ink`, `rounded-card`). The default `md` breakpoint is 768 px, which already matches the design.
- Load the fonts with `next/font/google` (`Bricolage_Grotesque`, `Fraunces`) and expose them as `--font-ui` / `--font-display` in `@theme`.
- Reuse the plan's `src/components/card/` (plan §9) for `CardFace` / `CardBack`; the design's tile-back replaces the plan's "one uniform SVG back" only in styling — keep it an in-repo SVG (no external assets).

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
- For anything that renders, also read the "UI/UX design system" section above and the Figma frames it points at. Figma is the look, the PRD/plan are the rules — never trade one for the other.