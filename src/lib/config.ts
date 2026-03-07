import fs from "fs";
import path from "path";
import { AppConfig } from "@/types";

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(process.cwd(), "config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  cachedConfig = JSON.parse(raw) as AppConfig;
  return cachedConfig;
}

export function reloadConfig(): AppConfig {
  cachedConfig = null;
  return getConfig();
}

export function validatePin(userName: string, pin: string): boolean {
  const config = getConfig();
  const user = config.users.find((u) => u.name === userName);
  return user?.pin === pin;
}

export function isAdmin(userName: string): boolean {
  const config = getConfig();
  const user = config.users.find((u) => u.name === userName);
  return user?.admin ?? false;
}
