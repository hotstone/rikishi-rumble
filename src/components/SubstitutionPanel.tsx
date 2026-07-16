"use client";

import { useState, useEffect, useCallback } from "react";
import { detectClashes, type ClashBout, type ClashInfo } from "@/lib/clash";

type WindowStatus = "before-basho" | "open" | "blackout" | "after-basho";

function formatDiff(diffMs: number): string {
  if (diffMs <= 0) return "00H 00M 00S";
  const h = Math.floor(diffMs / (1000 * 60 * 60));
  const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((diffMs % (1000 * 60)) / 1000);
  return `${String(h).padStart(2, "0")}H ${String(m).padStart(2, "0")}M ${String(s).padStart(2, "0")}S`;
}

interface SubWindow {
  opensAt: Date;
  closesAt: Date;
}

/** Window state and countdown from the server's absolute window timestamps. */
function useSubWindowCountdown(windows: SubWindow[]) {
  const [timeLeft, setTimeLeft] = useState("");
  const [status, setStatus] = useState<WindowStatus>("before-basho");

  useEffect(() => {
    if (windows.length === 0) return;

    function update() {
      const now = Date.now();

      if (now < windows[0].opensAt.getTime()) {
        setStatus("before-basho");
        setTimeLeft(formatDiff(windows[0].opensAt.getTime() - now));
        return;
      }
      if (now >= windows[windows.length - 1].closesAt.getTime()) {
        setStatus("after-basho");
        setTimeLeft("");
        return;
      }

      // The earliest window that hasn't closed is either open now or upcoming
      const current = windows.find((w) => now < w.closesAt.getTime())!;
      if (now >= current.opensAt.getTime()) {
        setStatus("open");
        setTimeLeft(formatDiff(current.closesAt.getTime() - now));
      } else {
        setStatus("blackout");
        setTimeLeft(formatDiff(current.opensAt.getTime() - now));
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [windows]);

  return { timeLeft, status, isOpen: status === "open" };
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
}: {
  userId: string;
  userName: string;
}) {
  const [stable, setStable] = useState<StableEntry[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [substitutions, setSubstitutions] = useState<SubstitutionRecord[]>([]);
  const [boutsByDay, setBoutsByDay] = useState<Record<number, ClashBout[]>>({});
  const [swappingTier, setSwappingTier] = useState<number | null>(null);
  const [pendingSwap, setPendingSwap] = useState<{
    tier: number;
    rikishiId: number;
    name: string;
    rank: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [currentDay, setCurrentDay] = useState(1);
  const [windowDay, setWindowDay] = useState<number | null>(null);
  const [subWindows, setSubWindows] = useState<SubWindow[]>([]);

  const loadData = useCallback(async () => {
    const [stableRes, subRes, lbRes, boutsRes, bashoRes] = await Promise.all([
      fetch(`/api/stable?userId=${userId}`).then((r) => r.json()),
      fetch(`/api/substitution?userId=${userId}`).then((r) => r.json()),
      fetch("/api/leaderboard").then((r) => r.json()),
      fetch("/api/basho/bouts").then((r) => r.json()),
      fetch("/api/basho").then((r) => r.json()),
    ]);

    const day = lbRes.currentDay || 1;
    const nextDay = day + 1;
    const wrestlerRes = await fetch(`/api/wrestlers?day=${nextDay}`).then((r) => r.json());

    setStable(stableRes.stable);
    setWrestlers(wrestlerRes.wrestlers);
    setSubstitutions(subRes.substitutions);
    setWindowDay(subRes.windowDay ?? null);
    setCurrentDay(day);
    setBoutsByDay(boutsRes.boutsByDay || {});
    setSubWindows(
      (bashoRes.subWindows ?? []).map((w: { opensAt: string; closesAt: string }) => ({
        opensAt: new Date(w.opensAt),
        closesAt: new Date(w.closesAt),
      }))
    );
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  const { timeLeft, status, isOpen: windowOpen } = useSubWindowCountdown(subWindows);
  // The server derives the sub day from the open window; fall back to the
  // latest results day when no window is open (display only).
  const todaySwapCount = substitutions.filter((s) => s.day === (windowDay ?? currentDay)).length;
  const swapsRemaining = todaySwapCount < 2;

  const nextDay = currentDay + 1;
  const nextDayBouts = boutsByDay[nextDay] || [];
  const stableIds = new Set(stable.map((s) => s.rikishi_id));
  const clashes = detectClashes(stableIds, nextDayBouts);

  // Clashes if pendingSwap is confirmed: replace the swapped tier's wrestler
  const pendingClashes: ClashInfo[] = (() => {
    if (!pendingSwap) return [];
    const hypotheticalIds = new Set(
      stable.map((s) => s.tier === pendingSwap.tier ? pendingSwap.rikishiId : s.rikishi_id)
    );
    return detectClashes(hypotheticalIds, nextDayBouts);
  })();

  const handleSwap = async (tier: number, newRikishiId: number) => {
    setMessage("");
    const res = await fetch("/api/substitution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, newRikishiId }),
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
          {status === "open" && `CLOSES IN: ${timeLeft}`}
          {status === "blackout" && `OPENS IN: ${timeLeft}`}
          {status === "before-basho" && `OPENS IN: ${timeLeft}`}
          {status === "after-basho" && "BASHO ENDED"}
        </p>
      </div>

      {windowOpen && todaySwapCount >= 2 && (
        <div className="bg-retro-yellow/10 border-2 border-retro-yellow/30 px-3 py-2 mb-3">
          <p className="font-pixel text-xs text-retro-yellow">
            2/2 SWAPS USED TODAY
          </p>
        </div>
      )}

      {windowOpen && clashes.length > 0 && (
        <div className="bg-retro-red/10 border-2 border-retro-red px-3 py-2 mb-3">
          <p className="font-pixel text-xs text-retro-red mb-1">
            ⚠ STABLEMATE CLASH DAY {nextDay}
          </p>
          {clashes.map((c, i) => (
            <p key={i} className="font-pixel text-xs text-retro-yellow">
              {c.eastName} vs {c.westName}
            </p>
          ))}
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
                {pendingClashes.length > 0 && (
                  <div className="bg-retro-red/10 border border-retro-red px-2 py-1.5 mb-3">
                    <p className="font-pixel text-xs text-retro-red mb-1">
                      ⚠ CLASH DAY {nextDay}
                    </p>
                    {pendingClashes.map((c, i) => (
                      <p key={i} className="font-pixel text-xs text-retro-yellow">
                        {c.eastName} vs {c.westName}
                      </p>
                    ))}
                  </div>
                )}
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
