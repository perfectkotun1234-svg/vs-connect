import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "./logger.js";

const CACHE_DIR = path.join(process.cwd(), ".vs-connect-cache", "scripts");

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheKey(placeId: number, scriptPath: string): string {
  const hash = crypto.createHash("sha256").update(`${placeId}:${scriptPath}`).digest("hex").slice(0, 16);
  return hash;
}

export function getCachedScript(placeId: number, scriptPath: string): string | null {
  ensureCacheDir();
  const key = cacheKey(placeId, scriptPath);
  const filePath = path.join(CACHE_DIR, `${key}.lua`);
  if (fs.existsSync(filePath)) {
    logger.debug("ScriptCache", `Cache hit: ${scriptPath}`);
    return fs.readFileSync(filePath, "utf-8");
  }
  return null;
}

export function setCachedScript(placeId: number, scriptPath: string, content: string): void {
  ensureCacheDir();
  const key = cacheKey(placeId, scriptPath);
  const filePath = path.join(CACHE_DIR, `${key}.lua`);
  const metaPath = path.join(CACHE_DIR, `${key}.json`);
  fs.writeFileSync(filePath, content, "utf-8");
  fs.writeFileSync(metaPath, JSON.stringify({ placeId, scriptPath, cachedAt: Date.now() }), "utf-8");
  logger.debug("ScriptCache", `Cached: ${scriptPath}`);
}

export function clearScriptCache(): { deleted: number } {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(CACHE_DIR, file));
  }
  return { deleted: files.length };
}

export function getScriptCacheStats(): { entries: number; sizeBytes: number } {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".lua"));
  let totalSize = 0;
  for (const file of files) {
    totalSize += fs.statSync(path.join(CACHE_DIR, file)).size;
  }
  return { entries: files.length, sizeBytes: totalSize };
}
