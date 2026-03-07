import fs from "fs";
import path from "path";

let initialized = false;

export function ensureInit() {
  if (initialized) return;
  initialized = true;

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Start cron jobs (only in production or when running the server)
  if (typeof window === "undefined") {
    import("./cron").then(({ startCronJobs }) => startCronJobs());
  }
}
