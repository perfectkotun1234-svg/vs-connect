import { WebSocket } from "ws";

export interface RobloxClient {
  clientId: string;
  username: string;
  userId: number;
  placeId: number;
  jobId: string;
  placeName: string;
  transport: "ws" | "http";
  ws?: WebSocket;
  lastHttpPoll: number;
  lastHeartbeat: number;
  pendingHttpCommand: any;
}

export interface RobloxWindowInfo {
  pid: number;
  hwnd: string;
  title: string;
}

export interface ScreenshotResult {
  error?: string;
  needsDisambiguation?: RobloxWindowInfo[];
  imageBase64?: string;
}

export interface CommandHistoryEntry {
  id: string;
  toolName: string;
  args: Record<string, any>;
  timestamp: number;
  durationMs: number;
  success: boolean;
  responseSnippet: string;
}

export interface ToolResponse {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
}

export interface BridgeResponse {
  type: string;
  id: string;
  output?: string;
  success?: boolean;
  error?: string;
}
