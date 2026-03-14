import crypto from "crypto";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

let authToken: string | null = null;

export function initAuth(): void {
  if (config.noAuth) {
    logger.warn("Auth", "Authentication disabled (--no-auth). Anyone on the network can execute code.");
    authToken = null;
    return;
  }

  authToken = config.token || crypto.randomBytes(32).toString("hex");
  logger.info("Auth", `Token: ${authToken}`);
  logger.info("Auth", `Set this in your connector: getgenv().VSConnectToken = "${authToken}"`);
}

export function getToken(): string | null {
  return authToken;
}

export function generateToken(): string {
  if (!authToken) {
    authToken = config.token || crypto.randomBytes(32).toString("hex");
  }
  return authToken;
}

export function isAuthEnabled(): boolean {
  return !config.noAuth;
}

export function validateToken(token: string | null | undefined): boolean {
  if (!isAuthEnabled()) return true;
  if (!token || !authToken) return false;
  return crypto.timingSafeEqual(
    Buffer.from(token.padEnd(64, "\0")),
    Buffer.from(authToken.padEnd(64, "\0"))
  );
}

export function extractTokenFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
