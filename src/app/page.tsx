"use client";

import { useState, useEffect } from "react";
import { UserAuth, useAuth } from "@/components/UserAuth";
import { Leaderboard } from "@/components/Leaderboard";
import { StableSelector } from "@/components/StableSelector";
import { SubstitutionPanel } from "@/components/SubstitutionPanel";
import { AdminPanel } from "@/components/AdminPanel";
import { BashoPage } from "@/components/BashoPage";

type Tab = "leaderboard" | "basho" | "stable" | "substitution" | "admin";

export default function Home() {
  const { session, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("leaderboard");
  const [pin, setPin] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("rikishi-pin") || "";
  });
  const [scanlines, setScanlines] = useState(false);
  const [basho, setBasho] = useState("");
  const [currentDay, setCurrentDay] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/basho").then((r) => r.json()),
      fetch("/api/leaderboard").then((r) => r.json()),
    ]).then(([bashoData, lbData]) => {
      setBasho(bashoData.basho || "");
      setCurrentDay(lbData.currentDay || 0);
    });
  }, []);

  const handleLogin = (user: { userId: string; name: string; admin: boolean }) => {
    login(user);
    const pinInput = document.querySelector<HTMLInputElement>('input[type="password"]');
    if (pinInput) {
      setPin(pinInput.value);
      localStorage.setItem("rikishi-pin", pinInput.value);
    }
  };

  const handleLogout = () => {
    logout();
    setPin("");
    localStorage.removeItem("rikishi-pin");
    setActiveTab("leaderboard");
  };

  const tabs: { id: Tab; label: string; requiresAuth?: boolean; requiresAdmin?: boolean }[] = [
    { id: "leaderboard", label: "SCORES" },
    { id: "basho", label: "BASHO" },
    { id: "stable", label: "STABLE", requiresAuth: true },
    { id: "substitution", label: "SUBS", requiresAuth: true },
    { id: "admin", label: "ADMIN", requiresAuth: true, requiresAdmin: true },
  ];

  return (
    <div className={`min-h-screen ${scanlines ? "scanlines" : ""}`}>
      <header className="border-b-3 border-retro-border bg-retro-panel">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="font-pixel text-sm sm:text-lg text-retro-yellow title-glow">
                RIKISHI RUMBLE
              </h1>
              {basho && (
                <p className="font-pixel text-xs text-retro-cyan">
                  {basho}{currentDay > 0 && ` - DAY ${currentDay}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScanlines(!scanlines)}
                className="retro-btn text-xs px-2 py-1 opacity-50 hover:opacity-100"
                title="Toggle CRT effect"
              >
                CRT
              </button>
              <UserAuth
                session={session}
                onLogin={handleLogin}
                onLogout={handleLogout}
              />
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              if (tab.requiresAuth && !session) return null;
              if (tab.requiresAdmin && !session?.admin) return null;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`retro-tab ${
                    activeTab === tab.id ? "retro-tab-active" : ""
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {activeTab === "leaderboard" && <Leaderboard />}

        {activeTab === "basho" && <BashoPage />}

        {activeTab === "stable" && session && (
          <StableSelector
            userId={session.userId}
            userName={session.name}
            pin={pin}
          />
        )}

        {activeTab === "substitution" && session && (
          <SubstitutionPanel
            userId={session.userId}
            userName={session.name}
            pin={pin}
          />
        )}

        {activeTab === "admin" && session?.admin && (
          <AdminPanel userName={session.name} pin={pin} />
        )}
      </main>

      <footer className="border-t-3 border-retro-border bg-retro-panel mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-3 text-center">
          <p className="font-pixel text-xs text-gray-500">
            RIKISHI RUMBLE v1.0
          </p>
        </div>
      </footer>
    </div>
  );
}
