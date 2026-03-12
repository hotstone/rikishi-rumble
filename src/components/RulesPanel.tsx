"use client";

export function RulesPanel() {
  return (
    <div className="retro-panel">
      <div className="retro-panel-header">
        <h2 className="font-pixel text-sm">RULES</h2>
      </div>

      <div className="space-y-4 font-pixel text-xs">
        <section>
          <h3 className="text-retro-yellow mb-2">STABLE</h3>
          <ul className="space-y-1 text-gray-300 list-none">
            <li>- PICK 5 WRESTLERS, ONE FROM EACH TIER</li>
            <li>- TIER 1: YOKOZUNA + OZEKI</li>
            <li>- TIER 2: KOMUSUBI + SEKIWAKE</li>
            <li>- TIER 3: MAEGASHIRA 1-6</li>
            <li>- TIER 4: MAEGASHIRA 7-12</li>
            <li>- TIER 5: MAEGASHIRA 13+</li>
          </ul>
        </section>

        <section>
          <h3 className="text-retro-yellow mb-2">SCORING</h3>
          <ul className="space-y-1 text-gray-300 list-none">
            <li>- 1 POINT PER WIN BY YOUR WRESTLER</li>
            <li>- KIMBOSHI: +1 BONUS WHEN A MAEGASHIRA BEATS A YOKOZUNA (2 PTS TOTAL)</li>
          </ul>
        </section>

        <section>
          <h3 className="text-retro-yellow mb-2">SUBSTITUTIONS</h3>
          <ul className="space-y-1 text-gray-300 list-none">
            <li>- MAX 2 SUBS PER DAY</li>
            <li>- SAME TIER ONLY</li>
            <li>- WINDOW: 8PM - 2PM AEST</li>
          </ul>
        </section>

        <section>
          <h3 className="text-retro-yellow mb-2">TIEBREAKER</h3>
          <ul className="space-y-1 text-gray-300 list-none">
            <li>- MOST KIMBOSHI WINS THE TIE</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
