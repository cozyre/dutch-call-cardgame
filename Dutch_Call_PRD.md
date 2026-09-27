# Product Requirements Document: Dutch Call (Web)

## 1. Overview
Dutch Call is a real-time, online multiplayer web adaptation of the physical card game "Dutch Call" (rules based on a standard 52-card deck, no jokers). Players join from separate devices, each managing a private grid of face-down cards, racing to empty their deck or end with the lowest total value.

## 2. Goals
- Fully automated digital version of Dutch Call: no physical cards needed.
- Real-time multiplayer across separate devices (3–6 players per game).
- No accounts required — players join with a name only.
- Host-controlled game setup (difficulty, custom settings).
- Fast to build and playable end-to-end for v1 (MVP), with real card graphics and reasonably polished UI.

## 3. Non-Goals (v1)
- No user accounts, login, or persistent stats/history.
- No spectator mode.
- No AI/bot players.
- No mobile native app (web/responsive only).
- No in-game chat/voice (nice-to-have, not MVP).

## 4. Tech Stack
- **Frontend/Framework:** Next.js
- **Real-time layer:** Recommend Next.js + a managed realtime service (e.g., Supabase Realtime or Pusher) to avoid running/maintaining a standalone WebSocket server; Socket.io is a fallback if a self-hosted long-lived server is acceptable for deployment.
- **State authority:** Server-authoritative game state (server/realtime backend holds true deck/hand state; clients only render what they're permitted to see) to prevent cheating (e.g., seeing other players' cards).
- **Hosting:** Vercel-friendly setup preferred given Next.js.

## 5. Core User Flows

### 5.1 Create/Join a Game
- Host lands on homepage → clicks "Create Game" → enters name → gets a **room code** and a **shareable link** (both work interchangeably).
- Other players → enter name + room code, OR click the shared link directly (auto-fills code) → join lobby.
- Lobby shows list of joined players (names), min 3 / max 6 required to start.

### 5.2 Host Configures Game
- Only the host sees difficulty/settings controls in the lobby:
  - Easy (4 cards/player, 1 deck)
  - Normal (6 cards/player, 1 deck)
  - Tricky (8 cards/player, 2 decks)
  - Hard (10 cards/player, 2 decks)
  - Memorizer (12 cards/player, 3 decks)
  - Custom (host sets cards/player and # of decks; system validates enough center-pile cards remain for fair turns)
- Host clicks "Start Game" once 3–6 players have joined.

### 5.3 Game Setup (automated)
- System shuffles the appropriate number of decks, deals each player their grid (face-down), and forms the center pile + empty discard pile.
- Each player privately views **one** card of their choice from their own grid for a few seconds, then it's hidden again (client-side reveal, server tracks that this "peek" happened).

### 5.4 Turn Loop
1. Active player draws top card of center pile; only they see its value.
2. They choose: **Swap** (pick a card from their grid to exchange — swapped-out card goes face-up to discard pile) or **Discard** (drawn card goes straight to discard pile).
3. On any discard event, **all players simultaneously** get a short window to discard matching-value cards from their own grid:
   - Correct match → card discarded, ability (if Jack/Queen) resolves.
   - Incorrect guess → card returned to grid face-down + a penalty card added face-down to their grid.
4. Ability resolution (in discard order):
   - **Jack:** each Jack discarded lets all players peek at one card of their own (per jack; can't repeat same peek from same batch).
   - **Queen:** the discarding player gets one swap-any-two-cards action per Queen discarded (between any two players' decks, or none if they choose not to).
5. Turn passes to next player (clockwise/join order).

### 5.5 Dutch Call
- Any player with exactly 1 card left, on their turn, may declare "Dutch Call" instead of a normal turn.
- This ends that player's turn immediately; once play comes back around to them, the game ends for everyone.
- Cannot be stacked, canceled, or blocked by any other player/action.

### 5.6 End of Game
- Game ends when: a player empties their grid, OR the center pile runs out (with the final round completing — last card drawn, one final chance for match-discards, then game over), OR a Dutch Call fully rotates back to the caller.
- If a player has 0 cards, they win outright.
- Otherwise, all remaining players' grids are tallied by card value (red King = 13, black King = 0, Jack/Queen = 10, number cards = face value) — lowest total wins.
- Results screen shows final standings, each player's revealed grid, and total values.

## 6. Card Values & Abilities Reference (from rules)
| Card | Value |
|---|---|
| Red King | 13 |
| Black King | 0 |
| Jack / Queen | 10 |
| Number cards | face value |

- **Jack (on discard):** all players may look at one card in their own deck (one peek per Jack discarded in that batch).
- **Queen (on discard):** discarding player may perform one cross-deck swap per Queen discarded; swaps can be self↔other or other↔other; may decline.

## 7. Key Screens
1. **Home** — Create Game / Join Game
2. **Lobby** — player list, room code/link, host-only settings panel, Start button
3. **Game Board** — player's own grid (interactive), opponents' grids (face-down placeholders + names), center pile, discard pile (top card visible), current turn indicator, action prompts (swap/discard, match window, ability prompts)
4. **Results** — final standings, revealed grids, winner callout

## 8. Functional Requirements Summary
- Real-time sync of: player list, turn order/current turn, center pile count, discard pile top card, per-player grid state (with correct visibility rules — a player only fully "knows" cards they've peeked at; server enforces this).
- Server-side validation of all actions (draw, swap, discard, match-discard correctness, ability usage, Dutch Call eligibility) — client cannot self-report a card's value to prevent cheating.
- Turn timer or at least a clear "waiting on X" indicator (optional soft timer for MVP to keep games moving — flag for design decision).
- Reconnect handling: if a player's connection drops mid-game, they should be able to rejoin the same room code and resume their seat.

## 9. Visual Design
- Real playing card graphics/images (standard 52-card deck imagery) for all rendered cards, front and back designs.
- Face-down cards show a uniform card-back graphic in each player's grid.
- Clear visual distinction between "your grid" (interactive) vs. "opponent grids" (locked/face-down) vs. center/discard piles.

## 10. Resolved MVP Decisions
- **Turn time limits:** Each active player has 30 seconds after drawing from the center pile to inspect the card and choose Swap or Discard. If they make no choice, the server discards the drawn card by default. If they choose Swap but then remain inactive, the server completes the swap automatically using the selected grid card; if no grid card was selected, it falls back to discarding the drawn card. After a discard, the matching-card window also lasts 30 seconds. These timers are server-enforced and visible to all relevant players.
- **Card grid layout:** Each player's grid uses a fixed responsive grid with no more than 4 rows and 5 columns. The layout may use fewer rows or columns when the player's card count is smaller, but it must never exceed either limit.
- **Reconnect grace period:** A disconnected player has 1 minute to reconnect using the same room code and resume their seat before the seat is forfeited or handed to the game's fallback handling.
- **Multiple decks:** Additional standard decks are treated as one combined center-pile/deck source. The UI does not show separate deck sources. The server must still build the correct contents from 2 or 3 standard 52-card decks for the applicable difficulty settings, with no jokers.
- **Sound effects and animations:** Out of scope for the MVP. Keep the initial implementation simple and add sound effects and smooth animations in a later polish pass.

## 11. Success Criteria (MVP)
- 3–6 players on separate devices can create/join a room via code or link and complete a full game end-to-end with no rule violations possible client-side.
- All core mechanics work: draw, swap, discard, match-discard with penalty, Jack/Queen abilities, Dutch Call, scoring/win conditions.
- Game state stays in sync across all clients in real time with no manual refresh needed.
