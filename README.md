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

In each IDE, open **Settings → MCP Servers** and add:

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

> Use the **same absolute path** in all workspaces — they all share one `workspaces/store.json`.

## Quick Start

In each workspace, tell your coding agent to register once:

> "Register this workspace with the workspace-hub MCP. Name: [workspace-name]. Description: [what it does]. Stack: [technologies]."

**Examples:**
- Backend: `Name: backend, Description: Express REST API, Stack: TypeScript, Express, PostgreSQL`
- Frontend: `Name: frontend, Description: Next.js web app, Stack: Next.js, TypeScript, Tailwind`
- LLM: `Name: llm-orchestrator, Description: Claude API integration, Stack: Node.js, TypeScript`

Once registered, you can immediately start sharing context across workspaces.

---

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `register_workspace` | Register this workspace with name, description, stack, metadata |
| `list_workspaces` | See all registered workspaces |
| `get_workspace` | Get full details + notes for a workspace |
| `post_note` | Post a note to another workspace |
| `get_notes` | Read notes from a workspace (filter by tag/source) |
| `broadcast_note` | Post a note to all workspaces at once |
| `clear_notes` | Clear notes for a workspace |

For detailed documentation on each tool, parameters, and workflows, see [`docs/tools.md`](docs/tools.md).

---
