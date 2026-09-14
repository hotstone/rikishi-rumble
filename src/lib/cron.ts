import cron from "node-cron";
import { getActiveBashoId } from "./active-basho";
import { syncAllDays, syncCurrentDay, syncMissingDays } from "./sync";

let scheduled = false;

async function runFullSync(label: string) {
  console.log(`[cron:${label}] Running scheduled sync...`);
  try {
    const bashoId = getActiveBashoId();
    if (!bashoId) {
      console.log(`[cron:${label}] Skipped: no active basho`);
      return;
    }
    const result = await syncAllDays(bashoId);
    console.log(`[cron:${label}] Sync complete: ${result.synced} days synced, ${result.pending} pending`);
  } catch (error) {
    console.error(`[cron:${label}] Sync failed:`, error);
  }
}

async function runCurrentDaySync() {
  console.log("[cron:interval] Running current-day sync...");
  try {
    const bashoId = getActiveBashoId();
    if (!bashoId) {
      console.log("[cron:interval] Skipped: no active basho");
      return;
    }
    const result = await syncCurrentDay(bashoId);
    if (!result) {
      console.log("[cron:interval] Skipped: basho not active");
      return;
    }
    console.log(
      `[cron:interval] Sync complete: day ${result.day}, ${result.bouts} bouts${result.pending ? " (pending)" : ""}${result.inProgress ? " (in progress)" : ""}`
    );
  } catch (error) {
    console.error("[cron:interval] Sync failed:", error);
  }
}

async function runCatchupSync() {
  try {
    const bashoId = getActiveBashoId();
    if (!bashoId) return;
    const synced = await syncMissingDays(bashoId);
    if (synced.length > 0) {
      console.log(`[cron:catchup] Fetched missing bouts for day(s) ${synced.join(", ")}`);
    }
  } catch (error) {
    console.error("[cron:catchup] Sync failed:", error);
  }
}

export function startCronJobs() {
  if (scheduled) return;
  scheduled = true;

  const tokyo = { timezone: "Asia/Tokyo" };

  cron.schedule("0,5,10 18 * * *", () => runFullSync("6pm"), tokyo);
  cron.schedule("30 19 * * *", () => runFullSync("730pm"), tokyo);
  cron.schedule("0 20 * * *", () => runFullSync("800pm"), tokyo);

  // Every 2 minutes between 4:00 PM and 6:00 PM JST — syncs only the current day
  cron.schedule("*/2 16-17 * * *", runCurrentDaySync, tokyo);

  // Every 30 minutes — fetches today's/tomorrow's bouts if not yet in the DB
  // (torikumi often publishes after the 8 PM full sync); no-ops once present
  cron.schedule("15,45 * * * *", runCatchupSync, tokyo);

  console.log("[cron] Scheduled sync jobs: 6:00/6:05/6:10 PM, 7:30 PM, 8:00 PM JST, every 2 min 4-6 PM JST, and half-hourly catch-up");
}
