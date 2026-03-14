import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient } from "../bridge/transport.js";
import { clientIdSchema, checkSendResult, makeTextResponse } from "./helpers.js";
import { logger } from "../utils/logger.js";

const SCRIPTS: Record<string, { name: string; description: string; code: string }> = {
  esp: {
    name: "ESP (Player Highlights)",
    description: "Adds visual highlights around all players so you can see them through walls",
    code: `
local Players = game:GetService("Players")
local lp = Players.LocalPlayer

local function addESP(player)
    if player == lp then return end
    local function onCharacter(char)
        if not char then return end
        local highlight = Instance.new("Highlight")
        highlight.Name = "VSC_ESP"
        highlight.FillColor = Color3.fromRGB(255, 0, 0)
        highlight.FillTransparency = 0.5
        highlight.OutlineColor = Color3.fromRGB(255, 255, 255)
        highlight.OutlineTransparency = 0
        highlight.Adornee = char
        highlight.Parent = char
    end
    if player.Character then onCharacter(player.Character) end
    player.CharacterAdded:Connect(onCharacter)
end

for _, p in Players:GetPlayers() do addESP(p) end
Players.PlayerAdded:Connect(addESP)
print("[VSC] ESP enabled")
`,
  },
  speed: {
    name: "Speed Hack",
    description: "Increases your character walk speed",
    code: `
local Players = game:GetService("Players")
local lp = Players.LocalPlayer
local char = lp.Character or lp.CharacterAdded:Wait()
local humanoid = char:WaitForChild("Humanoid")
humanoid.WalkSpeed = 100
print("[VSC] Speed set to 100")
`,
  },
  fly: {
    name: "Fly Script",
    description: "Allows your character to fly. Press E to toggle.",
    code: `
local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local lp = Players.LocalPlayer
local flying = false
local speed = 80
local bodyVel, bodyGyro, conn

local function startFly()
    local char = lp.Character
    if not char then return end
    local hrp = char:FindFirstChild("HumanoidRootPart")
    if not hrp then return end
    flying = true
    bodyVel = Instance.new("BodyVelocity")
    bodyVel.MaxForce = Vector3.new(math.huge, math.huge, math.huge)
    bodyVel.Velocity = Vector3.zero
    bodyVel.Parent = hrp
    bodyGyro = Instance.new("BodyGyro")
    bodyGyro.MaxTorque = Vector3.new(math.huge, math.huge, math.huge)
    bodyGyro.P = 9e4
    bodyGyro.Parent = hrp
    conn = RunService.RenderStepped:Connect(function()
        local cam = workspace.CurrentCamera
        bodyGyro.CFrame = cam.CFrame
        local moveDir = Vector3.zero
        if UIS:IsKeyDown(Enum.KeyCode.W) then moveDir = moveDir + cam.CFrame.LookVector end
        if UIS:IsKeyDown(Enum.KeyCode.S) then moveDir = moveDir - cam.CFrame.LookVector end
        if UIS:IsKeyDown(Enum.KeyCode.A) then moveDir = moveDir - cam.CFrame.RightVector end
        if UIS:IsKeyDown(Enum.KeyCode.D) then moveDir = moveDir + cam.CFrame.RightVector end
        if UIS:IsKeyDown(Enum.KeyCode.Space) then moveDir = moveDir + Vector3.new(0,1,0) end
        if UIS:IsKeyDown(Enum.KeyCode.LeftShift) then moveDir = moveDir - Vector3.new(0,1,0) end
        bodyVel.Velocity = moveDir * speed
    end)
    print("[VSC] Flying enabled")
end

local function stopFly()
    flying = false
    if bodyVel then bodyVel:Destroy() end
    if bodyGyro then bodyGyro:Destroy() end
    if conn then conn:Disconnect() end
    print("[VSC] Flying disabled")
end

UIS.InputBegan:Connect(function(input, gpe)
    if gpe then return end
    if input.KeyCode == Enum.KeyCode.E then
        if flying then stopFly() else startFly() end
    end
end)
print("[VSC] Fly script loaded — press E to toggle")
`,
  },
  noclip: {
    name: "Noclip",
    description: "Walk through walls. Press N to toggle.",
    code: `
local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local lp = Players.LocalPlayer
local noclipping = false
local conn

local function enableNoclip()
    noclipping = true
    conn = RunService.Stepped:Connect(function()
        local char = lp.Character
        if not char then return end
        for _, part in char:GetDescendants() do
            if part:IsA("BasePart") then
                part.CanCollide = false
            end
        end
    end)
    print("[VSC] Noclip enabled")
end

local function disableNoclip()
    noclipping = false
    if conn then conn:Disconnect() end
    print("[VSC] Noclip disabled")
end

UIS.InputBegan:Connect(function(input, gpe)
    if gpe then return end
    if input.KeyCode == Enum.KeyCode.N then
        if noclipping then disableNoclip() else enableNoclip() end
    end
end)
print("[VSC] Noclip loaded — press N to toggle")
`,
  },
  teleport: {
    name: "Teleport to Player",
    description: "Teleports your character to a target player. Provide the player name as argument.",
    code: `-- This script requires an argument: targetPlayer
local Players = game:GetService("Players")
local lp = Players.LocalPlayer
local args = ...
local targetName = args and args.targetPlayer or ""
local target = nil
for _, p in Players:GetPlayers() do
    if p.Name:lower():find(targetName:lower()) then
        target = p
        break
    end
end
if target and target.Character and target.Character:FindFirstChild("HumanoidRootPart") then
    lp.Character:SetPrimaryPartCFrame(target.Character.HumanoidRootPart.CFrame)
    print("[VSC] Teleported to " .. target.Name)
else
    print("[VSC] Player not found: " .. targetName)
end
`,
  },
  infinite_jump: {
    name: "Infinite Jump",
    description: "Allows you to jump infinitely in the air",
    code: `
local UIS = game:GetService("UserInputService")
local lp = game:GetService("Players").LocalPlayer
UIS.JumpRequest:Connect(function()
    local char = lp.Character
    if char then
        local hum = char:FindFirstChildOfClass("Humanoid")
        if hum then hum:ChangeState(Enum.HumanoidStateType.Jumping) end
    end
end)
print("[VSC] Infinite jump enabled")
`,
  },
  fullbright: {
    name: "Fullbright",
    description: "Removes all darkness/fog from the game",
    code: `
local Lighting = game:GetService("Lighting")
Lighting.Brightness = 2
Lighting.ClockTime = 14
Lighting.FogEnd = 100000
Lighting.GlobalShadows = false
Lighting.OutdoorAmbient = Color3.fromRGB(128, 128, 128)
for _, v in Lighting:GetDescendants() do
    if v:IsA("Atmosphere") then v.Density = 0 end
    if v:IsA("BloomEffect") or v:IsA("BlurEffect") or v:IsA("ColorCorrectionEffect") or v:IsA("SunRaysEffect") then
        v.Enabled = false
    end
end
print("[VSC] Fullbright enabled")
`,
  },
  anti_afk: {
    name: "Anti-AFK",
    description: "Prevents the game from kicking you for being idle",
    code: `
local VU = game:GetService("VirtualUser")
game:GetService("Players").LocalPlayer.Idled:Connect(function()
    VU:CaptureController()
    VU:ClickButton2(Vector2.new())
end)
print("[VSC] Anti-AFK enabled")
`,
  },
};

export function registerScriptLibraryTools(server: McpServer): void {
  server.registerTool(
    "list-scripts",
    {
      title: "List available scripts in the library",
      description: "Returns all built-in scripts available in the VS Connect script library.",
    },
    async () => {
      const list = Object.entries(SCRIPTS).map(([id, s]) => `• **${id}** — ${s.name}: ${s.description}`).join("\n");
      return { content: [{ type: "text" as const, text: `Available scripts:\n${list}` }] };
    }
  );

  server.registerTool(
    "run-script",
    {
      title: "Run a script from the library",
      description: "Executes a built-in script from the VS Connect library on a connected Roblox client.",
      inputSchema: z.object({
        scriptId: z.string().describe("The script ID to run (e.g. 'esp', 'fly', 'speed', 'noclip', 'teleport', 'infinite_jump', 'fullbright', 'anti_afk')"),
        args: z.record(z.string(), z.string()).describe("Optional arguments for the script (e.g. {targetPlayer: 'username'} for teleport)").optional(),
        clientId: clientIdSchema,
      }),
    },
    async ({ scriptId, args, clientId }) => {
      const script = SCRIPTS[scriptId.toLowerCase()];
      if (!script) {
        const available = Object.keys(SCRIPTS).join(", ");
        return { content: [{ type: "text" as const, text: `Unknown script: "${scriptId}". Available: ${available}` }], isError: true };
      }

      let code = script.code;
      if (args && Object.keys(args).length > 0) {
        const argsTable = Object.entries(args).map(([k, v]) => `["${k}"] = "${v}"`).join(", ");
        code = `local __args = {${argsTable}}\n` + code.replace("local args = ...", "local args = __args");
      }

      const result = SendArbitraryDataToClient("execute", {
        source: `setthreadidentity(8)\n${code}`,
      }, undefined, clientId);
      const err = checkSendResult(result);
      if (err) return err;

      logger.info("ScriptLib", `Executed: ${script.name}`);
      return { content: [{ type: "text" as const, text: `Executed: ${script.name}` }] };
    }
  );
}
