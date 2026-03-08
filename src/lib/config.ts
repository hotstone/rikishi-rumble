import fs from "fs";
import path from "path";
import { AppConfig } from "@/types";

let cachedConfig: AppConfig | null = null;

function getConfigPath(): string {
  const dataDir = process.env.DATA_DIR;
  if (dataDir) {
    const volumePath = path.join(dataDir, "config.json");
    // Seed config to volume on first run
    if (!fs.existsSync(volumePath)) {
      const bundledPath = path.join(process.cwd(), "config.json");
      fs.copyFileSync(bundledPath, volumePath);
    }
    return volumePath;
  }
  return path.join(process.cwd(), "config.json");
}

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const raw = fs.readFileSync(getConfigPath(), "utf-8");
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

export function updateUserPin(targetName: string, newPin: string): boolean {
  const configPath = getConfigPath();
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as AppConfig;

  const user = config.users.find((u) => u.name === targetName);
  if (!user) return false;

  user.pin = newPin;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  cachedConfig = null;
  return true;
}
