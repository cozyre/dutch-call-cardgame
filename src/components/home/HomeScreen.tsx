"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { CardBack } from "@/components/card/CardBack";
import { CardFace } from "@/components/card/CardFace";
import { HowToPlayButton } from "@/components/help/HowToPlayButton";
import { getGameClient } from "@/lib/client/socket-client";
import { loadPlayerName, savePlayerName } from "@/lib/client/storage";
import { normaliseRoomCode } from "@/lib/format";
import type { GameError } from "@/lib/client/game-client";

interface HomeScreenProps {
  initialRoomCode?: string;
}

export function HomeScreen({ initialRoomCode = "" }: HomeScreenProps) {
  const router = useRouter();
  const client = useMemo(() => getGameClient(), []);

  const [name, setName] = useState(() => loadPlayerName());
  const [roomCode, setRoomCode] = useState(() => normaliseRoomCode(initialRoomCode));
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"create" | "join" | null>(null);

  useEffect(() => {
    client.connect();
  }, [client]);

  async function createGame() {
    setNameError(null);
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter your name.");
      return;
    }
    savePlayerName(trimmed);
    setPending("create");
    try {
      const session = await client.createRoom(trimmed);
      router.push(`/room/${session.code}`);
    } catch (caught) {
      setError((caught as GameError).message ?? "Could not create the room.");
    } finally {
      setPending(null);
    }
  }

  async function joinGame() {
    setNameError(null);
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter your name.");
      return;
    }
    const code = normaliseRoomCode(roomCode);
    if (code.length !== 6) {
      setError("Enter a 6-character room code.");
      return;
    }
    savePlayerName(trimmed);
    setPending("join");
    try {
      const session = await client.joinRoom(code, trimmed);
      router.push(`/room/${session.code}`);
    } catch (caught) {
      setError((caught as GameError).message ?? "Could not join the room.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-6 py-10 md:items-center md:py-8 xl:items-start xl:px-0 min-[1440px]:py-0">
      <DesktopHero />

      <div className="flex w-full flex-col md:my-auto md:w-[482px]">
        <div className="md:hidden">
          <CardFan />
        </div>

        <div className="mt-5 flex items-center gap-3 md:mt-0 md:gap-4">
          <Image
            src="/logo.png"
            alt=""
            width={1254}
            height={1254}
            sizes="(min-width: 768px) 64px, 56px"
            preload
            className="h-14 w-14 shrink-0 md:h-16 md:w-16"
          />
          <h1 className="text-[40px] font-extrabold leading-[44px] tracking-[-1px] text-tile md:text-display-xl md:leading-[68px] md:tracking-[-2px]">
            Dutch Call
          </h1>
        </div>
        <p className="mt-3 max-w-[342px] text-body text-glaze md:mt-2 md:max-w-[412px]">
          Swap, match and memorize. Get down to one card, then call it.
        </p>

        <div className="mt-4 flex flex-col gap-5 md:mt-8 md:gap-0 md:rounded-panel md:bg-raised md:p-6">
          <div className="flex flex-col gap-3">
            <TextField
              label="Your name"
              placeholder="Enter your name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError(null);
              }}
              maxLength={24}
              autoComplete="nickname"
              error={nameError}
            />
            <Button variant="primary" fullWidth onClick={createGame} disabled={busy}>
              {pending === "create" ? "Creating…" : "Create game"}
            </Button>
          </div>

          <p className="text-center text-label text-glaze md:mt-3">
            or join a friend’s game
          </p>

          <div className="flex flex-col gap-3 md:mt-3 md:flex-row md:items-end md:gap-4">
            <TextField
              label="Room code"
              placeholder="KQ7M4X"
              value={roomCode}
              onChange={(event) => setRoomCode(normaliseRoomCode(event.target.value))}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="flex-1"
            />
            <Button
              variant="secondary"
              fullWidth
              onClick={joinGame}
              disabled={busy}
              className="md:w-[89px] md:px-0"
            >
              {pending === "join" ? (
                "Joining…"
              ) : (
                <>
                  <span className="md:hidden">Join game</span>
                  <span className="hidden md:inline">Join</span>
                </>
              )}
            </Button>
          </div>

          {error ? (
            <p className="text-caption text-danger md:mt-3" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <HowToPlayButton appearance="link" className="mt-3" />
      </div>
    </main>
  );
}

/** The fanned cards in the design's Home hero: back, back, face-up King. */
function CardFan() {
  return (
    <div className="relative h-[190px] w-[342px] max-w-full self-center" aria-hidden="true">
      <div className="absolute left-[31px] top-[56px] origin-top-left -rotate-[18deg]">
        <CardBack size="L" />
      </div>
      <div className="absolute left-[125px] top-[27px]">
        <CardBack size="L" />
      </div>
      <div className="absolute left-[223px] top-[28px] origin-top-left rotate-[18deg]">
        <CardFace rank="K" suit="S" size="L" />
      </div>
    </div>
  );
}

/**
 * The desktop hero: a Delft-tile ellipse behind a five-card fan, with the
 * three scoring reminders beneath it (Figma Home desktop, 5:2). The fixed
 * 748 px composition is drawn for 1440; between 1280–1439 it is scaled to
 * 0.92 so the ellipse and cards never clip.
 */
function DesktopHero() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden xl:block xl:scale-[0.92] min-[1440px]:scale-100"
    >
      <div className="absolute left-[540px] top-[32px] h-[836px] w-[748px] rounded-full bg-delft" />

      <HeroCard left={581} top={373} z={1} shadow={false}>
        <CardBack size="L" className="h-full w-full" />
      </HeroCard>
      <HeroCard left={713} top={344} z={2}>
        <CardBack size="L" className="h-full w-full" />
      </HeroCard>
      <HeroCard left={837} top={309} z={3}>
        <CardFace rank="A" suit="H" size="L" className="h-full w-full" />
      </HeroCard>
      <HeroCard left={954} top={341} z={4} rotate>
        <CardFace rank="K" suit="S" size="L" className="h-full w-full" />
      </HeroCard>
      <HeroCard left={1089} top={375} z={5}>
        <CardBack size="L" className="h-full w-full" />
      </HeroCard>

      <div className="absolute left-[540px] top-[656px] flex w-[748px] justify-center gap-11 text-label text-tile">
        <span>Black King = 0</span>
        <span>Red King = 13</span>
        <span>Jack, Queen = 10</span>
      </div>
    </div>
  );
}

interface HeroCardProps {
  left: number;
  top: number;
  z: number;
  shadow?: boolean;
  rotate?: boolean;
  children: ReactNode;
}

function HeroCard({
  left,
  top,
  z,
  shadow = true,
  rotate = false,
  children,
}: HeroCardProps) {
  return (
    <div
      className={`absolute h-[221px] w-[156px] ${
        rotate ? "rotate-12" : ""
      } ${shadow ? "shadow-[0_18px_36px_-10px_rgba(4,10,28,0.5)]" : ""}`}
      style={{ left, top, zIndex: z }}
    >
      {children}
    </div>
  );
}
