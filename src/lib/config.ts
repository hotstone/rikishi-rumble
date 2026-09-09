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



