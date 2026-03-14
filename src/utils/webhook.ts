import { config } from "../config.js";
import { logger } from "./logger.js";

export async function sendWebhook(event: string, data: Record<string, any>): Promise<void> {
  const url = config.webhookUrl;
  if (!url) return;

  const colors: Record<string, number> = {
    "client.connected": 0x2dd4bf,
    "client.disconnected": 0xf87171,
  };

  const embed = {
    title: `VS Connect — ${event}`,
    color: colors[event] ?? 0xa1a1aa,
    fields: Object.entries(data).map(([k, v]) => ({
      name: k,
      value: String(v),
      inline: true,
    })),
    timestamp: new Date().toISOString(),
    footer: { text: "VS Connect MCP Server" },
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err: any) {
    logger.warn("Webhook", `Failed to send webhook: ${err.message}`);
  }
}
