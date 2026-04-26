# Workspace Hub MCP — Agent Analysis

## Project Overview

**Workspace Hub MCP** is a local Model Context Protocol (MCP) server that enables multiple IDE workspaces to share context and communicate with each other. It acts as a central hub where workspaces can register themselves, post notes, and query information about other workspaces.

**Core Problem Solved:** Multi-workspace coordination without manual context switching. A developer working across a backend, frontend, and LLM orchestrator can now have those workspaces communicate API changes, decisions, and TODOs automatically.

---

## Architecture

### High-Level Flow

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  Workspace A     │         │  Workspace B     │         │  Workspace C     │
│  (backend)       │         │  (frontend)      │         │  (llm-orch)      │
│  IDE             │         │  IDE             │         │  IDE             │
└────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘
         │                            │                            │
         └────────────────┬───────────┴────────────────┬───────────┘
                          │                            │
                    ┌─────▼────────────────────────────▼─────┐
                    │  workspace-hub MCP Server (stdio)      │
                    │  - Registers workspaces                │
                    │  - Stores/retrieves notes              │
                    │  - Broadcasts messages                 │
                    └─────┬────────────────────────────┬─────┘
                          │                            │
                    ┌─────▼────────────────────────────▼─────┐
                    │  workspaces/store.json (persistent)    │
                    │  {                                     │
                    │    "workspaces": {                     │
                    │      "backend": {...},                 │
                    │      "frontend": {...},                │
                    │      "llm-orchestrator": {...}         │
                    │    }                                   │
                    │  }                                     │
                    └────────────────────────────────────────┘
```

### Key Design Decisions

1. **Stdio-based MCP Transport:** Each workspace connects via stdio, making it easy to run locally without network setup.
2. **File-based Persistence:** Uses `workspaces/store.json` to persist workspace metadata and notes. Simple, no database required.
3. **Workspace-centric Model:** Everything revolves around workspaces as first-class entities. Each workspace has metadata (name, description, tech stack) and a notes feed.
4. **Tag-based Organization:** Notes can be tagged (e.g., `api-change`, `decision`, `bug`) for filtering and discovery.

---

## Core Data Model

### Workspace Object

```javascript
{
  name: string,                    // Unique identifier
  description: string,             // What this workspace does
  tech_stack: string[],           // Technologies used
  metadata: Record<string, string>, // Custom key-value pairs (repo URL, port, etc.)
  notes: Note[],                  // Array of notes posted to this workspace
  registered_at: ISO8601,         // Registration timestamp
  updated_at: ISO8601             // Last update timestamp
}
```

### Note Object

```javascript
{
  content: string,                // The note text
  tag: string,                    // Category: api-change, decision, todo, bug, etc.
  from: string,                   // Source workspace name
  timestamp: ISO8601              // When the note was posted
}
```

---

## Available MCP Tools

### 1. `register_workspace`
**Purpose:** Register a workspace so it can be discovered and receive notes.

**Parameters:**
- `name` (required): Unique workspace identifier (e.g., "backend", "frontend")
- `description` (required): Short description of the workspace's purpose
- `tech_stack` (optional): Array of technologies (e.g., ["Express", "TypeScript", "PostgreSQL"])
- `metadata` (optional): Custom key-value pairs (e.g., {"repo": "...", "port": "3000"})

**Returns:** Success confirmation message

**Example Use Case:**
> "Register this workspace. Name: backend. Description: Express REST API. Stack: TypeScript, Express, PostgreSQL."

---

### 2. `list_workspaces`
**Purpose:** Discover all registered workspaces and their descriptions.

**Parameters:** None

**Returns:** Formatted list of all workspaces with names, descriptions, tech stacks, and last update times.

**Example Use Case:**
> "What workspaces are registered?"

---

### 3. `get_workspace`
**Purpose:** Retrieve full details about a specific workspace, including all its notes.

**Parameters:**
- `name` (required): Workspace name to retrieve

**Returns:** Detailed workspace information including metadata and all notes.

**Example Use Case:**
> "Tell me everything about the backend workspace."

---

### 4. `post_note`
**Purpose:** Post a note to a specific workspace to share context, API changes, decisions, or TODOs.

**Parameters:**
- `workspace` (required): Target workspace name
- `content` (required): The note content (be specific and useful)
- `tag` (optional): Category tag (api-change, decision, todo, bug, breaking-change, etc.)
- `from` (optional): Source workspace name

**Returns:** Success confirmation

**Example Use Case:**
> "Tell the frontend team that POST /api/sessions now requires a `locale` field. Tag it as api-change."

---

### 5. `get_notes`
**Purpose:** Retrieve notes from a workspace with optional filtering.

**Parameters:**
- `workspace` (required): Workspace to query
- `tag` (optional): Filter by tag (e.g., "api-change")
- `from` (optional): Filter by source workspace
- `limit` (optional): Max notes to return (default: 20)

**Returns:** Formatted list of notes, newest first.

**Example Use Case:**
> "What API changes should I know about from the backend?"

---

### 6. `broadcast_note`
**Purpose:** Post the same note to all registered workspaces at once.

**Parameters:**
- `content` (required): Note content to broadcast
- `tag` (optional): Tag for the note
- `from` (optional): Source workspace name
- `exclude` (optional): Array of workspace names to skip

**Returns:** List of workspaces that received the note.

**Example Use Case:**
> "Announce to all workspaces that we're switching to Bun. Tag it as breaking-change."

---

### 7. `clear_notes`
**Purpose:** Clear all notes from a workspace (cleanup).

**Parameters:**
- `workspace` (required): Workspace to clear

**Returns:** Success confirmation

**Example Use Case:**
> "Clear all notes from the frontend workspace."

---

## Suggested Note Tags

| Tag | Purpose |
|-----|---------|
| `api-change` | Endpoint signature or contract changed |
| `decision` | Architectural or technical decision made |
| `todo` | Action item for another workspace |
| `bug` | Known bug affecting other workspaces |
| `breaking-change` | Breaks existing integrations |
| `info` | General FYI or announcement |
| `broadcast` | Auto-tagged for broadcast_note calls |
| `general` | Default tag if none specified |

---

## Common Workflows

### Scenario 1: Backend Notifies Frontend of API Change
**Backend workspace:**
```
post_note(
  workspace: "frontend",
  content: "POST /api/sessions now requires a `locale` field in the body. Returns 400 if missing.",
  tag: "api-change",
  from: "backend"
)
```

**Frontend workspace:**
```
get_notes(workspace: "backend", tag: "api-change")
```

### Scenario 2: Frontend Checks Backend Status
**Frontend workspace:**
```
get_workspace(name: "backend")
```
Returns full workspace details including tech stack, metadata, and all recent notes.

### Scenario 3: LLM Orchestrator Broadcasts Breaking Change
**LLM Orchestrator workspace:**
```
broadcast_note(
  content: "All AI responses now return { result, confidence, model } instead of plain string. Update your integrations.",
  tag: "breaking-change",
  from: "llm-orchestrator",
  exclude: ["llm-orchestrator"]
)
```

### Scenario 4: Natural Language Prompts
Users don't need to call tools directly. They can talk naturally to your coding agent:

- *"What's the backend working on right now?"* → coding agent infers `get_workspace("backend")`
- *"Tell the frontend team our auth endpoint changed"* → coding agent infers `post_note` with appropriate parameters
- *"What API changes should I know about?"* → coding agent infers `get_notes` with `tag: "api-change"`
- *"List all workspaces"* → coding agent calls `list_workspaces`

---

## Implementation Details

### Technology Stack

- **Framework:** Node.js with ES modules
- **MCP SDK:** `@modelcontextprotocol/sdk` (v1.29.0)
- **Validation:** Zod (v4.3.6)
- **Transport:** Stdio (built into MCP SDK)
- **Persistence:** JSON file (workspaces/store.json)

### File Structure

```
mcp-hub/
├── server.js                      # Main MCP server implementation
├── package.json                   # Dependencies and metadata
├── README.md                      # User-facing documentation
├── agent.md                       # This file
├── mcp-config.example.json        # Example MCP configuration
└── workspaces/
    └── store.json                 # Persistent workspace data (auto-created)
```

### Key Functions

**`loadStore()`** — Reads `workspaces/store.json` and returns the workspace registry. Returns empty registry if file doesn't exist.

**`saveStore(store)`** — Writes the workspace registry to disk, creating directories as needed.

**Server Initialization** — Creates an MCP server named "workspace-hub" and registers all 7 tools with Zod schemas for validation.

### Persistence Strategy

- **On-disk storage:** `workspaces/store.json` contains the entire state
- **Atomic writes:** Each tool call that modifies state calls `saveStore()` to persist changes
- **No transactions:** Simple JSON write; suitable for local development but not for high-concurrency scenarios
- **Graceful degradation:** If the store file is missing or corrupted, the server starts with an empty registry

---

## Setup & Configuration

### Installation

```bash
git clone <repo> ~/workspace-hub
cd ~/workspace-hub
npm install
```

### MCP Configuration

In each IDE, add to **Settings → MCP Servers**:

```json
{
  "mcpServers": {
    "workspace-hub": {
      "command": "node",
      "args": ["/absolute/path/to/workspace-hub/server.js"]
    }
  }
}
```

**Critical:** Use the **same absolute path** in all workspaces so they all connect to the same `store.json`.

### Workspace Registration

In each workspace, ask your code agent to register once:

> "Register this workspace with the workspace-hub MCP. Name: backend. Description: Express REST API. Stack: TypeScript, Express, PostgreSQL."

---

## Limitations & Future Enhancements

### Current Limitations

1. **Stdio-only transport:** Workspaces must be on the same machine
2. **No authentication:** Any workspace can read/write any other workspace's notes
3. **No TTL on notes:** Notes persist indefinitely (manual cleanup required)
4. **No real-time notifications:** Workspaces must poll for updates
5. **Simple JSON storage:** Not suitable for high-concurrency or large-scale deployments

### Suggested Enhancements

1. **HTTP transport:** Enable cross-machine workspace communication
2. **Note TTL:** Auto-expire notes after a configurable duration
3. **Webhook notifications:** POST to Discord/Slack when notes are posted
4. **File attachments:** Share JSON schemas, OpenAPI specs, or code snippets
5. **Search & indexing:** Full-text search across all notes
6. **Access control:** Workspace-level permissions (read-only, write, admin)
7. **Audit logging:** Track who posted what and when
8. **Real-time subscriptions:** WebSocket support for live updates

---

## Debugging & Troubleshooting

### Common Issues

**Workspaces not connecting:**
- Verify the absolute path in MCP configuration is correct
- Check that `server.js` is executable: `chmod +x server.js`
- Ensure Node.js is installed and in PATH

**Notes not persisting:**
- Check that `workspaces/` directory is writable
- Verify `store.json` is valid JSON (no syntax errors)
- Check disk space

**Workspace not found errors:**
- Ensure the workspace was registered first with `register_workspace`
- Check workspace name spelling (case-sensitive)

### Debugging Tips

1. Check `workspaces/store.json` directly to inspect state
2. Add console.error() logging in server.js to trace execution
3. Use `list_workspaces` to verify registrations
4. Use `get_workspace` to inspect full workspace state including notes

---

## Agent Capabilities & Recommendations

### What Coding Agents Can Do

- **Understand intent:** Parse natural language requests and map them to appropriate MCP tools
- **Multi-step workflows:** Chain tool calls (e.g., list workspaces, then get details on one)
- **Context awareness:** Remember workspace names and recent notes within a conversation
- **Error handling:** Gracefully handle missing workspaces or invalid parameters

### Best Practices for Users

1. **Be specific in notes:** Include concrete details (endpoint names, field names, breaking changes)
2. **Use tags consistently:** Adopt the suggested tag vocabulary for discoverability
3. **Register once per workspace:** Registration is idempotent but should only happen once
4. **Clean up stale notes:** Periodically use `clear_notes` to remove outdated information
5. **Broadcast sparingly:** Use `broadcast_note` only for truly important, workspace-wide changes

### When to Use This Tool

- ✅ Coordinating API changes across frontend/backend
- ✅ Sharing architectural decisions with the team
- ✅ Announcing breaking changes or major refactors
- ✅ Tracking TODOs that span multiple workspaces
- ✅ Documenting known bugs affecting other teams

### When NOT to Use This Tool

- ❌ Real-time chat or instant messaging (use Slack/Discord instead)
- ❌ Large file transfers (use Git or cloud storage instead)
- ❌ Cross-machine deployments (use HTTP transport extension instead)
- ❌ Sensitive information (no encryption; local only)

---

## Summary

**Workspace Hub MCP** is a lightweight, file-based coordination system for multi-workspace development. It solves the problem of context fragmentation by providing a central hub where workspaces can register, share notes, and query each other. The tool is ideal for local development workflows and can be extended with HTTP transport, webhooks, and other features for more advanced use cases.
