import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { isAuthEnabled, validateToken, extractTokenFromUrl, extractTokenFromHeader } from "../auth.js";
import {
  registerClient, unregisterClient, getActiveClients,
  formatActiveClientListForTool, resolveTargetClient,
  wsToClientId, clientRegistry, resetRegistry, handleHeartbeat,
} from "./registry.js";
import {
  setInstanceRole, resetPrimaryState, SendToClient,
  handleRobloxResponse, httpResponseResolvers, requestToClientId,
  relayClients, relayRequestOrigin,
} from "./transport.js";
import { getDashboardHTML } from "../dashboard/index.js";
import { performScreenshot, enumRobloxWindows } from "../tools/screenshot.js";

let httpServer: ReturnType<typeof createServer> | null = null;
let wss: WebSocketServer | null = null;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
  });
}

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isAuthEnabled()) return true;
  const token = extractTokenFromHeader(req.headers.authorization ?? undefined);
  if (validateToken(token)) return true;
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized. Provide a valid Bearer token." }));
  return false;
}

export function startAsPrimary(): Promise<void> {
  return new Promise((resolve, reject) => {
    setInstanceRole("primary");
    resetRegistry();
    resetPrimaryState();

    httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${config.port}`);

      // ── Dashboard (no auth) ──
      if (url.pathname === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getDashboardHTML());
        return;
      }

      // ── API Status (no auth) ──
      if (url.pathname === "/api/status" && req.method === "GET") {
        const active = getActiveClients();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          connected: active.length > 0,
          clientCount: active.length,
          role: "Primary",
          relayClients: relayClients.size,
          clients: active.map((c) => ({
            clientId: c.clientId, username: c.username, userId: c.userId,
            placeId: c.placeId, jobId: c.jobId, placeName: c.placeName, transport: c.transport,
          })),
        }));
        return;
      }

      // ── Avatar proxy (no auth) ──
      if (url.pathname === "/api/avatar" && req.method === "GET") {
        const userId = url.searchParams.get("userId");
        if (!userId) { res.writeHead(400); res.end("Missing userId"); return; }
        try {
          const robloxRes = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=150x150&format=Png&isCircular=false`
          );
          const json = await robloxRes.json() as { data?: { imageUrl?: string }[] };
          const imageUrl = json.data?.[0]?.imageUrl;
          if (imageUrl) {
            res.writeHead(302, { Location: imageUrl, "Cache-Control": "public, max-age=300" });
            res.end();
          } else {
            res.writeHead(404); res.end("No thumbnail found");
          }
        } catch { res.writeHead(502); res.end("Failed to fetch thumbnail"); }
        return;
      }

      // ── All routes below require auth ──

      // ── Heartbeat ──
      if (url.pathname === "/api/heartbeat" && req.method === "POST") {
        if (!checkAuth(req, res)) return;
        const cid = url.searchParams.get("clientId");
        if (cid && handleHeartbeat(cid)) {
          res.writeHead(200); res.end("OK");
        } else {
          res.writeHead(404); res.end("Unknown client");
        }
        return;
      }

      // ── HTTP client registration ──
      if (url.pathname === "/register" && req.method === "POST") {
        if (!checkAuth(req, res)) return;
        const body = await readBody(req);
        try {
          const info = JSON.parse(body);
          const clientId = registerClient({
            username: info.username || "Unknown",
            userId: info.userId || 0,
            placeId: info.placeId || 0,
            jobId: info.jobId || "",
            placeName: info.placeName || "Unknown",
            transport: "http",
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ clientId }));
        } catch { res.writeHead(400); res.end("Invalid JSON"); }
        return;
      }

      // ── HTTP polling ──
      if (url.pathname === "/poll" && req.method === "GET") {
        if (!checkAuth(req, res)) return;
        const cid = url.searchParams.get("clientId");
        if (!cid) { res.writeHead(400); res.end("Missing clientId"); return; }
        const client = clientRegistry.get(cid);
        if (!client) { res.writeHead(404); res.end("Unknown clientId"); return; }
        client.lastHttpPoll = Date.now();
        client.lastHeartbeat = Date.now();
        if (client.pendingHttpCommand) {
          const cmd = client.pendingHttpCommand;
          client.pendingHttpCommand = null;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(cmd);
        } else {
          res.writeHead(204); res.end();
        }
        return;
      }

      // ── HTTP response ──
      if (url.pathname === "/respond" && req.method === "POST") {
        if (!checkAuth(req, res)) return;
        const body = await readBody(req);
        try {
          handleRobloxResponse(JSON.parse(body));
          res.writeHead(200); res.end("OK");
        } catch { res.writeHead(400); res.end("Invalid JSON"); }
        return;
      }

      // ── Screenshot API ──
      if (url.pathname === "/api/screenshot" && req.method === "POST") {
        if (!checkAuth(req, res)) return;
        const body = await readBody(req);
        try {
          if (process.platform !== "win32") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Screenshots are only supported on Windows." }));
            return;
          }
          const params = body ? JSON.parse(body) : {};
          const result = performScreenshot(params.pid);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Screenshot failed: ${err.message || err}` }));
        }
        return;
      }

      // ── Windows list API ──
      if (url.pathname === "/api/windows" && req.method === "GET") {
        if (!checkAuth(req, res)) return;
        try {
          if (process.platform !== "win32") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Window enumeration is only supported on Windows." }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ windows: enumRobloxWindows() }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Window enumeration failed: ${err.message || err}` }));
        }
        return;
      }

      res.writeHead(200); res.end("VS Connect MCP Server Running");
    });

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    httpServer.listen(config.port, () => {
      logger.info("Primary", `VS Connect listening on port ${config.port} (WebSocket + HTTP)`);

      wss = new WebSocketServer({ server: httpServer! });

      wss.on("connection", (ws, req) => {
        const urlPath = req.url || "/";

        // ── Auth check for WebSocket ──
        if (isAuthEnabled()) {
          const token = extractTokenFromUrl(req.url ?? undefined);
          if (!validateToken(token)) {
            logger.warn("Primary", "WebSocket connection rejected: invalid token");
            ws.close(4001, "Unauthorized");
            return;
          }
        }

        // ── Relay secondary ──
        if (urlPath.startsWith("/mcp-relay")) {
          logger.info("Primary", `Relay client connected. Total: ${relayClients.size + 1}`);
          relayClients.add(ws);

          ws.on("message", (rawData) => {
            try {
              const message = JSON.parse(rawData.toString());

              if (message.type === "list-clients" && message.id) {
                ws.send(JSON.stringify({ id: message.id, output: formatActiveClientListForTool() }));
                return;
              }

              if (message.id) relayRequestOrigin.set(message.id, ws);

              const targetClientId = message.targetClientId;
              if (targetClientId) delete message.targetClientId;

              const target = resolveTargetClient(targetClientId);
              if (target) {
                requestToClientId.set(message.id, target.clientId);
                SendToClient(target, JSON.stringify(message));
              } else if (message.id) {
                relayRequestOrigin.delete(message.id);
                ws.send(JSON.stringify({ id: message.id, output: undefined, error: "No active Roblox client connected." }));
              }
            } catch (e) { logger.error("Primary", "Error parsing relay message:", e); }
          });

          ws.on("close", () => {
            relayClients.delete(ws);
            logger.info("Primary", `Relay client disconnected. Total: ${relayClients.size}`);
            for (const [id, origin] of relayRequestOrigin.entries()) {
              if (origin === ws) relayRequestOrigin.delete(id);
            }
          });

          ws.on("error", (err) => {
            logger.error("Primary", "Relay client error:", err.message);
            relayClients.delete(ws);
          });
          return;
        }

        // ── Regular Roblox client ──
        logger.info("Primary", "Roblox client connected via WebSocket (awaiting registration).");

        ws.on("message", (rawData) => {
          try {
            const data = JSON.parse(rawData.toString());

            if (data.type === "register") {
              const clientId = registerClient({
                username: data.username || "Unknown",
                userId: data.userId || 0,
                placeId: data.placeId || 0,
                jobId: data.jobId || "",
                placeName: data.placeName || "Unknown",
                transport: "ws",
                ws,
              });
              ws.send(JSON.stringify({ type: "registered", clientId }));
              return;
            }

            if (data.type === "heartbeat") {
              const cid = wsToClientId.get(ws);
              if (cid) handleHeartbeat(cid);
              return;
            }

            handleRobloxResponse(data);
          } catch (e) { logger.error("Primary", "Error parsing Roblox WS message:", e); }
        });

        ws.on("close", () => {
          const clientId = wsToClientId.get(ws);
          if (clientId) unregisterClient(clientId);
          logger.info("Primary", "Roblox client disconnected.");
        });
      });

      resolve();
    });
  });
}
