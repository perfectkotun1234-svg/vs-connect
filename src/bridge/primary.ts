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

      // ── Players API (positions, health, etc.) ──
      if (url.pathname === "/api/players" && req.method === "GET") {
        const cid = url.searchParams.get("clientId") || undefined;
        const target = resolveTargetClient(cid);
        if (!target) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No client connected" }));
          return;
        }
        try {
          const crypto = await import("crypto");
          const id = crypto.randomUUID();
          const { SendArbitraryDataToClient: send, GetResponseOfIdFromClient: getResp } = await import("./transport.js");
          send("get-data-by-code", { source: `setthreadidentity(8);local Players = game:GetService("Players"); local result = {}; for _, p in Players:GetPlayers() do local d = {Name = p.Name, DisplayName = p.DisplayName, UserId = p.UserId, Team = p.Team and p.Team.Name or "None"}; local char = p.Character; if char then local hrp = char:FindFirstChild("HumanoidRootPart"); local hum = char:FindFirstChildOfClass("Humanoid"); if hrp then d.Position = {x = math.floor(hrp.Position.X), y = math.floor(hrp.Position.Y), z = math.floor(hrp.Position.Z)} end; if hum then d.Health = math.floor(hum.Health); d.MaxHealth = math.floor(hum.MaxHealth) end end; table.insert(result, d) end; return result` }, id, target.clientId);
          const response = await getResp(id, 10000);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ output: response?.output ?? "[]" }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // ── Server Info API (FPS, ping, memory) ──
      if (url.pathname === "/api/server-info" && req.method === "GET") {
        const cid = url.searchParams.get("clientId") || undefined;
        const target = resolveTargetClient(cid);
        if (!target) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No client connected" }));
          return;
        }
        try {
          const crypto = await import("crypto");
          const id = crypto.randomUUID();
          const { SendArbitraryDataToClient: send, GetResponseOfIdFromClient: getResp } = await import("./transport.js");
          send("get-data-by-code", { source: `setthreadidentity(8);local Stats = game:GetService("Stats"); local fps = math.floor(1 / game:GetService("RunService").RenderStepped:Wait()); local ping = math.floor(Stats.Network.ServerStatsItem["Data Ping"]:GetValue()); local mem = math.floor(Stats:GetTotalMemoryUsageMb()); local placeId = game.PlaceId; local jobId = game.JobId; local players = #game:GetService("Players"):GetPlayers(); local maxPlayers = game:GetService("Players").MaxPlayers; return {FPS = fps, Ping = ping, Memory = mem, PlaceId = placeId, JobId = jobId, Players = players, MaxPlayers = maxPlayers, PlaceName = game:GetService("MarketplaceService"):GetProductInfo(placeId).Name}` }, id, target.clientId);
          const response = await getResp(id, 10000);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ output: response?.output ?? "{}" }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // ── Console Output API ──
      if (url.pathname === "/api/console" && req.method === "GET") {
        const cid = url.searchParams.get("clientId") || undefined;
        const target = resolveTargetClient(cid);
        if (!target) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No client connected" }));
          return;
        }
        try {
          const crypto = await import("crypto");
          const id = crypto.randomUUID();
          const { SendArbitraryDataToClient: send, GetResponseOfIdFromClient: getResp } = await import("./transport.js");
          send("get-console-output", { limit: 100, newestFirst: true }, id, target.clientId);
          const response = await getResp(id, 10000);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ output: response?.output ?? "No output" }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // ── Execute (fire-and-forget, no return) API ──
      if (url.pathname === "/api/execute-fire" && req.method === "POST") {
        const body = await readBody(req);
        try {
          const { code, clientId } = JSON.parse(body);
          const target = resolveTargetClient(clientId);
          if (!target) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No client connected" }));
            return;
          }
          const { SendArbitraryDataToClient: send } = await import("./transport.js");
          send("execute", { source: `setthreadidentity(8)\n${code}` }, undefined, target.clientId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // ── Execute API (for dashboard script editor) ──
      if (url.pathname === "/api/execute" && req.method === "POST") {
        if (!checkAuth(req, res)) return;
        const body = await readBody(req);
        try {
          const { code, clientId } = JSON.parse(body);
          const target = resolveTargetClient(clientId);
          if (!target) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No client connected" }));
            return;
          }
          const crypto = await import("crypto");
          const id = crypto.randomUUID();
          const { SendArbitraryDataToClient: send, GetResponseOfIdFromClient: getResp } = await import("./transport.js");
          send("get-data-by-code", { source: `setthreadidentity(8);${code}` }, id, target.clientId);
          const response = await getResp(id, 30000);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ output: response?.output ?? response?.error ?? "No response" }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // ── Instance tree API (for dashboard explorer) ──
      if (url.pathname === "/api/instances" && req.method === "GET") {
        if (!checkAuth(req, res)) return;
        const root = url.searchParams.get("root") || "game";
        const maxDepth = parseInt(url.searchParams.get("maxDepth") || "2", 10);
        const maxChildren = parseInt(url.searchParams.get("maxChildren") || "30", 10);
        const cid = url.searchParams.get("clientId") || undefined;
        const target = resolveTargetClient(cid);
        if (!target) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No client connected" }));
          return;
        }
        try {
          const crypto = await import("crypto");
          const id = crypto.randomUUID();
          const { SendArbitraryDataToClient: send, GetResponseOfIdFromClient: getResp } = await import("./transport.js");
          send("get-descendants-tree", { root, maxDepth, maxChildren }, id, target.clientId);
          const response = await getResp(id, 15000);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ output: response?.output ?? "No response" }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // ── Remote spy logs API (for dashboard live viewer) ──
      if (url.pathname === "/api/remote-spy" && req.method === "GET") {
        if (!checkAuth(req, res)) return;
        const cid = url.searchParams.get("clientId") || undefined;
        const target = resolveTargetClient(cid);
        if (!target) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No client connected" }));
          return;
        }
        try {
          const crypto = await import("crypto");
          const id = crypto.randomUUID();
          const { SendArbitraryDataToClient: send, GetResponseOfIdFromClient: getResp } = await import("./transport.js");
          send("get-remote-spy-logs", { direction: "Both", limit: 100, maxCallsPerRemote: 3 }, id, target.clientId);
          const response = await getResp(id, 15000);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ output: response?.output ?? "No response" }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
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
