# Handover — Phase 6: Polish

_Phase 5 (rematch + practice vs bots) is **done** and verified. See `AGENTS.md` and `IMPLEMENTATION_PLAN.md` §10 for what landed and the recorded decisions._

## State at handover

- 225 vitest cases pass; lint, tsc, production build and `npm run sim` (5/5 games, 0 leaks) are clean.
- **Phase 5 shipped:** host-only `room:rematch` (immediate fresh deal, same seats/settings, fresh seed — no lobby round-trip); the results screen has the host-only **Play again** button with the non-host waiting copy; refusals show as a toast over the results screen.
- **Practice vs bots shipped:** Home ghost button → `/practice`, which reuses the lobby screen (you as host + three `LocalGameClient` bots, editable settings) with a "Practice table" panel instead of the room-code panel; the board header reads `Practice table · <difficulty>`. Strictly in-process — bots never join a real room (plan §13 exception).
- The room page body was extracted into `src/components/room/RoomView.tsx` (`mode: "network" | "local" | "practice"`); `/room/[code]` and `/practice` are thin wrappers.
- The local bots now also Dutch Call when `canDutchCall`, decided only from their own `projectView`.

## How to test personally

Open the app → **Play with bots** → pick a difficulty (or custom cards/decks) → Start game → play the full loop → on the results screen **Play again** re-deals. `?local=1` on a room URL remains the instant-start dev harness.

## Phase 6 work order (from the plan §11)

1. Reconnect UX polish.
2. Animations (card flip, pile movement) — the design's motion was deliberately deferred; every state is still static.
3. Optional sound effects.
4. Responsive/mobile layout pass + accessibility (keyboard, focus, contrast).
5. A final rules audit against the PRD and this plan (§12 table).

## Notes for the next agent

- The engine (`src/game/**`) and the anti-cheat boundaries are untouched by Phase 5 — keep them that way (plan §14 gotchas).
- Known v1 limitation (recorded in §10): a room that drops below 3 seats at results cannot be refilled; the rematch is refused with `NOT_ENOUGH_PLAYERS`. Leave it unless the product changes.
- `GameBoard` renders the `EventToast` in both board branches and clears the event feed when the phase leaves `over`; the `Play again` pending state lives in `GameBoard` (cleared by the error subscription, since a refusal sends no new view).
- `AGENTS.md` carries an auto-generated Next.js agent-rules block appended by `next dev`; committing it keeps the tree clean.
- Figma was unreachable at Phase 5 build time (no Composio/MCP): the results button placement was approved as Play again primary above Leave room secondary. If the frames become reachable again, re-check against `3:187` / `5:160`.
