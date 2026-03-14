export class BridgeError extends Error {
  code: string;
  context: string;
  toolName?: string;

  constructor(message: string, options: { code: string; context: string; toolName?: string }) {
    super(message);
    this.name = "BridgeError";
    this.code = options.code;
    this.context = options.context;
    this.toolName = options.toolName;
  }
}

export class TimeoutError extends BridgeError {
  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`, {
      code: "TIMEOUT",
      context: `The Roblox client did not respond within ${timeoutMs}ms. The client may be busy, disconnected, or the operation is taking longer than expected.`,
      toolName,
    });
    this.name = "TimeoutError";
  }
}

export class AuthError extends BridgeError {
  constructor(detail: string) {
    super(`Authentication failed: ${detail}`, {
      code: "AUTH_FAILED",
      context: detail,
    });
    this.name = "AuthError";
  }
}

export class ClientNotFoundError extends BridgeError {
  constructor(clientId?: string) {
    const msg = clientId
      ? `Client "${clientId}" not found in registry`
      : "No Roblox clients connected";
    super(msg, {
      code: clientId ? "INVALID_CLIENT" : "NO_CLIENT",
      context: clientId
        ? `The specified clientId "${clientId}" does not match any connected client. Use list-clients to see available clients.`
        : "No Roblox client connected to the MCP server. Please notify the user that they have to run the connector.luau script in order to connect the MCP server to their game.",
    });
    this.name = "ClientNotFoundError";
  }
}

export function formatErrorForTool(err: unknown): string {
  if (err instanceof BridgeError) {
    let msg = `${err.message}`;
    if (err.context) msg += `\n\nContext: ${err.context}`;
    return msg;
  }
  if (err instanceof Error) {
    return `${err.message}\n\nStack: ${err.stack?.split("\n").slice(0, 3).join("\n")}`;
  }
  return String(err);
}
