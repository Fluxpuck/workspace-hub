# Workspace Hub MCP

A local MCP server that lets multiple IDE workspaces share context with each other.

## How it works

```
┌─────────────────┐     ┌─────────────────────────┐     ┌──────────────────────┐
│  backend/       │     │                         │     │  frontend/           │
│  IDE            │────▶│   workspace-hub MCP     │◀────│  IDE                 │
│                 │     │   (single HTTP server   │     │                      │
│  llm-orchestra/ │────▶│    on localhost:4440)    │     │                      │
│  IDE            │     │                         │     │                      │
└─────────────────┘     └─────────────────────────┘     └──────────────────────┘
                           all state lives in-memory
                          in a single server process
```

A single HTTP server runs locally. All IDE workspaces connect to it over the MCP Streamable HTTP transport, sharing in-memory state.

## Setup

### 1. Install

```bash
git clone <this repo> ~/workspace-hub
cd ~/workspace-hub
npm install
```

### 2. Start the server

Run directly:

```bash
node server.js
```

Or with Docker:

```bash
docker build -t mcp/workspace-hub .
docker run -p 4440:4440 mcp/workspace-hub
```

The server listens on `http://localhost:4440/mcp` by default. Set the `PORT` environment variable to change it.

### 3. Configure each workspace

In each IDE, open **Settings → MCP Servers** and add:

```json
{
  "mcpServers": {
    "workspace-hub": {
      "serverUrl": "http://localhost:4440/mcp"
    }
  }
}
```

All workspaces connect to the same server. No volume mounts or per-workspace containers needed.

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
| `post_task` | Ask a question to another workspace's agent |
| `get_pending_tasks` | Check for tasks assigned to your workspace (auto-answers via sampling if supported) |
| `respond_to_task` | Manually respond to a pending task |
| `get_task_responses` | Retrieve responses to tasks you posted |

**→ See [`docs/tools.md`](docs/tools.md) for detailed documentation, parameters, and examples.**

---

## Cross-Workspace Lookups

The task system lets one workspace's agent ask another workspace's agent a question and get an answer back.

### How it works

```
Workspace A                              Workspace B
─────────────                            ─────────────
1. post_task("backend",
   "What auth middleware
    do you use?")
        │
        ▼
   in-memory: task
   { status: "pending" }
                                         2. get_pending_tasks("backend")
                                              │
                                              ▼
                                         Server attempts createMessage()
                                         (MCP sampling) to auto-answer
                                              │
                                         If sampling works → auto-completed
                                         If not → agent responds manually
                                         via respond_to_task()

3. get_task_responses("frontend")
   → "We use Passport.js with..."
```

### Example prompts

- "Ask the backend what database they use" → `post_task`
- "Check if any workspaces need something from me" → `get_pending_tasks`
- "Did the backend answer my question yet?" → `get_task_responses`

---
