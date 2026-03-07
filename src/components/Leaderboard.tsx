"use client";

import { useState, useEffect } from "react";

interface WrestlerEntry {
  tier: number;
  rikishi_id: number;
  name: string;
  rank: string;
  points: number;
}

interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  total_points: number;
  today_points: number;
  kimboshi_total: number;
  wrestlers: WrestlerEntry[];
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  currentDay: number;
  basho: string;
  hasPendingResults: boolean;
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <div className="text-center font-pixel text-retro-yellow text-xs animate-pulse">LOADING...</div>;
  }

  const { leaderboard, currentDay, basho, hasPendingResults } = data;

  return (
    <div className="retro-panel">
      <div className="retro-panel-header">
        <h2 className="font-pixel text-sm">SCOREBOARD</h2>
        <span className="font-pixel text-xs text-retro-cyan">
          BASHO {basho} - DAY {currentDay || "?"}
        </span>
      </div>

      {hasPendingResults && (
        <div className="bg-retro-red/20 border-2 border-retro-red px-3 py-2 mb-3">
          <span className="font-pixel text-xs text-retro-red animate-pulse">
            RESULTS PENDING...
          </span>
        </div>
      )}

      {leaderboard.length === 0 ? (
        <div className="text-center py-8">
          <p className="font-pixel text-xs text-gray-400">NO PLAYERS YET</p>
          <p className="font-pixel text-xs text-gray-500 mt-2">SELECT YOUR STABLE TO BEGIN</p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-12 gap-1 px-2 py-1 text-retro-cyan font-pixel text-xs">
            <div className="col-span-1">#</div>
            <div className="col-span-4">PLAYER</div>
            <div className="col-span-2 text-right">TODAY</div>
            <div className="col-span-2 text-right">TOTAL</div>
            <div className="col-span-3 text-right">KIMBOSHI</div>
          </div>

          {leaderboard.map((entry, idx) => (
            <div key={entry.user_id}>
              <div
                className={`grid grid-cols-12 gap-1 px-2 py-2 cursor-pointer transition-colors ${
                  idx === 0 && entry.total_points > 0
                    ? "bg-retro-yellow/10 border-2 border-retro-yellow"
                    : "border-2 border-transparent hover:border-retro-cyan/30"
                }`}
                onClick={() =>
                  setExpandedUser(
                    expandedUser === entry.user_id ? null : entry.user_id
                  )
                }
              >
                <div className="col-span-1 font-pixel text-xs text-retro-yellow">
                  {idx + 1}
                </div>
                <div className="col-span-4 font-pixel text-xs text-white">
                  {idx === 0 && entry.total_points > 0 && "★ "}
                  {entry.user_name}
                </div>
                <div className="col-span-2 text-right font-pixel text-xs text-retro-green">
                  +{entry.today_points}
                </div>
                <div className="col-span-2 text-right font-pixel text-sm text-white">
                  {entry.total_points}
                </div>
                <div className="col-span-3 text-right font-pixel text-xs text-retro-magenta">
                  {entry.kimboshi_total > 0 ? `${entry.kimboshi_total}` : "-"}
                </div>
              </div>

              {expandedUser === entry.user_id && entry.wrestlers.length > 0 && (
                <div className="ml-6 mb-2 border-l-2 border-retro-cyan/30 pl-3 py-1">
                  {entry.wrestlers.map((w) => (
                    <div
                      key={w.tier}
                      className="flex justify-between py-0.5 font-pixel text-xs"
                    >
                      <span className="text-gray-400">
                        T{w.tier}: <span className="text-white">{w.name || "???"}</span>
                        <span className="text-retro-cyan ml-1">{w.rank}</span>
                      </span>
                      <span className="text-retro-green">{w.points}W</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
