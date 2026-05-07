"use client";

import { useState, useEffect } from "react";

interface Champion {
  name: string;
  bashoId: string;
  bashoLabel: string;
  points: number;
  kimboshi: number;
}

export function HallOfChampions() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/champions")
      .then((r) => r.json())
      .then((data) => {
        setChampions(data.champions || []);
        setLoaded(true);
      });
  }, []);

  if (!loaded) return null;

  return (
    <div className="retro-panel">
      <div className="retro-panel-header">
        <h2 className="font-pixel text-sm text-white">HALL OF CHAMPIONS</h2>
      </div>
      <div className="space-y-0">
        {champions.map((c, idx) => {
          const isReal = c.points > 0;
          return (
            <div
              key={c.bashoId || `placeholder-${idx}`}
              className={`flex items-center justify-between py-2 px-1 ${
                idx < champions.length - 1 ? "border-b border-retro-border" : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-pixel text-xs text-retro-yellow w-5 shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <span className={`font-pixel text-xs ${isReal ? "text-white" : "text-gray-500"}`}>
                    {c.name}
                  </span>
                  <span className={`font-pixel ml-2 ${isReal ? "text-retro-cyan" : "text-gray-600"}`} style={{ fontSize: "8px" }}>
                    {c.bashoLabel}
                  </span>
                </div>
              </div>
              <span className={`font-pixel text-xs shrink-0 ${isReal ? "text-retro-green" : "text-gray-600"}`}>
                {c.points} PTS
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
