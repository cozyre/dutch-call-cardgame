"use client";

import { cn } from "@/lib/format";
import {
  DIFFICULTY_PRESETS,
  MAX_CARDS_PER_PLAYER,
  MAX_DECK_COUNT,
  MIN_CARDS_PER_PLAYER,
  MIN_DECK_COUNT,
  PRESET_ORDER,
} from "@/game/difficulty";
import type { SettingsError } from "@/game/difficulty";
import type { DifficultyPreset, GameSettings } from "@/game/types";

interface SettingsPanelProps {
  settings: GameSettings;
  isHost: boolean;
  preset: DifficultyPreset | "custom";
  customCards: number;
  customDecks: number;
  errors: SettingsError[];
  onPreset: (preset: DifficultyPreset) => void;
  onCustom: () => void;
  onCustomCards: (cards: number) => void;
  onCustomDecks: (decks: number) => void;
}

interface Option {
  key: DifficultyPreset | "custom";
  label: string;
  description: string;
}

const OPTIONS: Option[] = [
  ...PRESET_ORDER.map((key) => {
    const preset = DIFFICULTY_PRESETS[key];
    return {
      key,
      label: preset.label,
      description: `${preset.cardsPerPlayer} cards each · ${preset.deckCount} ${
        preset.deckCount === 1 ? "deck" : "decks"
      }`,
    };
  }),
  { key: "custom", label: "Custom", description: "You choose cards and decks" },
];

/**
 * Host settings: preset pills on mobile, full rows on desktop. Guests see
 * the same panel read-only — the server refuses their settings anyway.
 */
export function SettingsPanel({
  settings,
  isHost,
  preset,
  customCards,
  customDecks,
  errors,
  onPreset,
  onCustom,
  onCustomCards,
  onCustomDecks,
}: SettingsPanelProps) {
  const isCustom = preset === "custom";
  const cards = isCustom ? customCards : settings.cardsPerPlayer;
  const decks = isCustom ? customDecks : settings.deckCount;

  function choose(key: DifficultyPreset | "custom") {
    if (!isHost) return;
    if (key === "custom") {
      onCustom();
    } else {
      onPreset(key);
    }
  }

  return (
    <section className="rounded-panel bg-raised p-4 md:p-6">
      <h2 className="text-h2 text-tile">Game settings</h2>
      <p className="mt-3 text-caption text-glaze">
        {isHost
          ? "Only you can change these."
          : "Only the host can change these."}
        <span className="hidden md:inline"> Everyone sees them.</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-2 md:hidden">
        {OPTIONS.map((option) => {
          const selected = preset === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => choose(option.key)}
              disabled={!isHost}
              aria-pressed={selected}
              className={cn(
                "h-10 rounded-pill border-[1.5px] px-4 text-label transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oranje",
                "disabled:cursor-default",
                selected
                  ? "border-transparent bg-tile font-medium text-ink"
                  : "border-glaze/28 text-tile hover:bg-tile/5",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 hidden flex-col gap-[13.5px] md:flex">
        {OPTIONS.map((option) => {
          const selected = preset === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => choose(option.key)}
              disabled={!isHost}
              aria-pressed={selected}
              className={cn(
                "flex h-16 w-full items-center gap-4 rounded-2xl px-4 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oranje",
                "disabled:cursor-default",
                selected
                  ? "border-2 border-tile bg-delft"
                  : "border-[1.5px] border-glaze/28 hover:bg-tile/5",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-label font-medium text-tile">
                  {option.label}
                </span>
                <span className="block text-caption text-glaze">
                  {option.description}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "h-5 w-5 shrink-0 rounded-full",
                  selected ? "bg-tile" : "border-[1.5px] border-glaze/28",
                )}
              />
            </button>
          );
        })}
      </div>

      <StatsGrid
        className="mt-4 md:hidden"
        cards={cards}
        decks={decks}
        editable={isHost && isCustom}
        onCards={onCustomCards}
        onDecks={onCustomDecks}
      />

      {isCustom ? (
        <StatsGrid
          className="mt-4 hidden md:grid"
          cards={cards}
          decks={decks}
          editable={isHost}
          onCards={onCustomCards}
          onDecks={onCustomDecks}
        />
      ) : null}

      {errors.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1" role="alert">
          {errors.map((issue) => (
            <p key={`${issue.field}-${issue.code}`} className="text-caption text-danger">
              {issue.message}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface StatsGridProps {
  className?: string;
  cards: number;
  decks: number;
  editable: boolean;
  onCards: (cards: number) => void;
  onDecks: (decks: number) => void;
}

function StatsGrid({
  className,
  cards,
  decks,
  editable,
  onCards,
  onDecks,
}: StatsGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      <Stat
        label="Cards each"
        value={cards}
        min={MIN_CARDS_PER_PLAYER}
        max={MAX_CARDS_PER_PLAYER}
        editable={editable}
        onChange={onCards}
      />
      <Stat
        label="Decks"
        value={decks}
        min={MIN_DECK_COUNT}
        max={MAX_DECK_COUNT}
        editable={editable}
        onChange={onDecks}
      />
    </div>
  );
}

interface StatProps {
  label: string;
  value: number;
  min: number;
  max: number;
  editable: boolean;
  onChange: (value: number) => void;
}

function Stat({ label, value, min, max, editable, onChange }: StatProps) {
  return (
    <div>
      <p className="text-caption text-glaze">{label}</p>
      {editable ? (
        <div className="mt-1 flex items-center justify-between gap-1">
          <StepButton
            label={`Decrease ${label.toLowerCase()}`}
            disabled={value <= min}
            onClick={() => onChange(value - 1)}
          >
            −
          </StepButton>
          <span className="text-h1 text-tile">{value}</span>
          <StepButton
            label={`Increase ${label.toLowerCase()}`}
            disabled={value >= max}
            onClick={() => onChange(value + 1)}
          >
            +
          </StepButton>
        </div>
      ) : (
        <p className="mt-1 text-h1 text-tile">{value}</p>
      )}
    </div>
  );
}

interface StepButtonProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}

function StepButton({ label, disabled, onClick, children }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-pill border-[1.5px] border-glaze/28 text-body text-tile",
        "transition-colors hover:bg-tile/5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oranje",
        "disabled:pointer-events-none disabled:opacity-30",
      )}
    >
      {children}
    </button>
  );
}
