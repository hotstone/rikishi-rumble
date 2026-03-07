"use client";

import { useState } from "react";

export function AdminPanel({ userName }: { userName: string }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const handleSync = async (action: string, day?: number) => {
    setSyncing(true);
    setMessage("");

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, action, day }),
    });

    const data = await res.json();
    if (res.ok) {
      setMessage(data.message);
    } else {
      setMessage(data.error || "SYNC FAILED");
    }
    setSyncing(false);
  };

  return (
    <div className="retro-panel">
      <div className="retro-panel-header">
        <h2 className="font-pixel text-sm">ADMIN CONTROLS</h2>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => handleSync("banzuke")}
          disabled={syncing}
          className="retro-btn w-full text-xs py-2"
        >
          {syncing ? "SYNCING..." : "SYNC BANZUKE (RANKINGS)"}
        </button>

        <button
          onClick={() => handleSync("all")}
          disabled={syncing}
          className="retro-btn w-full text-xs py-2"
        >
          {syncing ? "SYNCING..." : "SYNC ALL RESULTS"}
        </button>

        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 15 }, (_, i) => i + 1).map((day) => (
            <button
              key={day}
              onClick={() => handleSync("day", day)}
              disabled={syncing}
              className="retro-btn text-xs px-2 py-1"
            >
              D{day}
            </button>
          ))}
        </div>

        {message && (
          <p className="font-pixel text-xs text-retro-green">{message}</p>
        )}
      </div>
    </div>
  );
}
