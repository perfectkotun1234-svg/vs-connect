import crypto from "crypto";
import { WebSocket } from "ws";
import type { RobloxClient } from "../types.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export let clientRegistry: Map<string, RobloxClient> = new Map();
export let wsToClientId: Map<WebSocket, string> = new Map();

export function resetRegistry(): void {
  clientRegistry = new Map();
  wsToClientId = new Map();
}

export function registerClient(info: {
  username: string;
  userId: number;
  placeId: number;
  jobId: string;
  placeName: string;
  transport: "ws" | "http";
  ws?: WebSocket;
}): string {
  const clientId = crypto.randomUUID();
  const now = Date.now();
  const entry: RobloxClient = {
    clientId,
    username: info.username,
    userId: info.userId,
    placeId: info.placeId,
    jobId: info.jobId,
    placeName: info.placeName,
    transport: info.transport,
    ws: info.ws,
    lastHttpPoll: now,
    lastHeartbeat: now,
    pendingHttpCommand: null,
  };
  clientRegistry.set(clientId, entry);
  if (info.ws) {
    wsToClientId.set(info.ws, clientId);
  }
  logger.info("Registry", `Client registered: ${clientId} (${info.username} @ ${info.placeName}, ${info.transport})`);
  return clientId;
}

export function unregisterClient(clientId: string): void {
  const entry = clientRegistry.get(clientId);
  if (entry?.ws) {
    wsToClientId.delete(entry.ws);
  }
  clientRegistry.delete(clientId);
  logger.info("Registry", `Client unregistered: ${clientId}`);
}

export function getActiveClients(): RobloxClient[] {
  const active: RobloxClient[] = [];
  for (const entry of clientRegistry.values()) {
    if (entry.transport === "ws") {
      if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
        active.push(entry);
      }
    } else {
      if (Date.now() - entry.lastHttpPoll < config.httpPollTimeout) {
        active.push(entry);
      }
    }
  }
  return active;
}

export function formatActiveClientListForTool(): string {
  const active = getActiveClients();
  if (active.length === 0) {
    return "No Roblox clients are currently connected.";
  }
  return JSON.stringify(
    active.map((c) => ({
      clientId: c.clientId,
      username: c.username,
      placeId: c.placeId,
      jobId: c.jobId,
      placeName: c.placeName,
      transport: c.transport,
    })),
    null,
    2
  );
}

export function resolveTargetClient(clientId?: string): RobloxClient | null {
  if (clientId) {
    const entry = clientRegistry.get(clientId);
    if (!entry) return null;
    if (entry.transport === "ws" && (!entry.ws || entry.ws.readyState !== WebSocket.OPEN)) return null;
    if (entry.transport === "http" && Date.now() - entry.lastHttpPoll >= config.httpPollTimeout) return null;
    return entry;
  }
  const active = getActiveClients();
  if (active.length === 0) return null;
  const wsCl = active.filter((c) => c.transport === "ws");
  if (wsCl.length > 0) return wsCl[wsCl.length - 1];
  return active.sort((a, b) => b.lastHttpPoll - a.lastHttpPoll)[0];
}

export function handleHeartbeat(clientId: string): boolean {
  const entry = clientRegistry.get(clientId);
  if (!entry) return false;
  entry.lastHeartbeat = Date.now();
  return true;
}

// Clean up stale clients periodically
export function startStaleClientChecker(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, client] of clientRegistry.entries()) {
      if (now - client.lastHeartbeat > config.staleClientTimeout) {
        logger.warn("Registry", `Client ${id} (${client.username}) is stale, removing`);
        unregisterClient(id);
      }
    }
  }, config.heartbeatInterval);
}
