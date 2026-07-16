/**
 * Sumo-notation win/loss record: white disc = wins, black disc = losses.
 * Discs are CSS (Press Start 2P has no circle glyphs). Hidden at 0-0 so
 * pre-basho screens and never-fought wrestlers stay clean.
 */
export default function WinLossRecord({ wins, losses }: { wins: number; losses: number }) {
  if (wins === 0 && losses === 0) return null;

  return (
    <span className="font-pixel text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-1">
      <span className="inline-block w-2 h-2 rounded-full bg-retro-white" />
      <span className="text-retro-white">{wins}</span>
      <span className="inline-block w-2 h-2 rounded-full bg-black border border-gray-500" />
      <span className="text-gray-400">{losses}</span>
    </span>
  );
}
