import { playRandomGame } from "../src/game/testkit";
import type { DifficultyPreset } from "../src/game/types";

/**
 * Engine only benchmark (plan §6.8).
 *
 * Plays N random-but-legal games and asserts that the engine never breaks an
 * invariant: no illegal action, no card created or lost, no infinite loop and
 * every game ends.
 *
 *   npm run bench            # 1000 games
 *   npm run bench -- 5000    # more games
 */

const games = Number.parseInt(process.argv[2] ?? "1000", 10);
if (!Number.isFinite(games) || games < 1) {
  console.error("[bench] usage: npm run bench [games]");
  process.exit(1);
}

const playerCounts = [3, 3, 3, 4, 4, 5, 6];
const presets: DifficultyPreset[] = ["easy", "normal", "tricky", "hard", "memorizer"];

let steps = 0;
let cardsPlayed = 0;
let outrightWins = 0;
let dutchCalls = 0;
const failures: string[] = [];

for (let game = 0; game < games; game++) {
  const seed = game + 1;
  const playerCount = playerCounts[game % playerCounts.length];
  const preset = presets[game % presets.length];

  const run = playRandomGame({ seed, playerCount, preset });

  for (const violation of run.violations) {
    failures.push(`game ${seed} (${playerCount}p ${preset}): ${violation}`);
  }

  if (run.state.phase !== "over") {
    failures.push(`game ${seed}: did not reach game over`);
  }
  if (!run.state.result || run.state.result.length !== playerCount) {
    failures.push(`game ${seed}: result is missing or incomplete`);
  }
  if (run.state.result && run.state.result.filter((row) => row.isWinner).length === 0) {
    failures.push(`game ${seed}: no winner`);
  }
  if (run.state.result) {
    const totals = run.state.result.map((row) => row.total);
    const sorted = [...totals].sort((a, b) => a - b);
    if (totals.join(",") !== sorted.join(",")) {
      failures.push(`game ${seed}: standings are not sorted by total`);
    }
  }
  if (run.state.dutchCallerId) dutchCalls += 1;
  if (run.state.result?.some((row) => row.wonOutright)) outrightWins += 1;

  steps += run.steps;
  cardsPlayed += 52 * run.state.settings.deckCount;
}

if (failures.length > 0) {
  console.error(`[bench] ${failures.length} failure(s):`);
  for (const failure of failures.slice(0, 20)) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[bench] ${games} games ok · ${steps} steps · ${cardsPlayed} cards dealt · ` +
    `${dutchCalls} dutch calls · ${outrightWins} outright wins · 0 invariant violations`,
);
