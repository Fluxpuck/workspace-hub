# Workspace Hub MCP

A local MCP server that lets multiple IDE workspaces share context with each other.

## How it works

```
┌─────────────────┐     ┌─────────────────────────┐     ┌──────────────────────┐
│  backend/       │     │                         │     │  frontend/           │
│  IDE            │────▶│   workspace-hub MCP     │◀────│  IDE                 │
│                 │     │   (runs locally via     │     │                      │
│  llm-orchestra/ │────▶│    stdio per-workspace) │     │                      │
│  IDE            │     │                         │     │                      │
└─────────────────┘     └─────────────────────────┘     └──────────────────────┘
                               stores context in
                           workspaces/store.json
```

Each IDE connects to the same MCP server binary. The server persists shared state to a JSON file on disk.

## Setup

### 1. Install

```bash
git clone <this repo> ~/workspace-hub
cd ~/workspace-hub
npm install
```

### 2. Configure each workspace

In each IDE, open **Settings → MCP Servers** and add (use the **same absolute path** in all workspaces):

```json
{
  "mcpServers": {
    "workspace-hub": {
      "command": "node",
      "args": ["/absolute/path/to/workspace-hub-mcp/server.js"]
    }
  }
}
```

## Get Started

In each workspace, tell your coding agent to register once:

> "Register this workspace with the workspace-hub MCP. Name: [workspace-name]. Description: [what it does]. Stack: [technologies]."

**Example:** "Register this workspace. Name: backend. Description: Express REST API. Stack: TypeScript, Express, PostgreSQL."

Once registered, start sharing context with natural language prompts like:
- "What's the frontend working on?"
- "Tell the backend team our auth endpoint changed"
- "What API changes should I know about?"

---

## Available Tools

| Tool | Purpose |
|------|---------|
| `register_workspace` | Register a workspace |
| `list_workspaces` | Discover all workspaces |
| `get_workspace` | Get workspace details + notes |
| `post_note` | Post a note to a workspace |
| `get_notes` | Retrieve notes (with filtering) |
| `broadcast_note` | Post to all workspaces |
| `clear_notes` | Clear workspace notes |

**→ See [`docs/tools.md`](docs/tools.md) for detailed documentation, parameters, and examples.**

---
