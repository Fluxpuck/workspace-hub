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
         └─────── HTTP (Streamable) ────┼────────────────────────┘
                                       │
                    ┌──────────────────▼─────────────────────┐
                    │  workspace-hub MCP Server              │
                    │  http://localhost:4440/mcp              │
                    │  - Registers workspaces                 │
                    │  - Stores/retrieves notes               │
                    │  - Broadcasts messages                  │
                    │  - In-memory state (single process)     │
                    └────────────────────────────────────────┘
```

### Key Design Decisions

1. **Streamable HTTP Transport:** A single HTTP server accepts connections from all workspaces. No per-workspace processes or containers.
2. **In-memory State:** All workspace data lives in a single process. No file I/O, no race conditions. State resets on server restart.
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
  tasks: Task[],                  // Array of tasks (cross-workspace lookups)
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

### Task Object

```javascript
{
  id: string,                     // UUID identifier
  question: string,               // The question or lookup request
  from: string,                   // Requesting workspace name
  status: string,                 // "pending" | "completed" | "failed"
  response: string | null,        // The answer (null while pending)
  created_at: ISO8601,            // When the task was posted
  completed_at: ISO8601 | null    // When the task was answered
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

### 8. `post_task`
**Purpose:** Post a question or lookup request to another workspace's agent.

**Parameters:**
- `target` (required): Target workspace name to ask the question to
- `question` (required): The question or lookup request (be specific)
- `from` (required): Your workspace name (the one asking)

**Returns:** Task ID and confirmation. The target workspace's agent will auto-answer via MCP sampling if supported, or the agent can respond manually.

**Example Use Case:**
> "Ask the backend workspace what auth middleware they use."

---

### 9. `get_pending_tasks`
**Purpose:** Check for pending tasks assigned to your workspace from other workspaces. Automatically attempts to answer via MCP sampling before listing remaining tasks.

**Parameters:**
- `workspace` (required): Your workspace name

**Returns:** List of pending tasks with questions and source workspace names. If MCP sampling is supported by the client, tasks are auto-answered before returning.

**Example Use Case:**
> "Check if any workspaces need something from me."

---

### 10. `respond_to_task`
**Purpose:** Manually respond to a pending task from another workspace. Use after investigating the question with local tools.

**Parameters:**
- `task_id` (required): The task ID to respond to
- `response` (required): Your response (be specific and include concrete details)

**Returns:** Success confirmation

**Example Use Case:**
> "Respond to task abc-123 with: We use Passport.js with JWT strategy for auth."

---

### 11. `get_task_responses`
**Purpose:** Retrieve responses to tasks you posted to other workspaces.

**Parameters:**
- `from` (required): Your workspace name (the one that posted the tasks)
- `status` (optional): Filter by task status (pending, completed, failed)

**Returns:** List of tasks with their responses and statuses.

**Example Use Case:**
> "Did the backend answer my question yet?"

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

### Scenario 4: Cross-Workspace Lookup (Task System)
**Frontend workspace asks a question:**
```
post_task(
  target: "backend",
  question: "What auth middleware do you use and how is it configured?",
  from: "frontend"
)
```

**Backend workspace checks for tasks:**
```
get_pending_tasks(workspace: "backend")
```
The server first attempts MCP sampling (`createMessage`) to auto-answer. If the client supports sampling, the task is auto-completed. If not, the agent sees the pending task and can investigate locally, then respond:
```
respond_to_task(
  task_id: "abc-123",
  response: "We use Passport.js with JWT strategy. Config is in src/middleware/auth.ts."
)
```

**Frontend workspace retrieves the answer:**
```
get_task_responses(from: "frontend")
```

### Scenario 5: Natural Language Prompts
Users don't need to call tools directly. They can talk naturally to your coding agent:

- *"What's the backend working on right now?"* → coding agent infers `get_workspace("backend")`
- *"Tell the frontend team our auth endpoint changed"* → coding agent infers `post_note` with appropriate parameters
- *"What API changes should I know about?"* → coding agent infers `get_notes` with `tag: "api-change"`
- *"Ask the backend what database they use"* → coding agent infers `post_task` with appropriate parameters
- *"Check if any workspaces need something from me"* → coding agent infers `get_pending_tasks`
- *"Did the backend answer my question yet?"* → coding agent infers `get_task_responses`
- *"List all workspaces"* → coding agent calls `list_workspaces`

---

## Implementation Details

### Technology Stack

- **Framework:** Node.js with ES modules
- **MCP SDK:** `@modelcontextprotocol/sdk` (v1.29.0)
- **HTTP:** Express (via SDK's `createMcpExpressApp`)
- **Validation:** Zod (v4.3.6)
- **Transport:** Streamable HTTP (MCP SDK)
- **State:** In-memory (resets on server restart)

### File Structure

```
mcp-hub/
├── server.js                      # Entrypoint — HTTP server with Streamable HTTP transport
├── lib/
│   ├── store.js                   # In-memory store (shared singleton)
│   └── task-helpers.js            # generateTaskId, ensureTasks, processPendingTasksViaSampling
├── tools/
│   ├── workspace-tools.js         # register_workspace, list_workspaces, get_workspace
│   ├── note-tools.js              # post_note, get_notes, broadcast_note, clear_notes
│   └── task-tools.js              # post_task, get_pending_tasks, respond_to_task, get_task_responses
├── package.json                   # Dependencies and metadata
├── README.md                      # User-facing documentation
├── agent.md                       # This file
├── Dockerfile                     # Docker image definition
├── docker-compose.yml             # Docker Compose config
└── windsurf-mcp-config.example.json  # Example MCP configuration
```

### Key Functions

**`store`** — A shared in-memory singleton (`{ workspaces: {} }`) imported by all tool modules. State resets on server restart.

**`generateTaskId()`** — Creates a UUID for task identification.

**`ensureTasks(workspace)`** — Ensures a workspace object has a `tasks` array (backward-compatible migration helper).

**`processPendingTasksViaSampling(workspaceName, mcpServer)`** — Attempts to auto-answer pending tasks by calling `server.createMessage()` (MCP sampling). Falls back gracefully if the client doesn't support sampling.

**`createServer()`** — Factory that creates an MCP server instance with all 11 tools registered. One instance is created per session.

### State Management

- **In-memory store with persistence:** A single JavaScript object shared across all sessions in the same process
- **Automatic persistence:** State is saved to `data/store.json` after every mutating operation (register, post note, post task, respond to task)
- **Startup recovery:** On server startup, the store loads persisted state from disk. If the file is missing or corrupt, the server starts fresh
- **No concurrency issues:** Single-threaded Node.js event loop; all sessions share the same store object

---

## Setup & Configuration

### Installation

```bash
git clone <repo> ~/workspace-hub
cd ~/workspace-hub
npm install
node server.js
```

Or with Docker:

```bash
docker build -t mcp/workspace-hub .
docker run -p 4440:4440 mcp/workspace-hub
```

### MCP Configuration

In each IDE, add to **Settings → MCP Servers**:

```json
{
  "mcpServers": {
    "workspace-hub": {
      "serverUrl": "http://localhost:4440/mcp"
    }
  }
}
```

All workspaces connect to the same running server instance.

### Workspace Registration

In each workspace, ask your code agent to register once:

> "Register this workspace with the workspace-hub MCP. Name: backend. Description: Express REST API. Stack: TypeScript, Express, PostgreSQL."

---

## Limitations & Future Enhancements

### Current Limitations

1. **No authentication:** Any workspace can read/write any other workspace's notes
2. **No TTL on notes:** Notes persist indefinitely (manual cleanup via `clear_notes`)
3. **No real-time notifications:** Workspaces must poll for updates
4. **Local only:** Server binds to localhost by default

### Suggested Enhancements

1. **Note TTL:** Auto-expire notes after a configurable duration
2. **Webhook notifications:** POST to Discord/Slack when notes are posted
3. **File attachments:** Share JSON schemas, OpenAPI specs, or code snippets
4. **Search & indexing:** Full-text search across all notes
5. **Access control:** Workspace-level permissions (read-only, write, admin)
6. **Audit logging:** Track who posted what and when
7. **Real-time subscriptions:** WebSocket support for live updates

---

## Debugging & Troubleshooting

### Common Issues

**Workspaces not connecting:**
- Verify the server is running (`node server.js`)
- Check that the `serverUrl` in MCP config matches the server's address
- Ensure port 4440 (or custom `PORT`) is not in use

**Workspace not found errors:**
- Ensure the workspace was registered first with `register_workspace`
- Check workspace name spelling (case-sensitive)

**State not persisting:**
- Verify the `data/` directory exists and is writable
- Check server console for persistence errors
- If `data/store.json` is corrupt, delete it and restart the server to start fresh

### Debugging Tips

1. Use `list_workspaces` to verify registrations
2. Use `get_workspace` to inspect full workspace state including notes
3. Check server console output for errors

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

**Workspace Hub MCP** is a lightweight, in-memory coordination system for multi-workspace development. It solves the problem of context fragmentation by providing a central hub where workspaces can register, share notes, and query each other. The server runs as a single HTTP process using the MCP Streamable HTTP transport, and all workspaces connect to the same instance.
