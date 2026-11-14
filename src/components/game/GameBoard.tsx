"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ConnectionStatus, GameClient } from "@/lib/client/game-client";
import type { GameEvent, GameView, Target } from "@/game/types";
import type { LobbyView } from "@/server/protocol";
import { CenterPiles } from "./CenterPiles";
import { ConnectionBanner } from "./ConnectionBanner";
import { DutchCallDialog } from "./DutchCallDialog";
import { EventFeed, EventToast, type ToastItem } from "./EventToast";
import { GameHeader } from "./GameHeader";
import { MatchBanner } from "./MatchBanner";
import { OpponentRail } from "./OpponentRail";
import { PlayerGrid } from "./PlayerGrid";
import { ResultsScreen } from "./ResultsScreen";
import { TurnPanelContent, TurnPanelFooter, type TurnPanelProps } from "./TurnPanel";
import {
  canPickQueenTarget,
  describeGameEvent,
  desktopOwnGridSpec,
  formatClock,
  isRevealDisplayed,
  mobileOwnGridSpec,
} from "./game-ui";
import { useIsDesktop, useNow } from "./use-now";

interface GameBoardProps {
  client: GameClient;
  view: GameView;
  /**
   * `view.serverNow − Date.now()`, captured when the view arrived (see the
   * room page). Added to the ticker so deadlines count down against the
   * server's own timeline and a skewed device clock cannot distort them.
   */
  clockOffset: number;
  code: string;
  settingsLabel: string | null;
  /**
   * The live lobby projection, or null outside a room (practice route).
   * Host identity prefers it (plan §10): a forfeited host transfers the
   * role in the lobby, but the frozen results view still names them host.
   */
  lobby: LobbyView | null;
  /** Practice tables have no room code — the caption reads "Practice table". */
  practice?: boolean;
  onLeave: () => void;
}

/**
 * The board orchestrator (plan §9). It owns the event/error/status
 * subscriptions and the display clock; the inner surface — remounted whenever
 * the step identity changes — holds the transient interaction state
 * (selection, queen picks, peek tracking, burn feedback).
 *
 * No rule logic lives here: the server executes every timeout, actions carry
 * grid indices only, and feedback comes from `game:event` — a wrong burn is
 * never inferred locally.
 */
export function GameBoard({
  client,
  view,
  clockOffset,
  code,
  settingsLabel,
  lobby,
  practice = false,
  onLeave,
}: GameBoardProps) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [feed, setFeed] = useState<ToastItem[]>([]);
  const [rematchPending, setRematchPending] = useState(false);
  const toastId = useRef(0);
  // Stable dismiss callback: the toast's auto-dismiss effect depends on it,
  // so a fresh closure must not reset the timer on every render.
  const dismissToast = useCallback(() => setToast(null), []);

  // Event handlers need the freshest player names without re-subscribing on
  // every view; the ref is updated in an effect, never during render.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    const pushToast = (message: string, tone: ToastItem["tone"]) => {
      toastId.current += 1;
      const item = { id: toastId.current, message, tone };
      setToast(item);
      setFeed((items) => [...items.slice(-11), item]);
    };

    const unsubscribeEvent = client.onEvent((event: GameEvent) => {
      const message = describeGameEvent(event, viewRef.current);
      if (message === null) return;
      pushToast(message, "neutral");
    });
    const unsubscribeError = client.onError((error) => {
      // A refused rematch (wrong phase / too few players) sends no new view,
      // so the error is the only signal that can un-stick Play again.
      setRematchPending(false);
      pushToast(error.message, "danger");
    });
    const unsubscribeStatus = client.onStatus(setStatus);

    return () => {
      unsubscribeEvent();
      unsubscribeError();
      unsubscribeStatus();
    };
  }, [client]);

  // A rematch restarts the game without remounting the board (plan §10), so
  // the new deal starts with an empty feed — not the previous round's events.
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current === "over" && view.phase !== "over") {
      setFeed([]);
      setRematchPending(false);
    }
    prevPhase.current = view.phase;
  }, [view.phase]);

  /* ------------------------------------------------------------ */
  /* display clock                                                 */
  /* ------------------------------------------------------------ */

  const clockActive =
    view.deadlineAt !== null ||
    view.myGrid.some((card) => card.revealedUntil !== null) ||
    view.players.some((player) => !player.connected);
  const rawNow = useNow(clockActive);
  const now = rawNow + clockOffset;

  const clock =
    view.deadlineAt !== null && view.deadlineAt > now
      ? formatClock(view.deadlineAt - now)
      : null;

  /* ------------------------------------------------------------ */
  /* step identity — resets the inner surface's interaction state   */
  /* ------------------------------------------------------------ */

  const stepKey = [
    view.stepKind,
    view.turnPlayerId ?? "-",
    view.deadlineAt ?? "-",
    view.queenResolverId ?? "-",
    view.matchWindow?.rank ?? "-",
    view.matchWindow?.deadlineAt ?? "-",
  ].join("|");

  const myPlayer = view.players.find((player) => player.id === view.youId);
  const selfDisconnected = myPlayer ? !myPlayer.connected : false;
  const myDisconnectedAt = selfDisconnected ? myPlayer?.disconnectedAt ?? null : null;

  /* ------------------------------------------------------------ */
  /* rematch identity (plan §10)                                   */
  /* ------------------------------------------------------------ */

  // Host identity prefers the lobby: a host who forfeited transfers the role
  // in the lobby, but the frozen results view still names them host — so the
  // lobby is the truth for who may press Play again.
  const isHost = lobby
    ? lobby.youId !== null && lobby.youId === lobby.hostId
    : (view.players.find((player) => player.id === view.youId)?.isHost ?? false);
  const hostName =
    lobby?.players.find((player) => player.isHost)?.name ??
    view.players.find((player) => player.isHost)?.name ??
    "the host";

  // Failures (not host / wrong phase / too few players) arrive through the
  // standard game:error → toast path; no local pre-checks.
  const onRematch = useCallback(() => {
    setRematchPending(true);
    client.rematch();
  }, [client]);

  /**
   * The board caption (mobile header + desktop sidebar). The practice route
   * has no room code (plan §10), so its line leads with "Practice table";
   * a room keeps the tracked code span the design calls for.
   */
  const roomLine: ReactNode = practice
    ? `Practice table${settingsLabel ? ` · ${settingsLabel}` : ""}`
    : (
      <>
        Room <span className="tracking-[2px] text-tile">{code}</span>
        {settingsLabel ? ` · ${settingsLabel}` : ""}
      </>
    );

  // Fixed position, so it overlays either branch — on the results screen a
  // refused rematch (e.g. two seats left) must stay visible (plan §10).
  const toastNode = <EventToast toast={toast} onDismiss={dismissToast} />;

  if (view.phase === "over") {
    return (
      <>
        {toastNode}
        <ResultsScreen
          view={view}
          isHost={isHost}
          hostName={hostName}
          pending={rematchPending}
          onRematch={onRematch}
          onLeave={onLeave}
        />
      </>
    );
  }

  return (
    <div className="min-h-dvh md:pr-[360px]">
      {toastNode}
      <GameSurface
        key={stepKey}
        client={client}
        view={view}
        now={now}
        roomLine={roomLine}
        clock={clock}
        status={status}
        selfDisconnected={selfDisconnected}
        myDisconnectedAt={myDisconnectedAt}
        feed={feed}
        onLeave={onLeave}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the interactive surface                                             */
/* ------------------------------------------------------------------ */

interface GameSurfaceProps {
  client: GameClient;
  view: GameView;
  now: number;
  /** The computed board caption from GameBoard (room or practice line). */
  roomLine: ReactNode;
  clock: string | null;
  status: ConnectionStatus;
  selfDisconnected: boolean;
  myDisconnectedAt: number | null;
  feed: ToastItem[];
  onLeave: () => void;
}

function GameSurface({
  client,
  view,
  now,
  roomLine,
  clock,
  status,
  selfDisconnected,
  myDisconnectedAt,
  feed,
  onLeave,
}: GameSurfaceProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [queenPicks, setQueenPicks] = useState<Target[]>([]);
  const [peeked, setPeeked] = useState<ReadonlySet<number>>(new Set());
  const [wrongBurn, setWrongBurn] = useState(false);
  const [correctBurn, setCorrectBurn] = useState(false);
  const [dutchConfirm, setDutchConfirm] = useState(false);

  // Feedback for the viewer's own burns arrives as events; nothing is
  // inferred locally (plan gotcha 17).
  useEffect(() => {
    const unsubscribe = client.onEvent((event: GameEvent) => {
      if (event.type !== "burned" || event.playerId !== view.youId) return;
      if (event.correct) setCorrectBurn(true);
      else setWrongBurn(true);
    });
    return unsubscribe;
  }, [client, view.youId]);

  const send = client.send.bind(client);
  const mine = view.turnPlayerId === view.youId && view.phase === "playing";
  const queenResolver =
    view.stepKind === "awaitQueenSwap" && view.queenResolverId === view.youId;

  /* actions — indices only, never card values */

  const pickQueenTarget = (target: Target) => {
    setQueenPicks((picks) => {
      if (picks.length >= 2) return picks;
      const last = picks[picks.length - 1] ?? null;
      if (!canPickQueenTarget(last, target)) return picks;
      return [...picks, target];
    });
  };

  const onOwnSlot = (index: number) => {
    switch (view.stepKind) {
      case "setupPeek":
      case "awaitPeek": {
        if (view.myPeekTokens <= 0 || peeked.has(index)) return;
        setPeeked((slots) => new Set(slots).add(index));
        send({ type: "peek", cardIndex: index });
        return;
      }
      case "awaitChoice": {
        if (!mine) return;
        setSelectedSlot(index);
        send({ type: "selectCard", cardIndex: index });
        return;
      }
      case "matchWindow": {
        if (!view.canBurn) return;
        send({ type: "burn", cardIndex: index });
        return;
      }
      case "awaitQueenSwap": {
        if (queenResolver) pickQueenTarget({ playerId: view.youId, cardIndex: index });
        return;
      }
      default:
        return;
    }
  };

  const onPickOpponent = (playerId: string, cardIndex: number) => {
    if (!queenResolver) return;
    pickQueenTarget({ playerId, cardIndex });
  };

  const turnPanel: TurnPanelProps = {
    view,
    now,
    roomLine,
    selectedSlot,
    queenPicks,
    onDraw: () => send({ type: "draw" }),
    onSwap: () => {
      if (selectedSlot !== null) send({ type: "swapDrawn", cardIndex: selectedSlot });
    },
    onDiscard: () => send({ type: "discardDrawn" }),
    onDutchCall: () => setDutchConfirm(true),
    onQueenSwap: () => {
      const [a, b] = queenPicks;
      if (a && b) send({ type: "queenSwap", a, b });
    },
    onDeclineQueen: () => send({ type: "declineQueen" }),
  };

  /* layout numbers + slot states (pure views of the current view) */

  const desktop = useIsDesktop();
  const ownSpec = desktop
    ? desktopOwnGridSpec(view.myGrid.length)
    : mobileOwnGridSpec(view.myGrid.length);

  // The design re-hides a peek after ~3 s (client-side only). The server
  // reveal lasts 8 s (plan A5); `isRevealDisplayed` shows the face for the
  // first 3 s and never past the server window.
  const faceSlots = useMemo(() => {
    const live = new Set<number>();
    for (const card of view.myGrid) {
      if (
        card.revealed !== null &&
        card.revealedUntil !== null &&
        isRevealDisplayed(card.revealedUntil, now)
      ) {
        live.add(card.index);
      }
    }
    return live;
  }, [view.myGrid, now]);

  const ownSlotStates = useMemo<Record<number, "selectable" | "selected" | "muted">>(() => {
    const states: Record<number, "selectable" | "selected" | "muted"> = {};
    switch (view.stepKind) {
      case "setupPeek":
      case "awaitPeek": {
        if (view.myPeekTokens <= 0) break;
        for (const card of view.myGrid) {
          states[card.index] = peeked.has(card.index) ? "muted" : "selectable";
        }
        break;
      }
      case "awaitChoice": {
        if (!mine) break;
        for (const card of view.myGrid) {
          states[card.index] = card.index === selectedSlot ? "selected" : "selectable";
        }
        break;
      }
      case "matchWindow": {
        if (!view.canBurn) break;
        for (const card of view.myGrid) {
          states[card.index] = "selectable";
        }
        break;
      }
      case "awaitQueenSwap": {
        if (!queenResolver) break;
        for (const card of view.myGrid) {
          const picked = queenPicks.some(
            (pick) => pick.playerId === view.youId && pick.cardIndex === card.index,
          );
          states[card.index] = picked ? "selected" : "selectable";
        }
        break;
      }
      default:
        break;
    }
    return states;
  }, [
    view.stepKind,
    view.myGrid,
    view.myPeekTokens,
    view.canBurn,
    view.youId,
    mine,
    queenResolver,
    selectedSlot,
    peeked,
    queenPicks,
  ]);

  const matchFeedback = wrongBurn ? "wrong" : correctBurn ? "correct" : "none";
  const ownCardsCaption = ownCardsHint(view, mine, queenResolver, wrongBurn);
  const ownActionVerb =
    view.stepKind === "setupPeek" || view.stepKind === "awaitPeek"
      ? "Peek at"
      : view.stepKind === "matchWindow"
        ? "Burn"
        : "Select";
  const showBanner = view.stepKind === "matchWindow" && view.matchWindow !== null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1080px] flex-col px-4 pb-56 pt-4 md:px-8 md:pb-12 md:pt-8">
        <GameHeader
          view={view}
          roomLine={roomLine}
          clock={clock}
          onLeave={onLeave}
        />

        {status !== "connected" || selfDisconnected ? (
          <div className="mt-4 md:hidden">
            <ConnectionBanner
              status={status}
              disconnectedAt={myDisconnectedAt}
              now={now}
            />
          </div>
        ) : null}

        <div className="mt-4 md:mt-8">
          <OpponentRail
            view={view}
            now={now}
            desktop={desktop}
            pickingQueenTargets={queenResolver}
            queenPicks={queenPicks}
            onPickOpponent={onPickOpponent}
          />
        </div>

        <div className="mt-5 md:mt-8">
          <CenterPiles view={view} desktop={desktop} highlightDrawn={view.drawnCard !== null} />
        </div>

        <section className="mt-6 md:mt-10" aria-label="Your cards">
          <div className="flex items-baseline gap-3">
            <h2 className="text-h2 text-tile md:text-body">Your cards</h2>
            {ownCardsCaption ? (
              <p className="text-caption text-glaze">{ownCardsCaption}</p>
            ) : null}
          </div>
          <div className="mt-3 flex justify-center md:mt-4 md:justify-start">
            <PlayerGrid
              grid={view.myGrid}
              size={ownSpec.size}
              columns={ownSpec.columns}
              slotStates={ownSlotStates}
              faceSlots={faceSlots}
              onSlotClick={onOwnSlot}
              actionVerb={ownActionVerb}
            />
          </div>
        </section>
      </main>

      {/* desktop turn sidebar */}
      <aside
        aria-label="Turn panel"
        className="fixed inset-y-0 right-0 z-10 hidden w-[360px] flex-col overflow-y-auto bg-raised p-8 md:flex"
      >
        {status !== "connected" || selfDisconnected ? (
          <div className="mb-4">
            <ConnectionBanner
              status={status}
              disconnectedAt={myDisconnectedAt}
              now={now}
              desktop
            />
          </div>
        ) : null}

        {showBanner && view.matchWindow ? (
          <MatchBanner
            view={view}
            now={now}
            discardedBy={discardedByName(view)}
            discardedRank={view.matchWindow.rank}
            feedback={matchFeedback}
            desktop
          />
        ) : null}

        <TurnPanelContent {...turnPanel} />
        <EventFeed items={feed} />
        <TurnPanelFooter onLeave={onLeave} />
      </aside>

      {/* mobile pinned action sheet */}
      <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-panel bg-raised p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden">
        {showBanner && view.matchWindow ? (
          <MatchBanner
            view={view}
            now={now}
            discardedBy={discardedByName(view)}
            discardedRank={view.matchWindow.rank}
            feedback={matchFeedback}
          />
        ) : (
          <TurnPanelContent {...turnPanel} />
        )}
      </div>

      {dutchConfirm ? (
        <DutchCallDialog
          view={view}
          onClose={() => setDutchConfirm(false)}
          onConfirm={() => {
            setDutchConfirm(false);
            send({ type: "dutchCall" });
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Who opened the match window: the turn does not advance until the window
 * closes, so the active player is the discarder (plan A1).
 */
function discardedByName(view: GameView): string {
  const discarder = view.players.find((player) => player.id === view.turnPlayerId);
  return discarder?.name ?? "A player";
}

function ownCardsHint(
  view: GameView,
  mine: boolean,
  queenResolver: boolean,
  wrongBurn: boolean,
): string | null {
  switch (view.stepKind) {
    case "setupPeek":
      return "Tap a card to peek at it";
    case "awaitChoice":
      return mine ? "Tap a card to choose it for a swap" : null;
    case "matchWindow":
      if (!view.canBurn) return null;
      return wrongBurn
        ? "You burned wrong — wait for the window to close"
        : `Tap a card you think matches the ${view.matchWindow?.rank ?? ""}`;
    case "awaitPeek":
      return view.myPeekTokens > 0 ? "Tap a card to peek at it" : null;
    case "awaitQueenSwap":
      return queenResolver ? "Pick any two cards" : null;
    default:
      return null;
  }
}
