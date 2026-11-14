/**
 * The practice lobby's room panel: where a network lobby shows the room code
 * and invite actions, practice shows what this table is — no code to share,
 * because the three opponents live in this tab only (plan §13).
 */
export function PracticePanel() {
  return (
    <section className="rounded-panel bg-raised p-4 md:p-6">
      <p className="text-h2 text-tile">Practice table</p>
      <p className="mt-1 text-label text-glaze">
        You and three bots — settings apply to the next deal.
      </p>
    </section>
  );
}
