"use client";

import { useState, useEffect } from "react";

interface CountdownData {
  targetDate: string;
  bashoLabel: string;
}

function timeLeft(target: Date): { days: number; hours: number; minutes: number; seconds: number } | null {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function BashoCountdown() {
  const [countdown, setCountdown] = useState<CountdownData | null>(null);
  const [remaining, setRemaining] = useState<ReturnType<typeof timeLeft>>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/basho")
      .then((r) => r.json())
      .then((data) => {
        if (data.countdown?.targetDate) {
          setCountdown({ targetDate: data.countdown.targetDate, bashoLabel: data.countdown.bashoLabel });
        }
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!countdown) return;
    const target = new Date(countdown.targetDate);
    setRemaining(timeLeft(target));
    const interval = setInterval(() => {
      const left = timeLeft(target);
      setRemaining(left);
      if (!left) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  if (!loaded || !countdown || !remaining) return null;

  return (
    <div className="bg-retro-border border-b-3 border-retro-cyan">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3">
        <span className="font-pixel text-[8px] sm:text-xs text-retro-cyan">
          {countdown.bashoLabel}
        </span>
        <span className="font-pixel text-[8px] sm:text-xs text-retro-yellow">
          {remaining.days > 0 && `${remaining.days}D `}
          {pad(remaining.hours)}:{pad(remaining.minutes)}:{pad(remaining.seconds)}
        </span>
      </div>
    </div>
  );
}
