"use client";

import { useState, useEffect, useCallback } from "react";

interface StableEntry {
  tier: number;
  rikishi_id: number;
  name: string;
  rank: string;
}

interface Wrestler {
  id: number;
  name: string;
  rank: string;
  tier: number;
}

interface SubstitutionRecord {
  id: number;
  day: number;
  old_name: string;
  new_name: string;
  tier: number;
  created_at: string;
}

export function SubstitutionPanel({
  userId,
  userName,
  pin,
}: {
  userId: string;
  userName: string;
  pin: string;
}) {
  const [stable, setStable] = useState<StableEntry[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [substitutions, setSubstitutions] = useState<SubstitutionRecord[]>([]);
  const [windowOpen, setWindowOpen] = useState(false);
  const [swappingTier, setSwappingTier] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [currentDay, setCurrentDay] = useState(1);

  const loadData = useCallback(async () => {
    const [stableRes, wrestlerRes, subRes, lbRes] = await Promise.all([
      fetch(`/api/stable?userId=${userId}`).then((r) => r.json()),
      fetch("/api/wrestlers").then((r) => r.json()),
      fetch(`/api/substitution?userId=${userId}`).then((r) => r.json()),
      fetch("/api/leaderboard").then((r) => r.json()),
    ]);

    setStable(stableRes.stable);
    setWrestlers(wrestlerRes.wrestlers);
    setSubstitutions(subRes.substitutions);
    setWindowOpen(subRes.windowOpen);
    setCurrentDay(lbRes.currentDay || 1);
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSwap = async (tier: number, newRikishiId: number) => {
    setMessage("");
    const res = await fetch("/api/substitution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName,
        pin,
        tier,
        newRikishiId,
        day: currentDay,
      }),
    });

    if (res.ok) {
      setMessage("SWAP COMPLETE!");
      setSwappingTier(null);
      loadData();
    } else {
      const err = await res.json();
      setMessage(err.error || "SWAP FAILED");
    }
  };

  return (
    <div className="retro-panel">
      <div className="retro-panel-header">
        <h2 className="font-pixel text-sm">SUBSTITUTIONS</h2>
        <span
          className={`font-pixel text-xs ${
            windowOpen ? "text-retro-green" : "text-retro-red"
          }`}
        >
          {windowOpen ? "WINDOW OPEN" : "WINDOW CLOSED"}
        </span>
      </div>

      {!windowOpen && (
        <div className="bg-retro-red/10 border-2 border-retro-red/30 px-3 py-2 mb-3">
          <p className="font-pixel text-xs text-retro-red">
            OPENS AT 8:00 PM AEST
          </p>
        </div>
      )}

      {stable.length === 0 ? (
        <div className="text-center py-8">
          <p className="font-pixel text-xs text-gray-400">
            SELECT YOUR STABLE FIRST
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stable.map((entry) => (
            <div
              key={entry.tier}
              className="border-2 border-gray-600 p-2 flex items-center justify-between"
            >
              <div>
                <span className="font-pixel text-xs text-retro-cyan">
                  T{entry.tier}:{" "}
                </span>
                <span className="font-pixel text-xs text-white">
                  {entry.name}
                </span>
                <span className="font-pixel text-xs text-gray-400 ml-1">
                  {entry.rank}
                </span>
              </div>

              {windowOpen && swappingTier !== entry.tier && (
                <button
                  onClick={() => setSwappingTier(entry.tier)}
                  className="retro-btn text-xs px-2 py-1"
                >
                  SWAP
                </button>
              )}

              {swappingTier === entry.tier && (
                <button
                  onClick={() => setSwappingTier(null)}
                  className="retro-btn-danger text-xs px-2 py-1"
                >
                  CANCEL
                </button>
              )}
            </div>
          ))}

          {swappingTier !== null && (
            <div className="border-2 border-retro-yellow p-2 mt-2">
              <p className="font-pixel text-xs text-retro-yellow mb-2">
                SELECT REPLACEMENT (TIER {swappingTier}):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {wrestlers
                  .filter(
                    (w) =>
                      w.tier === swappingTier &&
                      !stable.some((s) => s.rikishi_id === w.id)
                  )
                  .map((w) => (
                    <button
                      key={w.id}
                      onClick={() => handleSwap(swappingTier, w.id)}
                      className="p-2 border-2 border-gray-600 hover:border-retro-yellow text-left"
                    >
                      <div className="font-pixel text-xs text-white truncate">
                        {w.name}
                      </div>
                      <div className="font-pixel text-xs text-retro-cyan">
                        {w.rank}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {message && (
            <p
              className={`font-pixel text-xs ${
                message === "SWAP COMPLETE!"
                  ? "text-retro-green"
                  : "text-retro-red"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      )}

      {/* Substitution history */}
      {substitutions.length > 0 && (
        <div className="mt-4 border-t-2 border-gray-600 pt-3">
          <h3 className="font-pixel text-xs text-retro-cyan mb-2">
            SWAP HISTORY
          </h3>
          {substitutions.map((sub) => (
            <div key={sub.id} className="font-pixel text-xs text-gray-400 py-0.5">
              DAY {sub.day}: {sub.old_name} → {sub.new_name} (T{sub.tier})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
