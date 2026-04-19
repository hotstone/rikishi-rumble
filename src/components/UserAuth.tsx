"use client";

import { useState, useEffect } from "react";

export interface UserSession {
  userId: string;
  name: string;
  admin: boolean;
}

export function useAuth() {
  const [session, setSession] = useState<UserSession | null>(null);

  useEffect(() => {
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("rikishi-session="));
    if (cookie) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookie.split("=")[1]));
        if (parsed.userId && parsed.name) {
          setSession(parsed);
        }
      } catch {
        // Invalid cookie
      }
    }
  }, []);

  const login = (user: UserSession) => {
    setSession(user);
  };

  const logout = () => {
    setSession(null);
    document.cookie = "rikishi-session=;Path=/;Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  };

  return { session, login, logout };
}

interface UserOption {
  name: string;
  id: string;
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
  const [selectedName, setSelectedName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [migrationState, setMigrationState] = useState<{
    name: string;
    pin: string;
    userId: string;
    admin: boolean;
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []));
  }, []);

  const handleLogin = async () => {
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: selectedName, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }

    if (data.needsPassword) {
      setMigrationState({
        name: selectedName,
        pin: password,
        userId: data.userId,
        admin: data.admin,
      });
      setPassword("");
      return;
    }

    onLogin({ userId: data.userId, name: data.name, admin: data.admin });
    setSelectedName("");
    setPassword("");
  };

  const handleSetPassword = async () => {
    setError("");
    if (!migrationState) return;

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: migrationState.name,
        pin: migrationState.pin,
        password: newPassword,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to set password");
      return;
    }

    onLogin({ userId: data.userId, name: data.name, admin: data.admin });
    setMigrationState(null);
    setNewPassword("");
    setConfirmPassword("");
  };

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-retro-yellow font-pixel text-xs">
          {session.name}
          {session.admin && " [ADMIN]"}
        </span>
        <button onClick={onLogout} className="retro-btn text-xs px-2 py-1">
          LOGOUT
        </button>
      </div>
    );
  }

  // Password setup form (migration from PIN)
  if (migrationState) {
    return (
      <div className="flex flex-col gap-2 items-end">
        <p className="text-retro-cyan font-pixel text-xs">
          SET YOUR PASSWORD ({migrationState.name})
        </p>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
          <input
            type="password"
            placeholder="NEW PASSWORD"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="retro-input w-24 sm:w-28 text-xs text-center"
          />
          <input
            type="password"
            placeholder="CONFIRM"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
            className="retro-input w-24 sm:w-28 text-xs text-center"
          />
          <button
            onClick={handleSetPassword}
            disabled={newPassword.length < 8 || !confirmPassword}
            className="retro-btn text-xs px-2 py-1"
          >
            SAVE
          </button>
        </div>
        <p className="text-gray-500 font-pixel text-xs">MIN 8 CHARACTERS</p>
        {error && (
          <span className="text-retro-red text-xs font-pixel">{error}</span>
        )}
      </div>
    );
  }

  // Login form
  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
      <select
        value={selectedName}
        onChange={(e) => setSelectedName(e.target.value)}
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
        placeholder="PASSWORD"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        className="retro-input w-20 sm:w-24 text-xs text-center"
      />
      <button
        onClick={handleLogin}
        disabled={!selectedName || !password}
        className="retro-btn text-xs px-2 py-1"
      >
        LOGIN
      </button>
      {error && (
        <span className="text-retro-red text-xs font-pixel">{error}</span>
      )}
    </div>
  );
}
