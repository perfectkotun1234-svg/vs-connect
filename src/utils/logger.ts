type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

const minLevel: LogLevel = (process.env.VS_CONNECT_LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(level: LogLevel, module: string, message: string, ...args: any[]): void {
  if (!shouldLog(level)) return;
  const color = LEVEL_COLORS[level];
  const prefix = `${color}[${timestamp()}] [${level.toUpperCase()}]${RESET} [${module}]`;
  console.error(prefix, message, ...args);
}

export const logger = {
  debug: (module: string, message: string, ...args: any[]) => log("debug", module, message, ...args),
  info: (module: string, message: string, ...args: any[]) => log("info", module, message, ...args),
  warn: (module: string, message: string, ...args: any[]) => log("warn", module, message, ...args),
  error: (module: string, message: string, ...args: any[]) => log("error", module, message, ...args),
};
