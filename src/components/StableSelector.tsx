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

function useCountdown(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!targetDate) return;

    function update() {
      const now = new Date();
      const diff = targetDate!.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft("LOCKED");
        setLocked(true);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (days > 0) parts.push(`${days}D`);
      parts.push(`${String(hours).padStart(2, "0")}H`);
      parts.push(`${String(minutes).padStart(2, "0")}M`);
      parts.push(`${String(seconds).padStart(2, "0")}S`);
      setTimeLeft(parts.join(" "));
      setLocked(false);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return { timeLeft, locked };
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
  const [lockDate, setLockDate] = useState<Date | null>(null);

  const { timeLeft, locked } = useCountdown(lockDate);

  useEffect(() => {
    Promise.all([
      fetch("/api/wrestlers").then((r) => r.json()),
      fetch(`/api/stable?userId=${userId}`).then((r) => r.json()),
      fetch("/api/basho").then((r) => r.json()),
    ]).then(([wrestlerData, stableData, bashoData]) => {
      setWrestlers(wrestlerData.wrestlers);
      setCurrentStable(stableData.stable);

      if (bashoData.stableLockDate) {
        setLockDate(new Date(bashoData.stableLockDate));
      } else if (bashoData.startDate) {
        const start = new Date(bashoData.startDate);
        start.setUTCHours(3, 0, 0, 0);
        setLockDate(start);
      }

      const existingPicks: Record<number, number> = {};
      for (const entry of stableData.stable) {
        existingPicks[entry.tier] = entry.rikishi_id;
      }
      setPicks(existingPicks);
    });
  }, [userId]);

  const handlePick = (tier: number, rikishiId: number) => {
    if (locked) return;
    setPicks((prev) => ({ ...prev, [tier]: rikishiId }));
  };

  const handleSave = async () => {
    if (locked) return;

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

      {/* Countdown / Lock status */}
      {lockDate && (
        <div
          className={`border-2 px-3 py-2 mb-3 ${
            locked
              ? "bg-retro-red/10 border-retro-red/30"
              : "bg-retro-cyan/10 border-retro-cyan/30"
          }`}
        >
          <p className={`font-pixel text-xs ${locked ? "text-retro-red" : "text-retro-cyan"}`}>
            {locked
              ? "SELECTIONS LOCKED - USE SUBSTITUTIONS TO CHANGE"
              : `LOCKS IN: ${timeLeft}`}
          </p>
        </div>
      )}

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
                      disabled={locked}
                      className={`p-2 border-2 transition-all text-left ${
                        picks[tier] === w.id
                          ? "border-retro-yellow bg-retro-yellow/10"
                          : locked
                          ? "border-gray-700 opacity-50"
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
              disabled={saving || locked || Object.keys(picks).length !== 5}
              className="retro-btn px-4 py-2 font-pixel text-xs"
            >
              {saving ? "SAVING..." : locked ? "LOCKED" : "LOCK IN STABLE"}
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
