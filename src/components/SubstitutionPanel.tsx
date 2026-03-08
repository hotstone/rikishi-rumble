"use client";

import { useState, useEffect, useCallback } from "react";

function useSubWindowCountdown() {
  const [timeLeft, setTimeLeft] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function update() {
      // Get current time in AEST
      const now = new Date();
      const aestStr = now.toLocaleString("en-US", {
        timeZone: "Australia/Sydney",
        hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      const [datePart, timePart] = aestStr.split(", ");
      const [month, day, year] = datePart.split("/").map(Number);
      const [hour] = timePart.split(":").map(Number);

      const open = hour >= 20 || hour < 14;
      setIsOpen(open);

      let targetHour: number;
      let targetDay = day;

      if (open) {
        if (hour >= 20) {
          targetDay = day + 1;
        }
        targetHour = 14;
      } else {
        targetHour = 20;
      }

      const targetDate = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" })
      );
      targetDate.setFullYear(year, month - 1, targetDay);
      targetDate.setHours(targetHour, 0, 0, 0);

      const aestNow = new Date(
        now.toLocaleString("en-US", { timeZone: "Australia/Sydney" })
      );
      const diff = targetDate.getTime() - aestNow.getTime();

      if (diff <= 0) {
        setTimeLeft("00H 00M 00S");
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${String(h).padStart(2, "0")}H ${String(m).padStart(2, "0")}M ${String(s).padStart(2, "0")}S`
      );
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return { timeLeft, isOpen };
}

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
  const [swappingTier, setSwappingTier] = useState<number | null>(null);
  const [pendingSwap, setPendingSwap] = useState<{
    tier: number;
    rikishiId: number;
    name: string;
    rank: string;
  } | null>(null);
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
    setCurrentDay(lbRes.currentDay || 1);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  const { timeLeft, isOpen: windowOpen } = useSubWindowCountdown();
  const todaySwapCount = substitutions.filter((s) => s.day === currentDay).length;
  const swapsRemaining = todaySwapCount < 2;

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

      <div className={`border-2 px-3 py-2 mb-3 ${
        windowOpen
          ? "bg-retro-green/10 border-retro-green/30"
          : "bg-retro-red/10 border-retro-red/30"
      }`}>
        <p className={`font-pixel text-xs ${windowOpen ? "text-retro-green" : "text-retro-red"}`}>
          {windowOpen
            ? `CLOSES IN: ${timeLeft}`
            : `OPENS IN: ${timeLeft}`}
        </p>
      </div>

      {windowOpen && todaySwapCount >= 2 && (
        <div className="bg-retro-yellow/10 border-2 border-retro-yellow/30 px-3 py-2 mb-3">
          <p className="font-pixel text-xs text-retro-yellow">
            2/2 SWAPS USED TODAY
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
                  onClick={() => {
                    setSwappingTier(entry.tier);
                    setPendingSwap(null);
                  }}
                  disabled={!swapsRemaining}
                  className="retro-btn text-xs px-2 py-1"
                >
                  SWAP
                </button>
              )}

              {swappingTier === entry.tier && (
                <button
                  onClick={() => {
                    setSwappingTier(null);
                    setPendingSwap(null);
                  }}
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
                      onClick={() =>
                        setPendingSwap({
                          tier: swappingTier,
                          rikishiId: w.id,
                          name: w.name,
                          rank: w.rank,
                        })
                      }
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

          {pendingSwap && (() => {
            const oldWrestler = stable.find((s) => s.tier === pendingSwap.tier);
            return (
              <div className="border-2 border-retro-green bg-retro-green/10 p-3 mt-2">
                <p className="font-pixel text-xs text-retro-yellow mb-2">
                  CONFIRM SWAP?
                </p>
                <p className="font-pixel text-xs text-white mb-3">
                  <span className="text-retro-red">{oldWrestler?.name}</span>
                  {" → "}
                  <span className="text-retro-green">{pendingSwap.name}</span>
                  <span className="text-gray-400 ml-1">({pendingSwap.rank})</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleSwap(pendingSwap.tier, pendingSwap.rikishiId);
                      setPendingSwap(null);
                    }}
                    className="retro-btn text-xs px-3 py-1"
                  >
                    CONFIRM
                  </button>
                  <button
                    onClick={() => setPendingSwap(null)}
                    className="retro-btn-danger text-xs px-3 py-1"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            );
          })()}

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
