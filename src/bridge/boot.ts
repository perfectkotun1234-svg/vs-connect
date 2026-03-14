import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { startAsPrimary } from "./primary.js";
import { startAsSecondary } from "./secondary.js";

export function tryPromote(): void {
  const jitter = Math.floor(Math.random() * config.promotionJitterMax);
  logger.info("Promote", `Waiting ${jitter}ms before attempting promotion...`);

  setTimeout(async () => {
    try {
      await startAsPrimary();
      logger.info("Promote", "Successfully promoted to primary!");
    } catch {
      logger.info("Promote", "Another instance already claimed primary. Reconnecting as secondary...");
      setTimeout(() => startAsSecondary(), 200);
    }
  }, jitter);
}

export async function boot(): Promise<void> {
  if (config.baseUrl) {
    const relayUrl = config.baseUrl.replace(/\/$/, "") + "/mcp-relay";
    logger.info("Boot", `--baseurl mode: targeting relay at ${relayUrl}`);

    startAsSecondary(relayUrl, async () => {
      logger.info("Boot", "Remote unreachable — starting as primary (fallback).");
      try {
        await startAsPrimary();
        logger.info("Boot", "Primary started successfully (fallback from --baseurl).");
      } catch (err: any) {
        if (err?.code === "EADDRINUSE") {
          logger.info("Boot", "Port in use locally too — becoming secondary to localhost.");
          startAsSecondary();
        } else {
          logger.error("Boot", "Fatal error during fallback primary start:", err);
          process.exit(1);
        }
      }
    });
    return;
  }

  try {
    await startAsPrimary();
  } catch (err: any) {
    if (err?.code === "EADDRINUSE") {
      startAsSecondary();
    } else {
      logger.error("Boot", "Fatal error:", err);
      process.exit(1);
    }
  }
}
