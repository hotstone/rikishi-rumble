"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UserOption {
  id: string;
  name: string;
}

export function AdminPanel({ userName, pin }: { userName: string; pin: string }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [autoSyncDay, setAutoSyncDay] = useState<number | null>(null);
  const autoSyncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAutoSync = useCallback(() => {
    if (autoSyncInterval.current) {
      clearInterval(autoSyncInterval.current);
      autoSyncInterval.current = null;
    }
    setAutoSyncDay(null);
  }, []);

  useEffect(() => {
    return () => stopAutoSync();
  }, [stopAutoSync]);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => setUsers(data.users));
  }, []);

  const runDaySync = useCallback(async (day: number): Promise<boolean> => {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, action: "day", day }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(data.message);
      return !!data.inProgress;
    } else {
      setMessage(data.error || "SYNC FAILED");
      return false;
    }
  }, [userName]);

  const handleSync = async (action: string, day?: number) => {
    stopAutoSync();
    setSyncing(true);
    setMessage("");

    if (action === "day" && day) {
      const inProgress = await runDaySync(day);
      setSyncing(false);
      if (inProgress) {
        setAutoSyncDay(day);
        autoSyncInterval.current = setInterval(async () => {
          const stillInProgress = await runDaySync(day);
          if (!stillInProgress) {
            stopAutoSync();
          }
        }, 3 * 60 * 1000);
      }
      return;
    }

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

        {autoSyncDay && (
          <div className="flex items-center gap-2">
            <p className="font-pixel text-xs text-retro-yellow animate-pulse">
              AUTO-SYNCING DAY {autoSyncDay} EVERY 3 MIN...
            </p>
            <button
              onClick={stopAutoSync}
              className="retro-btn text-xs px-2 py-0.5"
            >
              STOP
            </button>
          </div>
        )}
        {message && (
          <p className="font-pixel text-xs text-retro-green">{message}</p>
        )}
      </div>

      {/* PIN Management */}
      <div className="mt-4 border-t-2 border-retro-border pt-4">
        <h3 className="font-pixel text-xs text-retro-cyan mb-3">CHANGE USER PIN</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="retro-select text-xs"
          >
            <option value="">SELECT USER</option>
            {users.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            maxLength={4}
            placeholder="NEW PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            className="retro-input w-20 text-xs text-center"
          />
          <button
            onClick={async () => {
              setPinMessage("");
              const res = await fetch("/api/admin/pin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  adminName: userName,
                  adminPin: pin,
                  targetUser: selectedUser,
                  newPin,
                }),
              });
              const data = await res.json();
              setPinMessage(data.message || data.error);
              if (res.ok) {
                setNewPin("");
                setSelectedUser("");
              }
            }}
            disabled={!selectedUser || newPin.length !== 4}
            className="retro-btn text-xs px-3 py-1"
          >
            UPDATE
          </button>
        </div>
        {pinMessage && (
          <p className={`font-pixel text-xs mt-2 ${
            pinMessage.startsWith("PIN") ? "text-retro-green" : "text-retro-red"
          }`}>
            {pinMessage}
          </p>
        )}
      </div>

    </div>
  );
}
