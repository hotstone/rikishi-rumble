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
  dailyWrestlers: Record<number, WrestlerEntry[]>;
  dailyPoints: Record<number, number>;
}

function getDayColor(points: number): string {
  if (points === 0) return "bg-retro-red";
  if (points <= 1) return "bg-orange-500";
  if (points <= 2) return "bg-retro-yellow";
  if (points <= 3) return "bg-lime-500";
  if (points <= 4) return "bg-retro-green";
  return "bg-retro-cyan";
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  currentDay: number;
  activeDay: number;
  basho: string;
  hasPendingResults: boolean;
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <div className="text-center font-pixel text-retro-yellow text-xs animate-pulse">LOADING...</div>;
  }

  const { leaderboard, currentDay, activeDay, basho, hasPendingResults } = data;

  const handleToggleUser = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
    } else {
      setExpandedUser(userId);
      setSelectedDay(null);
    }
  };

  return (
    <div className="retro-panel">
      <div className="retro-panel-header flex-col sm:flex-row gap-1">
        <h2 className="font-pixel text-sm">SCOREBOARD</h2>
        <span className="font-pixel text-xs text-retro-cyan">
          BASHO {basho}{currentDay > 0 && ` - DAY ${currentDay}`}
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
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-12 gap-1 px-2 py-1 text-retro-cyan font-pixel text-xs">
            <div className="col-span-1">#</div>
            <div className="col-span-4">PLAYER</div>
            <div className="col-span-2 text-right">TODAY</div>
            <div className="col-span-2 text-right">TOTAL</div>
            <div className="col-span-3 text-right">KIMBOSHI</div>
          </div>

          {leaderboard.map((entry, idx) => {
            // Dense ranking: same points = same rank
            const rank = idx === 0
              ? 1
              : entry.total_points === leaderboard[idx - 1].total_points
                ? leaderboard.findIndex((e) => e.total_points === entry.total_points) + 1
                : idx + 1;
            const isFirst = rank === 1 && entry.total_points > 0;

            return (
            <div key={entry.user_id}>
              {/* Desktop row */}
              <div
                className={`hidden sm:grid grid-cols-12 gap-1 px-2 py-2 cursor-pointer transition-colors ${
                  isFirst
                    ? "bg-retro-yellow/10 border-2 border-retro-yellow"
                    : "border-2 border-transparent hover:border-retro-cyan/30"
                }`}
                onClick={() => handleToggleUser(entry.user_id)}
              >
                <div className="col-span-1 font-pixel text-xs text-retro-yellow">
                  {rank}
                </div>
                <div className="col-span-4 font-pixel text-xs text-white">
                  {entry.user_name}
                </div>
                <div className="col-span-2 text-right font-pixel text-xs text-retro-green">
                  +{entry.today_points}
                </div>
                <div className="col-span-2 text-right font-pixel text-sm text-white">
                  {entry.total_points}
                </div>
                <div className="col-span-3 text-right font-pixel text-xs text-retro-magenta">
                  {entry.kimboshi_total > 0 ? "★".repeat(entry.kimboshi_total) : "-"}
                </div>
              </div>

              {/* Mobile card */}
              <div
                className={`sm:hidden px-3 py-2 cursor-pointer transition-colors ${
                  isFirst
                    ? "bg-retro-yellow/10 border-2 border-retro-yellow"
                    : "border-2 border-transparent hover:border-retro-cyan/30"
                }`}
                onClick={() => handleToggleUser(entry.user_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-xs text-retro-yellow">{rank}</span>
                    <span className="font-pixel text-xs text-white">
                      {entry.user_name}
                    </span>
                  </div>
                  <span className="font-pixel text-sm text-white">{entry.total_points}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-pixel text-xs text-retro-green">+{entry.today_points} TODAY</span>
                  {entry.kimboshi_total > 0 && (
                    <span className="font-pixel text-xs text-retro-magenta">{"★".repeat(entry.kimboshi_total)} KB</span>
                  )}
                </div>
              </div>

              {/* Expanded details (both mobile & desktop) */}
              {expandedUser === entry.user_id && (() => {
                const displayDay = selectedDay ?? activeDay;
                const wrestlers = entry.dailyWrestlers[displayDay] ?? [];
                return (
                  <div className="ml-3 sm:ml-6 mb-2 border-l-2 border-retro-cyan/30 pl-2 sm:pl-3 py-1">
                    {/* Power-up bar */}
                    <div className="mb-2">
                      <div className="flex gap-0.5 items-end">
                        {Array.from({ length: 15 }, (_, i) => {
                          const day = i + 1;
                          const played = day <= currentDay;
                          const points = entry.dailyPoints[day] ?? 0;
                          const isSelected = day === displayDay;
                          return (
                            <div
                              key={day}
                              className="flex flex-col items-center flex-1 min-w-0"
                              onClick={() => {
                                if (!played) return;
                                setSelectedDay(selectedDay === day ? null : day);
                              }}
                            >
                              <div
                                className={`w-full h-4 ${played ? "cursor-pointer" : ""} ${
                                  isSelected
                                    ? "border-2 border-white"
                                    : "border border-black/30"
                                } ${played ? getDayColor(points) : "bg-gray-700"}`}
                                title={played ? `Day ${day}: ${points}pts` : `Day ${day}`}
                              />
                              <span className="font-pixel text-gray-500 mt-0.5 leading-none" style={{ fontSize: "6px" }}>
                                {day}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Day label */}
                    <div className="mb-1">
                      <span className="font-pixel text-retro-cyan" style={{ fontSize: "8px" }}>
                        DAY {displayDay}
                        {displayDay === activeDay && !selectedDay && activeDay === currentDay && " (LATEST)"}
                      </span>
                    </div>

                    {wrestlers.length === 0 ? (
                      <p className="font-pixel text-xs text-gray-500">NO DATA</p>
                    ) : (
                      wrestlers.map((w) => (
                        <div
                          key={w.tier}
                          className="flex justify-between py-0.5 font-pixel text-xs"
                        >
                          <span className="text-gray-400 truncate mr-2">
                            T{w.tier}: <span className="text-white">{w.name || "???"}</span>
                            <span className="text-retro-cyan ml-1">{w.rank}</span>
                          </span>
                          <span className="text-retro-green shrink-0">{w.points}W</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
