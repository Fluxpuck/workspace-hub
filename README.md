# Workspace Hub MCP

A local MCP server that lets multiple Windsurf IDE workspaces share context with each other.

## How it works

```
┌─────────────────┐     ┌─────────────────────────┐     ┌──────────────────────┐
│  backend/       │     │                         │     │  frontend/           │
│  Windsurf IDE   │────▶│   workspace-hub MCP     │◀────│  Windsurf IDE        │
│                 │     │   (runs locally via     │     │                      │
│  llm-orchestra/ │────▶│    stdio per-workspace) │     │                      │
│  Windsurf IDE   │     │                         │     │                      │
└─────────────────┘     └─────────────────────────┘     └──────────────────────┘
                               stores context in
                           workspaces/store.json
```

Each Windsurf connects to the same MCP server binary. The server persists shared state to a JSON file on disk.

## Setup

### 1. Install

```bash
git clone <this repo> ~/workspace-hub
cd ~/workspace-hub
npm install
```

### 2. Configure each Windsurf workspace

In each Windsurf IDE, open **Settings → MCP Servers** and add:

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

### 3. Register each workspace (do once per workspace)

In your **backend** Windsurf, tell Cascade:
> "Register this workspace with the workspace-hub MCP. Name: backend. Description: Express REST API for Sero. Stack: TypeScript, Express, PostgreSQL."

In your **frontend** Windsurf:
> "Register this workspace. Name: frontend. Description: Next.js web app. Stack: Next.js, TypeScript, Tailwind."

In your **llm-orchestrator** Windsurf:
> "Register this workspace. Name: llm-orchestrator. Description: Claude API integration and prompt chains."

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

---

## Example workflows

### Backend tells frontend about an API change
In the **backend** Windsurf, Cascade can:
```
post_note(
  workspace: "frontend",
  content: "POST /api/sessions now requires a `locale` field in the body",
  tag: "api-change",
  from: "backend"
)
```

### Frontend asks about the backend
In the **frontend** Windsurf, Cascade can:
```
get_workspace(name: "backend")
get_notes(workspace: "backend", tag: "api-change")
```

### LLM orchestrator broadcasts a prompt format change
```
broadcast_note(
  content: "All AI responses now return { result, confidence, model } instead of plain string",
  tag: "breaking-change",
  from: "llm-orchestrator",
  exclude: ["llm-orchestrator"]
)
```

### Natural language prompts that trigger MCP

You can just talk to Cascade naturally:

- *"What's the backend working on right now?"* → Cascade calls `get_workspace("backend")`
- *"Tell the frontend team our auth endpoint changed"* → Cascade calls `post_note`
- *"What API changes should I know about?"* → Cascade calls `get_notes(tag: "api-change")`
- *"Announce to all workspaces that we're switching to Bun"* → Cascade calls `broadcast_note`

---

## Suggested note tags

- `api-change` — endpoint signature changed
- `decision` — architectural decision made
- `todo` — something another workspace needs to do
- `bug` — known bug that affects others
- `breaking-change` — breaks existing integrations
- `info` — general FYI

---

## Extending this PoC

- **Add HTTP transport** so workspaces on different machines can connect (e.g. your Sero servers)
- **Add TTL to notes** so stale context auto-expires
- **Webhook notifications** — POST to a Discord channel when a note is posted
- **File sharing** — allow attaching small JSON schemas or OpenAPI snippets to a workspace
