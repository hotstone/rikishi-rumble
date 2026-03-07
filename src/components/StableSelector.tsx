"use client";

import { useState, useEffect } from "react";
import { TIERS } from "@/types";

interface Wrestler {
  id: number;
  name: string;
  rank: string;
  tier: number;
}

interface StableEntry {
  tier: number;
  rikishi_id: number;
  name: string;
  rank: string;
}

export function StableSelector({
  userId,
  userName,
  pin,
}: {
  userId: string;
  userName: string;
  pin: string;
}) {
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [currentStable, setCurrentStable] = useState<StableEntry[]>([]);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/wrestlers").then((r) => r.json()),
      fetch(`/api/stable?userId=${userId}`).then((r) => r.json()),
    ]).then(([wrestlerData, stableData]) => {
      setWrestlers(wrestlerData.wrestlers);
      setCurrentStable(stableData.stable);

      // Initialize picks from current stable
      const existingPicks: Record<number, number> = {};
      for (const entry of stableData.stable) {
        existingPicks[entry.tier] = entry.rikishi_id;
      }
      setPicks(existingPicks);
    });
  }, [userId]);

  const handlePick = (tier: number, rikishiId: number) => {
    setPicks((prev) => ({ ...prev, [tier]: rikishiId }));
  };

  const handleSave = async () => {
    const picksArray = Object.entries(picks).map(([tier, rikishiId]) => ({
      tier: parseInt(tier),
      rikishiId,
    }));

    if (picksArray.length !== 5) {
      setMessage("PICK ONE WRESTLER PER TIER");
      return;
    }

    setSaving(true);
    setMessage("");

    const res = await fetch("/api/stable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, pin, picks: picksArray }),
    });

    if (res.ok) {
      setMessage("STABLE SAVED!");
      // Refresh current stable
      const stableData = await fetch(`/api/stable?userId=${userId}`).then((r) =>
        r.json()
      );
      setCurrentStable(stableData.stable);
    } else {
      const err = await res.json();
      setMessage(err.error || "SAVE FAILED");
    }
    setSaving(false);
  };

  const tierGroups = [1, 2, 3, 4, 5];

  return (
    <div className="retro-panel">
      <div className="retro-panel-header">
        <h2 className="font-pixel text-sm">SELECT YOUR STABLE</h2>
      </div>

      {wrestlers.length === 0 ? (
        <div className="text-center py-8">
          <p className="font-pixel text-xs text-gray-400">NO WRESTLERS LOADED</p>
          <p className="font-pixel text-xs text-gray-500 mt-2">ADMIN MUST SYNC BANZUKE FIRST</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tierGroups.map((tier) => {
            const tierWrestlers = wrestlers.filter((w) => w.tier === tier);
            const tierInfo = TIERS[tier];

            return (
              <div key={tier} className="border-2 border-retro-cyan/30 p-2">
                <div className="font-pixel text-xs text-retro-cyan mb-2">
                  TIER {tier}: {tierInfo.label}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                  {tierWrestlers.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => handlePick(tier, w.id)}
                      className={`p-2 border-2 transition-all text-left ${
                        picks[tier] === w.id
                          ? "border-retro-yellow bg-retro-yellow/10"
                          : "border-gray-600 hover:border-retro-cyan"
                      }`}
                    >
                      <div className="font-pixel text-xs text-white truncate">
                        {w.name}
                      </div>
                      <div className="font-pixel text-xs text-retro-cyan">
                        {w.rank}
                      </div>
                    </button>
                  ))}
                  {tierWrestlers.length === 0 && (
                    <div className="col-span-full text-center py-2 font-pixel text-xs text-gray-500">
                      NO WRESTLERS
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || Object.keys(picks).length !== 5}
              className="retro-btn px-4 py-2 font-pixel text-xs"
            >
              {saving ? "SAVING..." : "LOCK IN STABLE"}
            </button>
            {message && (
              <span
                className={`font-pixel text-xs ${
                  message === "STABLE SAVED!"
                    ? "text-retro-green"
                    : "text-retro-red"
                }`}
              >
                {message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
