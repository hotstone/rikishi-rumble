import cron from "node-cron";
import { getConfig } from "./config";
import { syncAllDays, syncCurrentDay } from "./sync";

let scheduled = false;

export function startCronJobs() {
  if (scheduled) return;
  scheduled = true;

  // 7:30 PM JST
  cron.schedule(
    "30 19 * * *",
    async () => {
      console.log("[cron:730pm] Running scheduled sync...");
      try {
        const config = getConfig();
        const result = await syncAllDays(config.basho);
        console.log(`[cron:730pm] Sync complete: ${result.synced} days synced, ${result.pending} pending`);
      } catch (error) {
        console.error("[cron:730pm] Sync failed:", error);
      }
    },
    { timezone: "Asia/Tokyo" }
  );

  // 8:00 PM JST
  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("[cron:800pm] Running scheduled sync...");
      try {
        const config = getConfig();
        const result = await syncAllDays(config.basho);
        console.log(`[cron:800pm] Sync complete: ${result.synced} days synced, ${result.pending} pending`);
      } catch (error) {
        console.error("[cron:800pm] Sync failed:", error);
      }
    },
    { timezone: "Asia/Tokyo" }
  );

  // Every 2 minutes between 5:00 PM and 7:00 PM JST — syncs only the current day
  const intervalHandler = async () => {
    console.log("[cron:interval] Running current-day sync...");
    try {
      const config = getConfig();
      const result = await syncCurrentDay(config.basho);
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
  };
  const tokyo = { timezone: "Asia/Tokyo" };
  cron.schedule("*/2 17-18 * * *", intervalHandler, tokyo);
  cron.schedule("0 19 * * *", intervalHandler, tokyo);

  console.log("[cron] Scheduled sync jobs: 7:30 PM JST, 8:00 PM JST, and every 2 min 5-7 PM JST");
}
