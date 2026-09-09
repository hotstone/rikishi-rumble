"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface AccountOption {
  id: string;
  display_name: string;
}

export function AdminPanel() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
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
    fetch("/api/admin/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts || []));
  }, []);

  const runDaySync = useCallback(async (day: number): Promise<boolean> => {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "day", day }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(data.message);
      return !!data.inProgress;
    } else {
      setMessage(data.error || "SYNC FAILED");
      return false;
    }
  }, []);

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
      body: JSON.stringify({ action, day }),
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

      {/* Cron control */}
      <div className="mt-4 border-t-2 border-retro-border pt-4">
        <h3 className="font-pixel text-xs text-retro-cyan mb-3">CRON JOBS</h3>
        <button
          onClick={async () => {
            const res = await fetch("/api/cron", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const data = await res.json();
            setMessage(data.message || data.error || "DONE");
          }}
          className="retro-btn w-full text-xs py-2"
        >
          START CRON JOBS
        </button>
      </div>

      {/* Password Reset */}
      <div className="mt-4 border-t-2 border-retro-border pt-4">
        <h3 className="font-pixel text-xs text-retro-cyan mb-3">RESET USER PASSWORD</h3>
        <p className="font-pixel text-xs text-gray-400 mb-2">
          SETS A TEMPORARY PASSWORD — TELL THE USER OUT-OF-BAND
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="retro-select text-xs"
          >
            <option value="">SELECT USER</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="TEMP PASSWORD"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            className="retro-input w-32 text-xs text-center"
          />
          <button
            onClick={async () => {
              setResetMessage("");
              const res = await fetch("/api/admin/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountId: selectedAccount, tempPassword }),
              });
              const data = await res.json();
              setResetMessage(data.message || data.error);
              if (res.ok) {
                setSelectedAccount("");
                setTempPassword("");
              }
            }}
            disabled={!selectedAccount || tempPassword.length < 8}
            className="retro-btn text-xs px-3 py-1"
          >
            RESET
          </button>
        </div>
        {resetMessage && (
          <p className={`font-pixel text-xs mt-2 ${
            resetMessage.startsWith("Temporary") ? "text-retro-green" : "text-retro-red"
          }`}>
            {resetMessage}
          </p>
        )}
      </div>

    </div>
  );
}
