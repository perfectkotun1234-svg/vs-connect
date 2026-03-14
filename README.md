# VS Connect

An enhanced MCP (Model Context Protocol) server for interacting with Roblox game clients. A rewrite of the original [roblox-executor-mcp](https://github.com/notpoiu/roblox-executor-mcp) with major improvements.

## Features

- Auto-generated authentication tokens
- Modular codebase (20+ components)
- Adaptive HTTP polling (0.1s–0.5s)
- Configurable per-tool timeouts (5s–45s)
- Heartbeat system with stale detection
- 24 tools: execution, introspection, remote spy, GUI, screenshots, deobfuscation
- Dashboard at `localhost:16384`

## Setup

### 1. Clone & Build

```bash
git clone https://github.com/perfectkotun1234-svg/vs-connect.git
cd vs-connect
pnpm install && pnpm build
