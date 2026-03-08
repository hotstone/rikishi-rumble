"use client";

import { useState, useEffect } from "react";

interface UserSession {
  userId: string;
  name: string;
  admin: boolean;
}

interface UserOption {
  id: string;
  name: string;
}

export function useAuth() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("rikishi-session");
    if (stored) setSession(JSON.parse(stored));
    setHydrated(true);
  }, []);

  const login = (user: UserSession) => {
    localStorage.setItem("rikishi-session", JSON.stringify(user));
    setSession(user);
  };

  const logout = () => {
    localStorage.removeItem("rikishi-session");
    setSession(null);
  };

  return { session, login, logout, hydrated };
}

export function UserAuth({
  session,
  onLogin,
  onLogout,
}: {
  session: UserSession | null;
  onLogin: (user: UserSession) => void;
  onLogout: () => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => setUsers(data.users));
  }, []);

  const handleLogin = async () => {
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: selectedUser, pin }),
    });
    if (res.ok) {
      const data = await res.json();
      onLogin(data);
      setPin("");
    } else {
      setError("Invalid PIN");
    }
  };

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-retro-yellow font-pixel text-xs">
          {session.name}
          {session.admin && " [ADMIN]"}
        </span>
        <button
          onClick={onLogout}
          className="retro-btn text-xs px-2 py-1"
        >
          LOGOUT
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
      <select
        value={selectedUser}
        onChange={(e) => setSelectedUser(e.target.value)}
        className="retro-select text-xs max-w-[130px] sm:max-w-none"
      >
        <option value="">PLAYER</option>
        {users.map((u) => (
          <option key={u.id} value={u.name}>
            {u.name}
          </option>
        ))}
      </select>
      <input
        type="password"
        maxLength={4}
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        className="retro-input w-14 sm:w-16 text-xs text-center"
      />
      <button
        onClick={handleLogin}
        disabled={!selectedUser || pin.length !== 4}
        className="retro-btn text-xs px-2 py-1"
      >
        GO
      </button>
      {error && (
        <span className="text-retro-red text-xs font-pixel">{error}</span>
      )}
    </div>
  );
}
