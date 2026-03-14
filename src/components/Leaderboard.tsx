"use client";

import { useState, useEffect } from "react";
import { bashoLabel } from "@/lib/basho";

interface WrestlerEntry {
  tier: number;
  rikishi_id: number;
  name: string;
  rank: string;
  points: number;
  kimboshi: number;
}

interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  total_points: number;
  today_points: number;
  today_kimboshi: number;
  kimboshi_total: number;
  dailyWrestlers: Record<number, WrestlerEntry[]>;
  dailyPoints: Record<number, number>;
  dailyKimboshi: Record<number, number>;
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
          {bashoLabel(basho)}{currentDay > 0 && ` - DAY ${currentDay}`}
        </span>
      </div>

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
            <div className="col-span-5">PLAYER</div>
            <div className="col-span-3 text-right">TODAY</div>
            <div className="col-span-3 text-right">TOTAL</div>
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
                <div className="col-span-5 font-pixel text-xs text-white">
                  {entry.user_name}
                </div>
                <div className="col-span-3 font-pixel text-xs text-retro-green flex items-center justify-end gap-0.5">
                  {entry.today_kimboshi > 0 && Array.from({ length: entry.today_kimboshi }, (_, i) => (
                    <img key={i} src="/star.png" className="inline h-3 w-3 align-middle shrink-0" alt="★" />
                  ))}
                  <span className="w-6 text-right">{entry.today_points}</span>
                </div>
                <div className="col-span-3 font-pixel text-sm text-white flex items-center justify-end gap-0.5">
                  {entry.kimboshi_total > 0 && Array.from({ length: entry.kimboshi_total }, (_, i) => (
                    <img key={i} src="/star.png" className="inline h-3 w-3 align-middle shrink-0" alt="★" />
                  ))}
                  <span className="w-6 text-right">{entry.total_points}</span>
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
                  <div className="flex items-center gap-2 min-w-0 mr-2">
                    <span className="font-pixel text-xs text-retro-yellow shrink-0">{rank}</span>
                    <span className="font-pixel text-xs text-white truncate">
                      {entry.user_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-pixel text-xs text-retro-green flex items-center gap-0.5">
                      {entry.today_kimboshi > 0 && Array.from({ length: entry.today_kimboshi }, (_, i) => (
                        <img key={i} src="/star.png" className="inline h-3 w-3 align-middle shrink-0" alt="★" />
                      ))}
                      <span className="w-6 text-right">{entry.today_points}</span>
                    </span>
                    <span className="font-pixel text-sm text-white flex items-center gap-0.5">
                      {entry.kimboshi_total > 0 && Array.from({ length: entry.kimboshi_total }, (_, i) => (
                        <img key={i} src="/star.png" className="inline h-3 w-3 align-middle shrink-0" alt="★" />
                      ))}
                      <span className="w-6 text-right">{entry.total_points}</span>
                    </span>
                  </div>
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
                          const kimboshi = entry.dailyKimboshi?.[day] ?? 0;
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
                                className={`w-full h-4 relative overflow-hidden bg-gray-700 ${played ? "cursor-pointer" : ""} ${
                                  isSelected
                                    ? "border-2 border-white"
                                    : "border border-black/30"
                                }`}
                                title={played ? `Day ${day}: ${points}pts` : `Day ${day}`}
                              >
                                {played && points > 0 && (
                                  <div
                                    className="absolute bottom-0 w-full bg-retro-green"
                                    style={{ height: `${(Math.min(points, 7) / 7) * 100}%` }}
                                  />
                                )}
                                {played && kimboshi > 0 && (
                                  <img src="/star.png" className="absolute top-0 left-1/2 -translate-x-1/2 h-3 w-3 z-10" alt="★" />
                                )}
                              </div>
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
                          <span className="text-retro-green shrink-0 flex items-center gap-0.5">
                            {w.kimboshi > 0 && <img src="/star.png" className="inline h-3 w-3 align-middle shrink-0" alt="★" />}
                            {w.points}
                          </span>
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
