# Phase 4 Handover

## Status
Phase 4 has **not been implemented**. The task is postponed because the Figma API still returns HTTP 429 after several hours. The next agent must obtain the board frames before writing the visual board.

- Date: 2026-10-26
- Repo: `C:\coding_stuff\dutch-call-cardgame`
- Branch: `main`
- HEAD: `0fc1a5d phase 3 finishing touches`
- Existing dirty file: `src/components/home/HomeScreen.tsx` (scoring legend commented out). Preserve it.
- `src/components/game/` exists but is empty.
- `src/app/room/[code]/page.tsx` still renders the Phase 3 `GameInProgress` placeholder whenever `view.phase !== "lobby"`.
- 175 Vitest cases pass at the end of Phase 3. No baseline test/build was run during this planning pass.

## User decisions already made
1. Keep the original Phase 4 exit criterion: a full game must be playable in one browser tab against `LocalGameClient` with three simulated opponents, and also over real sockets with three clients.
2. Pull the results screen into Phase 4 instead of waiting for Phase 5.
3. Approved these `GameView` additions: `discardPileCount`, `players[].disconnectedAt`, and `serverNow`.
4. Retry Figma after the rate-limit reset. If it still fails, postpone and update this handover. That retry failed, so this file is the handoff.

## Blocking issue: Figma is rate-limited
Figma file:
- Name: `Dutch Call – UI/UX Design (Mobile + Desktop)`
- Key: `z6RIAsrYU0eNdaC62WaCa9`
- URL: `https://www.figma.com/design/z6RIAsrYU0eNdaC62WaCa9`

Required frames:
- Mobile board, your turn + drawn card: `4:61`
- Mobile board, match window: `4:187`
- Desktop board: `5:351`
- Mobile results: `3:187`
- Desktop results: `5:160`
- Foundations: `2:83`
- Component bench: `2:172`

Attempted after the reset at ~20:11 local / 13:11 UTC:
```text
GET https://api.figma.com/v1/files/z6RIAsrYU0eNdaC62WaCa9/nodes?ids=4%3A61&depth=6
429 {"status":429,"err":"Rate limit exceeded"}
```
Earlier attempts against `FIGMA_GET_FILE_JSON`, `FIGMA_GET_FILE_NODES`, `FIGMA_RENDER_IMAGES_OF_FILE_NODES`, and `FIGMA_DOWNLOAD_FIGMA_IMAGES` also returned 429. Metadata calls worked earlier, but metadata does not contain the board layout/copy.

Next agent options:
1. Wait and retry later; the quota may reset hourly or daily.
2. Ask the user for PNG/SVG exports of the five board/results frames.
3. Only after explicit user approval, implement from `AGENTS.md` tokens and known layout rules. This violates the normal “Figma wins” rule, so do not do it silently.

CLI workaround on this Windows box uses WSL:
```powershell
wsl -d Ubuntu -- bash -lc 'echo <base64-json> | base64 -d | xargs -0 -I@ ~/.local/bin/composio execute FIGMA_GET_FILE_NODES -d @'
```
PowerShell mangles inline `$`; base64 the JSON when using the CLI. Direct Composio tools also work but hit the same Figma API limit.

## Required contract changes
Approve/implement these in `src/game/types.ts`, `src/game/view.ts`, and `src/game/view.test.ts`:
```ts
export interface GameView {
  // ...
  discardPileCount: number;
  serverNow: number;
  players: {
    // ...
    disconnectedAt: number | null;
  }[];
}
```
Projection values:
```ts
discardPileCount: state.discardPile.length,
serverNow: now,
players: state.players.map((player) => ({
  // ...existing fields
  disconnectedAt: player.disconnectedAt,
})),
```
Why:
- `discardPileCount`: the board must show the pile count, not just the top card.
- `disconnectedAt`: accurate `Reconnecting 0:42` countdowns using the server’s 60s grace window.
- `serverNow`: correct client countdowns when the device clock is skewed.

Do not expose card IDs, hidden ranks, opponent grids, or the drawn card to non-active players. Update §4.4 of `IMPLEMENTATION_PLAN.md` with the amended contract. Add tests proving no new card identity leaks.

## Original Phase 4 plan
### 1. Contract and pure helpers
- Apply the three approved view fields and tests.
- Add `src/components/game/game-ui.ts` plus tests for:
  - Grid columns constrained to 4 rows × 5 columns.
  - Mobile own-grid card size: ≤6 cards use L; 7+ use M.
  - Desktop own-grid L and opponent S sizing.
  - `formatClock` clamping/rounding.
  - Queen target identity, distinct-slot validation, same-grid swaps.
  - Event copy, ensuring a wrong burn never includes a rank.
  - Turn/seat status copy.
- Keep rule logic out of React components. Components render `GameView` and dispatch `Action`s.

### 2. Board components
Suggested structure under `src/components/game/`:
- `GameBoard.tsx` — orchestrator, local interaction state, `onView`/`onEvent`/`onError`/`onStatus` subscriptions, clocks.
- `GameHeader.tsx` — room code, How to play, Leave room.
- `OpponentRail.tsx` — mobile horizontal scroll, desktop top row.
- `PlayerGrid.tsx` and `CardSlot.tsx` — face-down cards, reveals, selection, burn/peek/queen targets.
- `CenterPiles.tsx` — draw count, discard top, discard count.
- `TurnPanel.tsx` — 360px desktop right sidebar and pinned mobile action sheet.
- `MatchBanner.tsx` — rank + countdown + burn instruction.
- `DutchCallDialog.tsx` — native accessible confirmation dialog.
- `ConnectionBanner.tsx` — self/opponent reconnect state + grace countdown.
- `EventToast.tsx` — transient event/error feedback.
- Results components for Phase 4: standings table, all grids revealed, winner/co-winner callout.
- `use-now.ts` — a shared ticker that only runs while a deadline/reveal is active.

Replace the `GameInProgress` placeholder in `src/app/room/[code]/page.tsx` with:
```tsx
<GameBoard client={client} view={view} code={code} onLeave={onLeave} />
```

### 3. Interaction mapping
- `setupPeek`: own grid selectable; send `peek`; show the value and hide it after the design’s short client display window.
- `turnStart`: active player gets Draw; show Dutch Call only when `canDutchCall`.
- `awaitChoice`: show the drawn card only to the active player. Selecting an own card sends `selectCard`; Swap sends `swapDrawn`; Discard sends `discardDrawn`.
- `matchWindow`: show rank/countdown. If `canBurn`, own slots send `burn`. Feedback comes from `GameEvent`; never infer a wrong-burn rank locally.
- `awaitPeek`: token holders peek once per token; disable already-peeked slots in the current batch.
- `awaitQueenSwap`: only the resolver acts. Pick any two distinct slots across all grids, including two slots of one grid. Confirm sends `queenSwap`; Skip sends `declineQueen` and spends the token.
- `dutchCall`: native confirmation explaining that the game ends when play returns to the caller.
- `gameOver`: render the Phase 4 results screen from `view.result`.

Every action must use only indices/targets; never send a card value. A stale-action `game:error` becomes a toast, not an optimistic state change.

### 4. Timing and anti-cheat UI
- All timers are display-only; the server executes timeouts.
- `serverNow` gives the client clock offset.
- Hide reveals locally at the design’s short display limit. Never render a value after `revealedUntil`; the server drops reveals after 8s.
- The client may show a revealed value only from `myGrid[].revealed`. Opponent cards remain backs.
- Reset local selection/queen/peek state when the step identity changes (include step kind, turn player, resolver, and deadline).
- Player disconnect countdown uses `disconnectedAt`; self-disconnect may start from `client.onStatus`.
- No animations or sound in Phase 4.

### 5. Layout
- Mobile reference 390: opponents scroll horizontally, own grid at the bottom, action sheet pinned to the bottom with enough body padding.
- Desktop reference 1440: 1200 content rail, 360px turn sidebar on the right, opponents across the top, own cards at the bottom.
- Max 4 rows × 5 columns. Cards wrap before shrinking.
- Reuse `Button`, `Seat`, `Avatar`, `CardBack`, `CardFace`, `HowToPlayButton`.
- Orange only marks active turn, the primary advancing action, and timer treatment.
- Touch targets ≥48px; primary buttons 52px and full width on mobile.

### 6. LocalGameClient requirement
Implement a dev-only `LocalGameClient` because the original exit criterion is retained:
- File: `src/lib/client/local-client.ts`.
- Implements `GameClient` from `src/lib/client/game-client.ts`.
- Holds an in-process `GameState`; uses `createLobbyState`, `applyAction`, `applyTimeout`, `projectView`.
- Creates the player’s seat plus three simulated opponents.
- Drives 30s decision/match/setup/ability windows and 8s reveals with in-process timers.
- Simulated opponents must act only from their own `GameView`; no peeking at truth.
- Expose a dev-only way to select it (e.g. query flag or dev harness) without replacing `SocketGameClient` in production.
- Verify a complete game can be played in one browser tab against it.

### 7. Results in Phase 4
Use `view.result` (`Standing[]`) to render:
- rank, name, total, card count;
- every player’s grid face-up with per-card values;
- winner/co-winner highlight;
- outright-win callout;
- host action.

Scope warning: the current protocol has no rematch action. Phase 5 specified a host-only “Play again” that creates a fresh room with the same players. If that is required now, add a server/protocol rematch flow and update `IMPLEMENTATION_PLAN.md`; otherwise implement the results display without Play again and record the gap.

### 8. Verification
Run:
```text
npm test
npm run lint
npm run build
npm run sim
```
Manual checks:
- Full real-socket game with three clients.
- Full one-tab game against `LocalGameClient`.
- Draw, swap, discard, correct/wrong burn, Jack peek, Queen swap across grids, Dutch Call, timeout, reveal expiry, reconnect, forfeiture.
- 390 / 768 / 1024 / 1280 / 1440 layouts; no horizontal overflow; fixed action sheet does not cover cards.
- Results screen at 390 and 1440.

## Useful files
- `Dutch_Call_PRD.md` — rules source of truth.
- `IMPLEMENTATION_PLAN.md` — architecture; update §4.4 and Phases 4/5 for decisions.
- `AGENTS.md` — design tokens, breakpoints, card/layout constraints, Figma instructions.
- `src/game/types.ts` — `GameView`, `Step`, `Action`, `Standing`.
- `src/game/view.ts` / `src/game/view.test.ts` — projection and leak tests.
- `src/game/engine.ts` — action/timeout semantics.
- `src/game/abilities.ts` — Queen swap validation.
- `src/server/protocol.ts`, `src/server/transport.ts`, `src/server/timers.ts` — socket and timer behaviour.
- `src/lib/client/game-client.ts`, `src/lib/client/socket-client.ts` — client contract and real transport.
- `src/app/room/[code]/page.tsx` — current room route and placeholder.
- `src/components/card/CardBack.tsx`, `CardFace.tsx` — card primitives.
- `src/components/ui/Button.tsx`, `Seat.tsx`, `Avatar.tsx` — reusable primitives.
- `src/components/help/HowToPlayDialog.tsx` — native dialog/focus pattern.
- `src/server/bots.ts` — headless bot implementation.
- `scripts/simulate.ts` — real-socket simulation/leak checks.

## First action for next agent
1. Attempt the required Figma frames again or get exports from the user.
2. Once frames are available, implement contract changes first, then pure helpers, then the board, then LocalGameClient/results, then verification.
3. Update `IMPLEMENTATION_PLAN.md` and the status section of `AGENTS.md` when Phase 4 is actually complete.
