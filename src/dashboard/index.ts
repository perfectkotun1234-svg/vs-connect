import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedHtml: string | null = null;

export function getDashboardHTML(): string {
  if (cachedHtml) return cachedHtml;

  // Try loading from same directory (dev) or dist directory (built)
  const candidates = [
    path.join(__dirname, "dashboard.html"),
    path.join(__dirname, "..", "dashboard", "dashboard.html"),
    path.join(__dirname, "..", "..", "src", "dashboard", "dashboard.html"),
  ];

  for (const candidate of candidates) {
    try {
      cachedHtml = fs.readFileSync(candidate, "utf-8");
      return cachedHtml;
    } catch { }
  }

  // Fallback minimal dashboard
  cachedHtml = `<!DOCTYPE html>
<html><head><title>VS Connect Dashboard</title>
<style>body{background:#09090b;color:#fafafa;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
.card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:2rem;text-align:center;}
h1{font-size:1.5rem;margin:0 0 0.5rem;} p{color:#a1a1aa;margin:0;}</style></head>
<body><div class="card"><h1>VS Connect</h1><p>Dashboard HTML not found. Check installation.</p></div></body></html>`;
  return cachedHtml;
}
