import cron from "node-cron";
import { getConfig } from "./config";
import { syncAllDays } from "./sync";

let scheduled = false;

export function startCronJobs() {
  if (scheduled) return;
  scheduled = true;

  // 7:30 PM AEST = 8:30 UTC (during AEDT it's 8:30 AM UTC, during AEST it's 9:30 AM UTC)
  // Using Australia/Sydney timezone directly
  cron.schedule(
    "30 19 * * *",
    async () => {
      console.log("[cron] Running 7:30 PM AEST sync...");
      try {
        const config = getConfig();
        const result = await syncAllDays(config.basho);
        console.log(`[cron] Sync complete: ${result.synced} days synced, ${result.pending} pending`);
      } catch (error) {
        console.error("[cron] Sync failed:", error);
      }
    },
    { timezone: "Australia/Sydney" }
  );

  // 8:00 PM AEST
  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("[cron] Running 8:00 PM AEST sync...");
      try {
        const config = getConfig();
        const result = await syncAllDays(config.basho);
        console.log(`[cron] Sync complete: ${result.synced} days synced, ${result.pending} pending`);
      } catch (error) {
        console.error("[cron] Sync failed:", error);
      }
    },
    { timezone: "Australia/Sydney" }
  );

  console.log("[cron] Scheduled sync jobs at 7:30 PM and 8:00 PM AEST");
}
