import crypto from "crypto";
import { WebSocket } from "ws";
import type { RobloxClient } from "../types.js";
import { getToolTimeout } from "../config.js";
import { logger } from "../utils/logger.js";
import { resolveTargetClient, getActiveClients } from "./registry.js";

// ─── State ───────────────────────────────────────────────────────────────────
export let instanceRole: "primary" | "secondary" = "primary";
export function setInstanceRole(role: "primary" | "secondary"): void {
  instanceRole = role;
}

// Primary-mode resolvers
export let httpResponseResolvers: Map<string, (data: any) => void> = new Map();
export let requestToClientId: Map<string, string> = new Map();

// Relay state
export let relayClients: Set<WebSocket> = new Set();
export let relayRequestOrigin: Map<string, WebSocket> = new Map();

// Secondary-mode state
export let relaySocket: WebSocket | null = null;
export let secondaryResponseResolvers: Map<string, (data: any) => void> = new Map();

export function setRelaySocket(ws: WebSocket | null): void {
  relaySocket = ws;
}

export function resetPrimaryState(): void {
  httpResponseResolvers = new Map();
  requestToClientId = new Map();
  relayClients = new Set();
  relayRequestOrigin = new Map();
}

export function resetSecondaryState(): void {
  secondaryResponseResolvers = new Map();
}

// ─── Send to a single client ─────────────────────────────────────────────────
export function SendToClient(target: RobloxClient, message: string): void {
  if (target.transport === "ws" && target.ws && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(message);
  } else if (target.transport === "http") {
    target.pendingHttpCommand = message;
  }
}

// ─── Wait for a response by request ID ───────────────────────────────────────
export function GetResponseOfIdFromClient(
  id: string,
  timeoutMs?: number
): Promise<any> {
  const timeout = timeoutMs ?? 15000;

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout;

    const resolveOnce = (data: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(data);
    };

    timer = setTimeout(() => {
      if (instanceRole === "secondary") {
        secondaryResponseResolvers.delete(id);
      } else {
        httpResponseResolvers.delete(id);
      }
      resolveOnce({
        id,
        output: undefined,
        error: `Timed out waiting for response after ${timeout}ms.`,
      });
    }, timeout);

    if (instanceRole === "secondary") {
      secondaryResponseResolvers.set(id, resolveOnce);
      return;
    }
    httpResponseResolvers.set(id, resolveOnce);
  });
}

// ─── Send arbitrary data and get request ID ──────────────────────────────────
export function SendArbitraryDataToClient(
  type: string,
  data: any,
  id?: string,
  clientId?: string
): string | null {
  if (instanceRole === "secondary") {
    if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) return null;
    if (id === undefined) id = crypto.randomUUID();
    const message = { id, ...data, type, ...(clientId ? { targetClientId: clientId } : {}) };
    relaySocket.send(JSON.stringify(message));
    return id;
  }

  if (clientId !== undefined) {
    const target = resolveTargetClient(clientId);
    if (!target) return "INVALID_CLIENT";
    if (id === undefined) id = crypto.randomUUID();
    const message = { id, ...data, type };
    requestToClientId.set(id, target.clientId);
    SendToClient(target, JSON.stringify(message));
    return id;
  }

  // Broadcast to all active clients
  const activeClients = getActiveClients();
  if (activeClients.length === 0) return null;
  if (id === undefined) id = crypto.randomUUID();
  const message = { id, ...data, type };

  for (const target of activeClients) {
    requestToClientId.set(id, target.clientId);
    SendToClient(target, JSON.stringify(message));
  }
  return id;
}

// ─── Handle response from Roblox client ──────────────────────────────────────
export function handleRobloxResponse(data: any): void {
  const id = data.id;
  if (!id) return;

  // Check if this response should be relayed to a secondary
  const relayOrigin = relayRequestOrigin.get(id);
  if (relayOrigin) {
    relayRequestOrigin.delete(id);
    if (relayOrigin.readyState === WebSocket.OPEN) {
      relayOrigin.send(JSON.stringify(data));
    }
    return;
  }

  // Resolve local promise
  const resolver = httpResponseResolvers.get(id);
  if (resolver) {
    httpResponseResolvers.delete(id);
    resolver(data);
  }
}
