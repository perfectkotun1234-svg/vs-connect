import { z } from "zod";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RobloxWindowInfo, ScreenshotResult } from "../types.js";
import { config } from "../config.js";
import { instanceRole } from "../bridge/transport.js";
import { logger } from "../utils/logger.js";
import { clientIdSchema, makeTextResponse, makeErrorResponse } from "./helpers.js";

export function enumRobloxWindows(): RobloxWindowInfo[] {
  const ps = `
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class WinEnum {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int maxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    public static List<object[]> GetVisibleWindows() {
        var result = new List<object[]>();
        EnumWindows((hWnd, _) => {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString();
            if (string.IsNullOrEmpty(title)) return true;
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            result.Add(new object[] { pid, hWnd.ToString(), title });
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
"@
$robloxPids = @(Get-Process -Name 'RobloxPlayerBeta' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
if ($robloxPids.Count -eq 0) { Write-Output '[]'; exit }
$allWindows = [WinEnum]::GetVisibleWindows()
$found = @()
foreach ($w in $allWindows) {
    if ($robloxPids -contains [int]$w[0]) {
        $found += [PSCustomObject]@{ pid=[int]$w[0]; hwnd=$w[1]; title=$w[2] }
    }
}
if ($found.Count -eq 0) { Write-Output '[]' } else { $found | ConvertTo-Json -Compress }
`;

  const tmpFile = path.join(os.tmpdir(), `vs_enum_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, ps, "utf-8");
    const raw = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { encoding: "utf-8", timeout: 15000, windowsHide: true }
    ).trim();
    if (!raw || raw === "" || raw === "null") return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err: any) {
    logger.error("Screenshot", "enumRobloxWindows failed:", err.message);
    return [];
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { }
  }
}

function captureWindowPNG(hwnd: string): string {
  const outFile = path.join(os.tmpdir(), `vs_screenshot_${Date.now()}.b64`);
  const ps = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCapture {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hDC, uint nFlags);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$hwnd = [IntPtr]::new([long]${hwnd})
if ([WinCapture]::IsIconic($hwnd)) {
    [WinCapture]::ShowWindow($hwnd, 9) | Out-Null
    Start-Sleep -Milliseconds 200
}
$rect = New-Object WinCapture+RECT
[WinCapture]::GetClientRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) { Write-Error "Window has zero size"; exit 1 }
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
[WinCapture]::PrintWindow($hwnd, $hdc, 2) | Out-Null
$gfx.ReleaseHdc($hdc)
$gfx.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$bytes = $ms.ToArray()
$ms.Dispose()
$b64 = [Convert]::ToBase64String($bytes)
[System.IO.File]::WriteAllText('${outFile.replace(/\\/g, "\\\\")}', $b64)
Write-Output 'OK'
`;

  const tmpFile = path.join(os.tmpdir(), `vs_capture_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, ps, "utf-8");
    execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { encoding: "utf-8", timeout: 15000, windowsHide: true }
    );
    if (!fs.existsSync(outFile)) throw new Error("PrintWindow did not produce output file");
    const result = fs.readFileSync(outFile, "utf-8").trim();
    if (!result) throw new Error("PrintWindow returned empty output");
    return result;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { }
    try { fs.unlinkSync(outFile); } catch { }
  }
}

export function performScreenshot(pid?: number): ScreenshotResult {
  const windows = enumRobloxWindows();
  if (windows.length === 0) {
    return { error: "No visible Roblox windows found. Make sure Roblox is running and not minimized." };
  }
  let targets = windows;
  if (pid !== undefined) {
    targets = windows.filter((w) => w.pid === pid);
    if (targets.length === 0) {
      return { error: `No Roblox window found for PID ${pid}. Available: ${windows.map((w) => `PID ${w.pid} — "${w.title}"`).join(", ")}` };
    }
  }
  if (targets.length > 1 && pid === undefined) {
    return { needsDisambiguation: targets };
  }
  const imageBase64 = captureWindowPNG(targets[0].hwnd);
  return { imageBase64 };
}

export function registerScreenshotTools(server: McpServer): void {
  server.registerTool(
    "screenshot-window",
    {
      title: "Capture a screenshot of the Roblox window",
      description: "Captures a screenshot of the Roblox game window. Windows only. If multiple Roblox windows are open, provide a PID to disambiguate.",
      inputSchema: z.object({
        pid: z.number().describe("Target a specific Roblox window by PID. Use list-roblox-windows to see available windows.").optional(),
      }),
    },
    async ({ pid }) => {
      if (process.platform !== "win32") {
        return makeErrorResponse("Screenshots are only supported on Windows.");
      }

      // If secondary, relay to primary
      if (instanceRole === "secondary" && config.baseUrl) {
        try {
          const res = await fetch(`${config.baseUrl}/api/screenshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pid }),
          });
          const result = await res.json() as ScreenshotResult;
          if (result.error) return makeErrorResponse(result.error);
          if (result.needsDisambiguation) {
            return makeTextResponse("Multiple Roblox windows found. Use list-roblox-windows and specify a PID:\n" +
              JSON.stringify(result.needsDisambiguation, null, 2));
          }
          if (result.imageBase64) {
            return { content: [{ type: "image" as const, data: result.imageBase64, mimeType: "image/png" }] };
          }
          return makeErrorResponse("Unknown screenshot error.");
        } catch (err: any) {
          return makeErrorResponse(`Failed to relay screenshot: ${err.message}`);
        }
      }

      const result = performScreenshot(pid);
      if (result.error) return makeErrorResponse(result.error);
      if (result.needsDisambiguation) {
        return makeTextResponse("Multiple Roblox windows found. Use list-roblox-windows and specify a PID:\n" +
          JSON.stringify(result.needsDisambiguation, null, 2));
      }
      if (result.imageBase64) {
        return { content: [{ type: "image" as const, data: result.imageBase64, mimeType: "image/png" }] };
      }
      return makeErrorResponse("Unknown screenshot error.");
    }
  );

  server.registerTool(
    "list-roblox-windows",
    {
      title: "List visible Roblox windows",
      description: "Lists all visible Roblox game windows by PID, HWND, and title. Useful for disambiguating which window to screenshot.",
    },
    async () => {
      if (process.platform !== "win32") {
        return makeErrorResponse("Window enumeration is only supported on Windows.");
      }

      if (instanceRole === "secondary" && config.baseUrl) {
        try {
          const res = await fetch(`${config.baseUrl}/api/windows`);
          const data = await res.json() as any;
          if (data.error) return makeErrorResponse(data.error);
          return makeTextResponse(JSON.stringify(data.windows, null, 2));
        } catch (err: any) {
          return makeErrorResponse(`Failed to relay window list: ${err.message}`);
        }
      }

      const windows = enumRobloxWindows();
      if (windows.length === 0) return makeTextResponse("No visible Roblox windows found.");
      return makeTextResponse(JSON.stringify(windows, null, 2));
    }
  );
}
