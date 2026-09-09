"use client";

import { useState, useEffect } from "react";
import type { UserSession } from "@/types";

export type { UserSession };

export function useAuth() {
  const [session, setSession] = useState<UserSession | null>(null);

  // The session cookie is httpOnly — ask the server who we are.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.userId && data?.name) setSession(data);
      })
      .catch(() => {});
  }, []);

  const login = (user: UserSession) => {
    setSession(user);
  };

  const logout = () => {
    setSession(null);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  };

  return { session, login, logout };
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }

    onLogin({ userId: data.userId, name: data.name, admin: data.admin });
    setEmail("");
    setPassword("");
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

  // Login form
  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
      <input
        type="email"
        placeholder="EMAIL"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="retro-input w-32 sm:w-40 text-xs text-center"
        autoComplete="email"
      />
      <input
        type="password"
        placeholder="PASSWORD"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        className="retro-input w-20 sm:w-24 text-xs text-center"
        autoComplete="current-password"
      />
      <button
        onClick={handleLogin}
        disabled={!email || !password}
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
