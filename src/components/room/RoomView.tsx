"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GameBoard } from "@/components/game/GameBoard";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { LobbyFooter } from "@/components/lobby/LobbyFooter";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { PlayerList } from "@/components/lobby/PlayerList";
import { RoomCodePanel } from "@/components/lobby/RoomCodePanel";
import { PracticePanel } from "@/components/lobby/PracticePanel";
import { SettingsPanel } from "@/components/lobby/SettingsPanel";
import { getGameClient } from "@/lib/client/socket-client";
import { getLocalGameClient } from "@/lib/client/local-client";
import { getPracticeGameClient } from "@/lib/client/practice-client";
import {
  clearSeatToken,
  loadPlayerName,
  loadSeatToken,
  savePlayerName,
} from "@/lib/client/storage";
import { normaliseRoomCode } from "@/lib/format";
import { DIFFICULTY_PRESETS } from "@/game/difficulty";
import type { SettingsError } from "@/game/difficulty";
import type { DifficultyPreset, GameSettings, GameView } from "@/game/types";
import type { LobbyView } from "@/server/protocol";
import type { GameClient } from "@/lib/client/game-client";
import type { GameError } from "@/lib/client/game-client";

/**
 * How the room is played:
 * - `network` — the real Socket.io transport (production);
 * - `local` — the dev harness, `/room/CODE?local=1`, three simulated
 *   opponents in-process;
 * - `practice` — the plan §13 exception: the same in-process client opened
 *   as a product entry (`/practice`). Like `local`, but it seats you
 *   automatically in the lobby and never touches seat-token storage.
 */
type RoomMode = "network" | "local" | "practice";

interface RoomViewProps {
  code: string;
  mode: RoomMode;
}

export function RoomView({ code: rawCode, mode }: RoomViewProps) {
  const router = useRouter();
  const code = normaliseRoomCode(rawCode);
  const localDev = mode === "local";
  const practice = mode === "practice";
  const client = useMemo<GameClient>(
    () =>
      practice
        ? getPracticeGameClient()
        : localDev
          ? getLocalGameClient()
          : getGameClient(),
    [practice, localDev],
  );

  const [lobby, setLobby] = useState<LobbyView | null>(client.getCachedLobby());
  const [view, setView] = useState<GameView | null>(client.getCachedView());
  // Deadlines count down against the server's own timeline, so a skewed
  // device clock cannot distort a countdown (the approved `serverNow`). The
  // offset is captured when a view arrives — an event handler, the only
  // place `Date.now()` may be called — and handed to the board as a plain
  // number so no render ever reads the wall clock.
  const [clockOffset, setClockOffset] = useState(0);
  const [name, setName] = useState(() => loadPlayerName());
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<SettingsError[]>([]);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [preset, setPreset] = useState<DifficultyPreset | "custom">("normal");
  const [customCards, setCustomCards] = useState(6);
  const [customDecks, setCustomDecks] = useState(1);

  useEffect(() => {
    const unsubscribeLobby = client.onLobby((next) => {
      setLobby(next);
      setPreset(next.settings.preset === "custom" ? "custom" : next.settings.preset);
      setCustomCards(next.settings.cardsPerPlayer);
      setCustomDecks(next.settings.deckCount);
    });
    const unsubscribeView = client.onView((next) => {
      setClockOffset(next.serverNow - Date.now());
      setView(next);
    });
    const unsubscribeSettings = client.onSettingsError((errors) =>
      setSettingsError(errors),
    );
    const unsubscribeError = client.onError((err) => setError(err.message));

    client.connect();

    const seat = client.getSeat();
    if (practice) {
      // Practice seats you automatically: no join form, no seat-token
      // storage. The generated room code stays invisible — the board
      // header shows "Practice table".
      if (!seat) {
        void client.createRoom(loadPlayerName() || "You");
      }
    } else if (localDev) {
      // The dev harness seats you straight at a fresh local table.
      if (!seat || seat.code !== code) {
        void client.resumeRoom(code, "local-dev-seat");
      }
    } else {
      const token = loadSeatToken(code);
      if (token && (!seat || seat.code !== code)) {
        client.resumeRoom(code, token).catch(() => {
          clearSeatToken(code);
        });
      }
    }

    return () => {
      unsubscribeLobby();
      unsubscribeView();
      unsubscribeSettings();
      unsubscribeError();
    };
  }, [client, code, localDev, practice]);

  async function onJoin() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter your name.");
      return;
    }
    savePlayerName(trimmed);
    setJoining(true);
    try {
      await client.joinRoom(code, trimmed);
    } catch (err) {
      const e = err as GameError;
      setError(e.message ?? "Could not join the room.");
    } finally {
      setJoining(false);
    }
  }

  function copy(text: string, kind: "code" | "link") {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function onLeave() {
    client.leaveRoom();
    // A practice seat was never stored, so there is no token to clear.
    if (!practice) clearSeatToken(code);
    router.push("/");
  }

  function sendSettings(next: GameSettings) {
    setSettingsError([]);
    client.updateSettings(next);
  }

  function onPreset(next: DifficultyPreset) {
    setPreset(next);
    sendSettings({ ...DIFFICULTY_PRESETS[next], preset: next });
  }

  function onCustom() {
    setPreset("custom");
    sendSettings({
      cardsPerPlayer: customCards,
      deckCount: customDecks,
      preset: "custom",
    });
  }

  function onCustomCards(cards: number) {
    setCustomCards(cards);
    sendSettings({ cardsPerPlayer: cards, deckCount: customDecks, preset: "custom" });
  }

  function onCustomDecks(decks: number) {
    setCustomDecks(decks);
    sendSettings({ cardsPerPlayer: customCards, deckCount: decks, preset: "custom" });
  }

  const settingsLabel = lobby
    ? lobby.settings.preset.charAt(0).toUpperCase() + lobby.settings.preset.slice(1)
    : null;

  if (view && view.phase !== "lobby") {
    return (
      <GameBoard
        client={client}
        view={view}
        clockOffset={clockOffset}
        code={code}
        lobby={lobby}
        practice={practice}
        settingsLabel={settingsLabel}
        onLeave={onLeave}
      />
    );
  }

  const players = lobby?.players ?? [];
  const isHost = lobby !== null && lobby.youId !== null && lobby.youId === lobby.hostId;
  const minPlayers = lobby?.minPlayers ?? 3;
  const maxPlayers = lobby?.maxPlayers ?? 6;
  const shareLink =
    typeof window === "undefined" ? "" : `${window.location.origin}/?room=${code}`;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[1200px] px-6 pt-8 pb-10 md:px-0 md:pt-14">
      <LobbyHeader onLeave={onLeave} />

      {!lobby || lobby.youId === null || players.length === 0 ? (
        practice ? null : (
          // Practice seats you before this can render, so the join form
          // only belongs to network and local rooms.
          <section className="mt-5 rounded-panel bg-raised p-6 md:mt-8 md:max-w-[482px]">
            <h2 className="text-h2 text-tile">Join this room</h2>
            <p className="mt-1 text-label text-glaze">
              Enter your name to take a seat.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <TextField
                label="Your name"
                placeholder="Enter your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={24}
                error={error && error.toLowerCase().includes("name") ? error : null}
              />
              <Button
                variant="primary"
                fullWidth
                onClick={onJoin}
                disabled={joining}
              >
                {joining ? "Joining…" : "Join game"}
              </Button>
              {error && !error.toLowerCase().includes("name") ? (
                <p className="text-caption text-danger">{error}</p>
              ) : null}
            </div>
          </section>
        )
      ) : (
        <div className="mt-5 flex flex-col gap-[22px] md:mt-8 md:flex-row md:items-start md:gap-[42px]">
          <div className="flex flex-col gap-[22px] md:w-[518px] md:flex-none md:gap-[26px]">
            {practice ? (
              <PracticePanel />
            ) : (
              <RoomCodePanel
                code={code}
                copied={copied}
                onCopy={(kind) => copy(kind === "code" ? code : shareLink, kind)}
              />
            )}
            <PlayerList
              players={players}
              youId={lobby.youId}
              maxPlayers={maxPlayers}
            />
          </div>
          <div className="flex flex-col gap-[22px] md:min-w-0 md:flex-1 md:gap-[26px]">
            <SettingsPanel
              settings={lobby.settings}
              isHost={isHost}
              preset={preset}
              customCards={customCards}
              customDecks={customDecks}
              errors={settingsError}
              onPreset={onPreset}
              onCustom={onCustom}
              onCustomCards={onCustomCards}
              onCustomDecks={onCustomDecks}
            />
            <LobbyFooter
              isHost={isHost}
              canStart={lobby.canStart}
              playerCount={players.length}
              minPlayers={minPlayers}
              error={error}
              onStart={() => client.send({ type: "startGame" })}
            />
          </div>
        </div>
      )}
    </main>
  );
}
