# AGENTS.md

## Project
Web adaptation of the "Dutch Call" card game: real-time multiplayer (3-6 players), server-authoritative, no accounts.

## Status
- Greenfield: no code or config yet (README, MIT LICENSE, `.gitattributes` only). Single initial commit on `main`.
- Product spec lives in `Dutch_Call_PRD.md` — read it before implementing any game logic. It is the source of truth for rules, scoring, screens, and (unresolved) design questions.

## Stack (planned — from PRD)
- Next.js (App Router), React, TypeScript, npm. Vercel-friendly.
- Realtime: managed service (Supabase Realtime or Pusher preferred); Socket.io only as fallback. No standalone WS server planned.
- Not scaffolded yet; the usual `npm run dev / build / start / lint` won't exist until `create-next-app` runs.

## Rules agents will likely get wrong (from PRD)
- Server-authoritative state: the server holds true hand/deck state; clients must never self-report card values (anti-cheat). "Peeked" cards are the only ones a client may know.
- scoring: red King = 13, black King = 0, Jack/Queen = 10, number = face value; lowest total wins.
- Difficulty presets change cards/player and deck count (Easy 4/1 to Memorizer 12/3), plus Custom.
- Cards: standard 52-card deck, no jokers.
- Joining is name-only (host creates room; players join by code or shareable link).