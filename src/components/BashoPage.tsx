"use client";

import { useState, useEffect } from "react";

interface Bout {
  winner_id: number;
  loser_id: number;
  winner_name: string;
  winner_rank: string;
  loser_name: string;
  loser_rank: string;
  kimarite: string;
  is_kimboshi: boolean;
  winner_owners: string[];
  loser_owners: string[];
}

interface BashoData {
  basho: string;
  currentDay: number;
  syncedDays: number[];
  boutsByDay: Record<number, Bout[]>;
}

export function BashoPage() {
  const [data, setData] = useState<BashoData | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/basho/bouts")
      .then((r) => r.json())
      .then((d: BashoData) => {
        setData(d);
      });
  }, []);

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
        <span className="font-pixel text-xs text-retro-cyan">
          {basho} - DAY {currentDay || "?"}
        </span>
      </div>

      <div className="space-y-1">
        {Array.from({ length: 15 }, (_, i) => i + 1).map((day) => {
          const hasBouts = syncedSet.has(day);
          const bouts = boutsByDay[day] || [];
          const isExpanded = hasBouts && expandedDays.has(day);

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
                    {day === currentDay && (
                      <span className="text-retro-yellow ml-2">LATEST</span>
                    )}
                  </span>
                  <span className="font-pixel text-xs text-gray-500">
                    {hasBouts
                      ? `${bouts.length} BOUTS`
                      : "NO BOUTS CONFIRMED YET"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-x-2 border-b-2 border-retro-cyan/30 divide-y divide-gray-700/50">
                  {bouts.map((bout, idx) => (
                    <BoutRow key={idx} bout={bout} />
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

function BoutRow({ bout }: { bout: Bout }) {
  return (
    <div className="px-2 sm:px-3 py-2">
      <div className="flex items-center gap-1 sm:gap-2">
        {/* East (winner or loser) side */}
        <WrestlerBox
          name={bout.winner_name}
          rank={bout.winner_rank}
          isWinner={true}
          owners={bout.winner_owners}
          isKimboshi={bout.is_kimboshi}
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
          name={bout.loser_name}
          rank={bout.loser_rank}
          isWinner={false}
          owners={bout.loser_owners}
          isKimboshi={false}
        />
      </div>
    </div>
  );
}

function WrestlerBox({
  name,
  rank,
  isWinner,
  owners,
  isKimboshi,
}: {
  name: string;
  rank: string;
  isWinner: boolean;
  owners: string[];
  isKimboshi: boolean;
}) {
  return (
    <div
      className={`flex-1 min-w-0 border-2 px-2 py-1.5 ${
        isWinner
          ? "border-retro-green/60 bg-retro-green/10"
          : "border-gray-700 bg-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            {isWinner && (
              <span className="font-pixel text-retro-green shrink-0" style={{ fontSize: "8px" }}>
                W
              </span>
            )}
            <span
              className={`font-pixel text-xs truncate ${
                isWinner ? "text-retro-green" : "text-gray-400"
              }`}
            >
              {name}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-pixel text-retro-cyan" style={{ fontSize: "8px" }}>
              {rank}
            </span>
            {isKimboshi && (
              <span className="font-pixel text-retro-magenta" style={{ fontSize: "7px" }}>
                KIMBOSHI
              </span>
            )}
          </div>
        </div>
        {owners.length > 0 && (
          <div className="shrink-0 flex gap-0.5">
            {owners.map((initial, i) => (
              <span
                key={i}
                className={`font-pixel inline-flex items-center justify-center w-4 h-4 border ${
                  isWinner
                    ? "border-retro-yellow/60 text-retro-yellow bg-retro-yellow/10"
                    : "border-gray-600 text-gray-500 bg-transparent"
                }`}
                style={{ fontSize: "7px" }}
              >
                {initial}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
