"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Seat } from "@/components/ui/Seat";
import { TextField } from "@/components/ui/TextField";
import { HowToPlayButton } from "@/components/help/HowToPlayButton";
import { LobbyFooter } from "@/components/lobby/LobbyFooter";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { PlayerList } from "@/components/lobby/PlayerList";
import { RoomCodePanel } from "@/components/lobby/RoomCodePanel";
import { SettingsPanel } from "@/components/lobby/SettingsPanel";
import { getGameClient } from "@/lib/client/socket-client";
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
import type { GameError } from "@/lib/client/game-client";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = normaliseRoomCode(params.code ?? "");
  const client = useMemo(() => getGameClient(), []);

  const [lobby, setLobby] = useState<LobbyView | null>(client.getCachedLobby());
  const [view, setView] = useState<GameView | null>(client.getCachedView());
  const [name, setName] = useState(() => loadPlayerName());
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<SettingsError[]>([]);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [preset, setPreset] = useState<DifficultyPreset | "custom">("normal");
  const [customCards, setCustomCards] = useState(6);
  const [customDecks, setCustomDecks] = useState(1);

  useEffect(() => {
    client.connect();

    const unsubscribeLobby = client.onLobby((next) => {
      setLobby(next);
      setPreset(next.settings.preset === "custom" ? "custom" : next.settings.preset);
      setCustomCards(next.settings.cardsPerPlayer);
      setCustomDecks(next.settings.deckCount);
    });
    const unsubscribeView = client.onView((next) => setView(next));
    const unsubscribeSettings = client.onSettingsError((errors) =>
      setSettingsError(errors),
    );
    const unsubscribeError = client.onError((err) => setError(err.message));

    const seat = client.getSeat();
    const token = loadSeatToken(code);
    if (token && (!seat || seat.code !== code)) {
      client.resumeRoom(code, token).catch(() => {
        clearSeatToken(code);
      });
    }

    return () => {
      unsubscribeLobby();
      unsubscribeView();
      unsubscribeSettings();
      unsubscribeError();
    };
  }, [client, code]);

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
    clearSeatToken(code);
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

  if (view && view.phase !== "lobby") {
    return <GameInProgress code={code} view={view} />;
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
      ) : (
        <div className="mt-5 flex flex-col gap-[22px] md:mt-8 md:flex-row md:items-start md:gap-[42px]">
          <div className="flex flex-col gap-[22px] md:w-[518px] md:flex-none md:gap-[26px]">
            <RoomCodePanel
              code={code}
              copied={copied}
              onCopy={(kind) => copy(kind === "code" ? code : shareLink, kind)}
            />
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

/**
 * Phase 3 only lands the room on a live game view. The full board (grid,
 * piles, action bar, ability prompts) is Phase 4 and will replace this.
 */
function GameInProgress({ code, view }: { code: string; view: GameView }) {
  const turnPlayer = view.players.find((player) => player.id === view.turnPlayerId);
  const me = view.players.find((player) => player.id === view.youId);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-label text-glaze">Room</p>
          <p className="text-h2 tracking-[4px] text-tile">{code}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <HowToPlayButton />
          <p className="max-w-[40vw] truncate text-label text-glaze md:max-w-none">
            {me?.name}
          </p>
        </div>
      </header>

      <section className="mt-10 rounded-panel bg-raised p-6 md:p-8">
        <h1 className="text-h1 text-tile">
          {view.phase === "over"
            ? "Game over"
            : turnPlayer
              ? turnPlayer.id === view.youId
                ? "Your turn"
                : `${turnPlayer.name}'s turn`
              : "Dealing…"}
        </h1>
        <p className="mt-1 text-label text-glaze">
          The board arrives in the next phase — this live projection already comes
          straight from the server.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {view.players.map((player) => (
            <li key={player.id} className="rounded-panel bg-ink/40 p-4">
              <Seat
                name={player.name}
                isHost={player.isHost}
                connected={player.connected}
                active={player.id === view.turnPlayerId}
                status={
                  player.id === view.turnPlayerId
                    ? "Their turn"
                    : `${player.cardCount} card${player.cardCount === 1 ? "" : "s"}`
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-6 text-label text-glaze">
          <span>Center pile: {view.drawPileCount}</span>
          <span>
            Discard: {view.discardTop ? `${view.discardTop.rank}` : "empty"}
          </span>
          <span>Your cards: {view.myGrid.length}</span>
        </div>
      </section>
    </main>
  );
}
