import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "./utils/logger.js";
import { resolveTargetClient } from "./bridge/registry.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient } from "./bridge/transport.js";

const LUAU_EXTENSIONS = new Set([".luau", ".lua"]);
const DEBOUNCE_MS = 300;

let watcher: fs.FSWatcher | null = null;
let debounceTimers: Map<string, NodeJS.Timeout> = new Map();
let executionLog: Array<{ file: string; time: number; success: boolean; output?: string }> = [];

export function getExecutionLog() {
  return executionLog;
}

export function clearExecutionLog() {
  executionLog = [];
}

async function executeFile(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const target = resolveTargetClient();

  if (!target) {
    logger.warn("Watcher", `No client connected — skipping ${fileName}`);
    executionLog.unshift({ file: fileName, time: Date.now(), success: false, output: "No client connected" });
    return;
  }

  let code: string;
  try {
    code = fs.readFileSync(filePath, "utf-8");
  } catch (err: any) {
    logger.error("Watcher", `Failed to read ${filePath}: ${err.message}`);
    return;
  }

  if (!code.trim()) {
    logger.debug("Watcher", `Empty file — skipping ${fileName}`);
    return;
  }

  logger.info("Watcher", `Executing ${fileName} on ${target.username} (${target.placeName})`);

  const id = crypto.randomUUID();
  const sendResult = SendArbitraryDataToClient(
    "get-data-by-code",
    { source: `setthreadidentity(8);${code}` },
    id,
    target.clientId
  );

  if (!sendResult || sendResult === "INVALID_CLIENT") {
    logger.error("Watcher", `Failed to send ${fileName} to client`);
    executionLog.unshift({ file: fileName, time: Date.now(), success: false, output: "Send failed" });
    return;
  }

  const response = await GetResponseOfIdFromClient(id, 30000);
  const output = response?.output ?? response?.error ?? "Executed (no return value)";
  const success = !response?.error;

  logger.info("Watcher", `${fileName} → ${success ? "OK" : "ERROR"}: ${output.substring(0, 200)}`);
  executionLog.unshift({ file: fileName, time: Date.now(), success, output });
  if (executionLog.length > 100) executionLog.pop();
}

export function startWatcher(watchDir: string): void {
  const resolved = path.resolve(watchDir);

  if (!fs.existsSync(resolved)) {
    try {
      fs.mkdirSync(resolved, { recursive: true });
      logger.info("Watcher", `Created watch directory: ${resolved}`);
    } catch (err: any) {
      logger.error("Watcher", `Cannot create watch directory ${resolved}: ${err.message}`);
      return;
    }
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    logger.error("Watcher", `${resolved} is not a directory`);
    return;
  }

  logger.info("Watcher", `Watching ${resolved} for .luau/.lua file changes`);

  watcher = fs.watch(resolved, { recursive: true }, (_event, filename) => {
    if (!filename) return;

    const ext = path.extname(filename).toLowerCase();
    if (!LUAU_EXTENSIONS.has(ext)) return;

    const fullPath = path.join(resolved, filename);

    const existing = debounceTimers.get(fullPath);
    if (existing) clearTimeout(existing);

    debounceTimers.set(fullPath, setTimeout(() => {
      debounceTimers.delete(fullPath);
      if (fs.existsSync(fullPath)) {
        executeFile(fullPath).catch((err) => {
          logger.error("Watcher", `Unhandled error executing ${filename}: ${err}`);
        });
      }
    }, DEBOUNCE_MS));
  });

  watcher.on("error", (err) => {
    logger.error("Watcher", `Watcher error: ${err.message}`);
  });
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    debounceTimers.clear();
    logger.info("Watcher", "File watcher stopped");
  }
}
