"use client";

import { useState, useEffect } from "react";
import { UserAuth, useAuth } from "@/components/UserAuth";
import { Leaderboard } from "@/components/Leaderboard";
import { StableSelector } from "@/components/StableSelector";
import { SubstitutionPanel } from "@/components/SubstitutionPanel";
import { AdminPanel } from "@/components/AdminPanel";
import { BashoPage } from "@/components/BashoPage";
import { RulesPanel } from "@/components/RulesPanel";
import { bashoLabel } from "@/lib/basho";

type Tab = "home" | "leaderboard" | "basho" | "rules" | "stable" | "substitution" | "admin";
const VALID_TABS = new Set<Tab>(["home", "leaderboard", "basho", "rules", "stable", "substitution", "admin"]);

function tabFromHash(loggedIn: boolean): Tab {
  const hash = window.location.hash.slice(1);
  if (VALID_TABS.has(hash as Tab)) return hash as Tab;
  return loggedIn ? "leaderboard" : "home";
}

export default function Home() {
  const { session, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const scanlines = true;
  const [basho, setBasho] = useState("");
  const [currentDay, setCurrentDay] = useState(0);
  const [hasSubClash, setHasSubClash] = useState(false);

  useEffect(() => {
    setActiveTab(tabFromHash(!!session));
    const onPopState = () => setActiveTab(tabFromHash(!!session));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [session]);

  // Fetch basho info (public endpoint) always
  useEffect(() => {
    fetch("/api/basho")
      .then((r) => r.json())
      .then((data) => setBasho(data.basho || ""));
  }, []);

  // Fetch leaderboard data when logged in
  useEffect(() => {
    if (!session) return;
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data) => setCurrentDay(data.currentDay || 0));
  }, [session]);

  useEffect(() => {
    if (!session || currentDay === 0) return;
    Promise.all([
      fetch(`/api/stable?userId=${session.userId}`).then((r) => r.json()),
      fetch("/api/basho/bouts").then((r) => r.json()),
    ]).then(([stableData, boutsData]) => {
      const stableIds = new Set<number>((stableData.stable ?? []).map((s: { rikishi_id: number }) => s.rikishi_id));
      const nextDayBouts: { east_id: number; west_id: number }[] = boutsData.boutsByDay?.[currentDay + 1] ?? [];
      setHasSubClash(nextDayBouts.some((b) => stableIds.has(b.east_id) && stableIds.has(b.west_id)));
    });
  }, [session, currentDay]);

  const navigateTo = (tab: Tab) => {
    window.history.pushState(null, "", `#${tab}`);
    setActiveTab(tab);
  };

  const handleLogin = (user: { userId: string; name: string; admin: boolean }) => {
    login(user);
    navigateTo("leaderboard");
  };

  const handleLogout = () => {
    logout();
    navigateTo("home");
  };

  // Tabs for logged-in users
  const authedTabs: { id: Tab; label: string; requiresAdmin?: boolean }[] = [
    { id: "leaderboard", label: "SCORES" },
    { id: "basho", label: "BASHO" },
    { id: "stable", label: "STABLE" },
    { id: "substitution", label: "SUBS" },
    { id: "rules", label: "RULES" },
    { id: "admin", label: "ADMIN", requiresAdmin: true },
  ];

  // Tabs for landing page (not logged in)
  const publicTabs: { id: Tab; label: string }[] = [
    { id: "home", label: "HOME" },
    { id: "rules", label: "RULES" },
  ];

  const visibleTabs = session ? authedTabs : publicTabs;

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
                  {bashoLabel(basho)}{currentDay > 0 && ` - DAY ${currentDay}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <UserAuth
                session={session}
                onLogin={handleLogin}
                onLogout={handleLogout}
              />
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto">
            {visibleTabs.map((tab) => {
              if ("requiresAdmin" in tab && tab.requiresAdmin && !session?.admin) return null;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigateTo(tab.id)}
                  className={`retro-tab ${
                    activeTab === tab.id ? "retro-tab-active" : ""
                  }`}
                >
                  {tab.label}
                  {tab.id === "substitution" && hasSubClash && (
                    <span className="text-retro-red ml-1">!</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Public pages */}
        {activeTab === "home" && !session && (
          <div className="retro-panel">
            <div className="retro-panel-header">
              <h2 className="font-pixel text-sm">WELCOME</h2>
            </div>
            <div className="space-y-4 font-pixel text-xs">
              <p className="text-retro-cyan">
                WELCOME TO RIKISHI RUMBLE - THE SUMO TIPPING GAME!
              </p>
              <p className="text-gray-300">
                BUILD YOUR STABLE OF 5 WRESTLERS ACROSS 5 RANK TIERS.
                EARN POINTS WHEN YOUR WRESTLERS WIN THEIR BOUTS DURING
                THE 15-DAY BASHO TOURNAMENT.
              </p>
              <p className="text-gray-300">
                SCORE BONUS KIMBOSHI POINTS WHEN YOUR MAEGASHIRA
                DEFEATS A YOKOZUNA. MAKE STRATEGIC SUBSTITUTIONS EACH
                EVENING TO STAY AHEAD OF THE COMPETITION.
              </p>
              <p className="text-retro-yellow">
                LOG IN TO GET STARTED!
              </p>
            </div>
          </div>
        )}

        {activeTab === "rules" && <RulesPanel />}

        {/* Authenticated pages */}
        {activeTab === "leaderboard" && session && <Leaderboard />}

        {activeTab === "basho" && session && <BashoPage userName={session?.name} />}

        {activeTab === "stable" && session && (
          <StableSelector
            userId={session.userId}
            userName={session.name}
          />
        )}

        {activeTab === "substitution" && session && (
          <SubstitutionPanel
            userId={session.userId}
            userName={session.name}
          />
        )}

        {activeTab === "admin" && session?.admin && (
          <AdminPanel userName={session.name} />
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
