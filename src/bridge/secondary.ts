import { WebSocket } from "ws";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { isAuthEnabled, getToken } from "../auth.js";
import { setInstanceRole, setRelaySocket, secondaryResponseResolvers, resetSecondaryState } from "./transport.js";
import { tryPromote } from "./boot.js";

export function startAsSecondary(
  relayUrl: string = `ws://localhost:${config.port}/mcp-relay`,
  onFailed?: () => void
): void {
  setInstanceRole("secondary");
  resetSecondaryState();

  // Append token to relay URL if auth is enabled
  let url = relayUrl;
  if (isAuthEnabled()) {
    const token = getToken();
    if (token) {
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}token=${token}`;
    }
  }

  logger.info("Secondary", `Connecting to primary relay at ${relayUrl} ...`);
  const ws = new WebSocket(url);
  setRelaySocket(ws);

  let everConnected = false;

  ws.on("open", () => {
    everConnected = true;
    logger.info("Secondary", "Connected to primary via relay.");
  });

  ws.on("message", (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());
      if (data.id && secondaryResponseResolvers.has(data.id)) {
        secondaryResponseResolvers.get(data.id)!(data);
        secondaryResponseResolvers.delete(data.id);
      }
    } catch (e) {
      logger.error("Secondary", "Error parsing relay response:", e);
    }
  });

  ws.on("close", () => {
    setRelaySocket(null);
    for (const [id, resolver] of secondaryResponseResolvers.entries()) {
      resolver({ id, output: undefined });
    }
    secondaryResponseResolvers.clear();

    if (!everConnected && onFailed) {
      logger.warn("Secondary", "Never connected — remote unreachable. Falling back to primary mode.");
      onFailed();
    } else if (everConnected) {
      logger.info("Secondary", "Lost connection to primary. Attempting promotion...");
      tryPromote();
    }
  });

  ws.on("error", (err) => {
    logger.error("Secondary", "Relay socket error:", err.message);
  });
}
