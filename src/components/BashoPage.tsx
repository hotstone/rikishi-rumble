"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Bout {
  east_id: number;
  east_name: string;
  east_rank: string;
  west_id: number;
  west_name: string;
  west_rank: string;
  winner_id: number | null;
  kimarite: string | null;
  is_kimboshi: boolean;
  east_owners: string[];
  west_owners: string[];
}

interface BashoData {
  basho: string;
  currentDay: number;
  syncedDays: number[];
  boutsByDay: Record<number, Bout[]>;
}

const INITIALS: Record<string, string> = {
  Matt: "MH",
  Marc: "MC",
  Mac: "MR",
};

function userInitials(name: string): string {
  return INITIALS[name] || name.charAt(0).toUpperCase();
}

export function BashoPage({ userName }: { userName?: string }) {
  const myInitials = userName ? userInitials(userName) : null;
  const [data, setData] = useState<BashoData | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const initialLoad = useRef(true);

  const fetchData = useCallback(() => {
    fetch("/api/basho/bouts")
      .then((r) => r.json())
      .then((d: BashoData) => {
        setData(d);
        if (initialLoad.current && d.currentDay > 0) {
          setExpandedDays(new Set([d.currentDay]));
          initialLoad.current = false;
        }
      });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll every 3 minutes if the current day is partially decided
  useEffect(() => {
    if (!data || data.currentDay === 0) return;
    const bouts = data.boutsByDay[data.currentDay] || [];
    const decidedCount = bouts.filter((b) => b.winner_id).length;
    const inProgress = decidedCount > 0 && decidedCount < bouts.length;

    if (!inProgress) return;

    const interval = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(interval);
  }, [data, fetchData]);

  if (!data) {
    return (
      <div className="text-center font-pixel text-retro-yellow text-xs animate-pulse">
        LOADING...
      </div>
    );
  }

  const { basho, currentDay, syncedDays, boutsByDay } = data;
  const syncedSet = new Set(syncedDays);

  return (
    <div className="retro-panel">
      <div className="retro-panel-header flex-col sm:flex-row gap-1">
        <h2 className="font-pixel text-sm">BASHO</h2>
      </div>

      <div className="space-y-1">
        {Array.from({ length: 15 }, (_, i) => i + 1).map((day) => {
          const hasBouts = syncedSet.has(day);
          const bouts = boutsByDay[day] || [];
          const isExpanded = hasBouts && expandedDays.has(day);
          const decidedCount = bouts.filter((b) => b.winner_id).length;

          return (
            <div key={day}>
              <button
                onClick={() => {
                  if (!hasBouts) return;
                  setExpandedDays((prev) => {
                    const next = new Set(prev);
                    if (next.has(day)) next.delete(day);
                    else next.add(day);
                    return next;
                  });
                }}
                className={`w-full text-left px-3 py-2 border-2 transition-colors ${
                  isExpanded
                    ? "border-retro-cyan bg-retro-cyan/10"
                    : hasBouts
                      ? "border-gray-500 hover:border-retro-cyan/50 cursor-pointer"
                      : "border-gray-700 cursor-default"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-pixel text-xs ${
                      !hasBouts ? "text-gray-500" : "text-white"
                    }`}
                  >
                    DAY {day}
                  </span>
                  <span className="font-pixel text-xs text-gray-500">
                    {hasBouts
                      ? decidedCount === bouts.length
                        ? `${bouts.length} BOUTS`
                        : `${decidedCount}/${bouts.length} DECIDED`
                      : "NO BOUTS CONFIRMED YET"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-x-2 border-b-2 border-retro-cyan/30 divide-y divide-gray-700/50">
                  {bouts.map((bout, idx) => (
                    <BoutRow key={idx} bout={bout} myInitials={myInitials} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoutRow({ bout, myInitials }: { bout: Bout; myInitials: string | null }) {
  const decided = bout.winner_id !== null;
  const eastWon = bout.winner_id === bout.east_id;
  const westWon = bout.winner_id === bout.west_id;

  return (
    <div className="px-2 sm:px-3 py-2">
      <div className="flex items-center gap-1 sm:gap-2">
        <WrestlerBox
          name={bout.east_name}
          rank={bout.east_rank}
          isWinner={eastWon}
          decided={decided}
          owners={bout.east_owners}
          isKimboshi={eastWon && bout.is_kimboshi}
          myInitials={myInitials}
        />

        <div className="shrink-0 text-center px-1">
          <span className="font-pixel text-xs text-gray-500">VS</span>
          {bout.kimarite && (
            <div className="font-pixel text-gray-600 leading-tight" style={{ fontSize: "6px" }}>
              {bout.kimarite}
            </div>
          )}
        </div>

        <WrestlerBox
          name={bout.west_name}
          rank={bout.west_rank}
          isWinner={westWon}
          decided={decided}
          owners={bout.west_owners}
          isKimboshi={westWon && bout.is_kimboshi}
          myInitials={myInitials}
        />
      </div>
    </div>
  );
}

function WrestlerBox({
  name,
  rank,
  isWinner,
  decided,
  owners,
  isKimboshi,
  myInitials,
}: {
  name: string;
  rank: string;
  isWinner: boolean;
  decided: boolean;
  owners: string[];
  isKimboshi: boolean;
  myInitials: string | null;
}) {
  const borderClass = isWinner
    ? "border-retro-green/60 bg-retro-green/10"
    : decided
      ? "border-gray-700 bg-transparent"
      : "border-gray-600 bg-transparent";

  const nameClass = isWinner
    ? "text-retro-green"
    : decided
      ? "text-gray-500"
      : "text-white";

  return (
    <div className={`flex-1 min-w-0 border-2 px-2 py-1.5 ${borderClass}`}>
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className={`font-pixel text-xs truncate ${nameClass}`}>
              {name}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-pixel text-retro-cyan" style={{ fontSize: "8px" }}>
              {rank}
            </span>
            {isKimboshi && (
              <img src="/star.png" className="inline h-3 w-3 align-middle shrink-0" alt="★" />
            )}
          </div>
        </div>
        {owners.length > 0 && (
          <div className="shrink-0 flex gap-0.5">
            {owners.map((initials, i) => {
              const isMe = initials === myInitials;
              return (
                <span
                  key={i}
                  className={`font-pixel inline-flex items-center justify-center h-4 px-0.5 border ${
                    isMe
                      ? "border-retro-yellow text-retro-yellow bg-retro-yellow/20"
                      : isWinner
                        ? "border-retro-yellow/60 text-retro-yellow bg-retro-yellow/10"
                        : "border-gray-600 text-gray-500 bg-transparent"
                  }`}
                  style={{ fontSize: "7px" }}
                >
                  {initials}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
