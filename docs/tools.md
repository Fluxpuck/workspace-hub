# Workspace Hub MCP Tools

This document describes all available tools in the Workspace Hub MCP server and how to use them.

## Overview

The Workspace Hub provides 7 tools for managing and sharing context across multiple IDE workspaces:

1. **register_workspace** — Register a workspace
2. **list_workspaces** — Discover all workspaces
3. **get_workspace** — Retrieve workspace details
4. **post_note** — Post a note to a workspace
5. **get_notes** — Retrieve notes with filtering
6. **broadcast_note** — Post to all workspaces
7. **clear_notes** — Clear notes from a workspace

---

## 1. register_workspace

**Purpose:** Register this workspace so it can be discovered and receive notes from other workspaces.

**Parameters:**
- `name` (required, string) — Unique workspace identifier (e.g., "backend", "frontend", "llm-orchestrator")
- `description` (required, string) — Short description of what this workspace does
- `tech_stack` (optional, array of strings) — Technologies used (e.g., ["Express", "TypeScript", "PostgreSQL"])
- `metadata` (optional, object) — Custom key-value pairs for sharing additional info (e.g., {"repo": "https://...", "port": "3000"})

**Returns:** Success confirmation message

**Example:**
```
register_workspace(
  name: "backend",
  description: "Express REST API for user authentication",
  tech_stack: ["TypeScript", "Express", "PostgreSQL"],
  metadata: {"repo": "https://github.com/org/backend", "port": "3001"}
)
```

**Notes:**
- Registration is idempotent — re-registering updates metadata but preserves existing notes and registration timestamp
- Workspace names are case-sensitive
- Use descriptive names that clearly identify the workspace's purpose

---

## 2. list_workspaces

**Purpose:** Discover all registered workspaces and their descriptions.

**Parameters:** None

**Returns:** Formatted list of all workspaces with names, descriptions, tech stacks, and last update times

**Example:**
```
list_workspaces()
```

**Output:**
```
• **backend** — Express REST API for user authentication
  Stack: TypeScript, Express, PostgreSQL
  Last updated: 2025-04-24T10:30:00.000Z

• **frontend** — Next.js web application
  Stack: Next.js, TypeScript, Tailwind CSS
  Last updated: 2025-04-24T10:25:00.000Z
```

**Notes:**
- Use this to see what workspaces are available before posting notes or querying details
- Workspaces are listed in no particular order

---

## 3. get_workspace

**Purpose:** Retrieve full details about a specific workspace, including all its notes and metadata.

**Parameters:**
- `name` (required, string) — Workspace name to retrieve

**Returns:** Detailed workspace information including:
- Name, description, tech stack
- Registration and last update timestamps
- All custom metadata
- Complete notes feed (newest first)

**Example:**
```
get_workspace(name: "backend")
```

**Output:**
```
# Workspace: backend
Description: Express REST API for user authentication
Tech stack: TypeScript, Express, PostgreSQL
Registered: 2025-04-24T09:00:00.000Z
Updated: 2025-04-24T10:30:00.000Z

Metadata:
  repo: https://github.com/org/backend
  port: 3001

Notes:
  [1] (2025-04-24T10:30:00.000Z) POST /auth/login now requires MFA verification
  [2] (2025-04-24T10:15:00.000Z) Database migration completed
```

**Notes:**
- Returns an error if the workspace doesn't exist
- Useful for understanding what another workspace is working on
- Notes are displayed newest first

---

## 4. post_note

**Purpose:** Post a note to a specific workspace to share context, API changes, decisions, or TODOs.

**Parameters:**
- `workspace` (required, string) — Target workspace name
- `content` (required, string) — The note content (be specific and useful)
- `tag` (optional, string) — Category tag for filtering (e.g., "api-change", "decision", "todo", "bug", "breaking-change")
- `from` (optional, string) — Source workspace name (defaults to "unknown")

**Returns:** Success confirmation message

**Example:**
```
post_note(
  workspace: "frontend",
  content: "POST /api/auth/login now requires a 'mfa_token' field. Returns 400 if missing.",
  tag: "api-change",
  from: "backend"
)
```

**Notes:**
- The target workspace must be registered first
- Tags help with filtering and discovery — use consistently
- Be specific in the content; include field names, endpoint paths, and concrete details
- If `from` is omitted, it defaults to "unknown"
- If `tag` is omitted, it defaults to "general"

---

## 5. get_notes

**Purpose:** Retrieve notes from a workspace with optional filtering by tag or source.

**Parameters:**
- `workspace` (required, string) — Workspace to query
- `tag` (optional, string) — Filter by tag (e.g., "api-change", "decision")
- `from` (optional, string) — Filter by source workspace
- `limit` (optional, number) — Max notes to return (default: 20)

**Returns:** Formatted list of notes, newest first

**Example:**
```
get_notes(
  workspace: "backend",
  tag: "api-change",
  limit: 10
)
```

**Output:**
```
[api-change] 2025-04-24T10:30:00.000Z (from: backend)
POST /auth/login now requires a 'mfa_token' field. Returns 400 if missing.

---

[api-change] 2025-04-24T09:45:00.000Z (from: backend)
GET /users/:id now returns 'email_verified' boolean in response
```

**Notes:**
- Returns an error if the workspace doesn't exist
- Notes are displayed newest first
- Filters are applied together (tag AND from, not OR)
- If no notes match the filters, returns a message indicating no results

---

## 6. broadcast_note

**Purpose:** Post the same note to all registered workspaces at once.

**Parameters:**
- `content` (required, string) — Note content to broadcast
- `tag` (optional, string) — Tag for the note (defaults to "broadcast")
- `from` (optional, string) — Source workspace name (defaults to "unknown")
- `exclude` (optional, array of strings) — Workspace names to skip

**Returns:** List of workspaces that received the note

**Example:**
```
broadcast_note(
  content: "We're switching from npm to Bun for all projects. Update your setup.",
  tag: "breaking-change",
  from: "devops",
  exclude: ["devops"]
)
```

**Output:**
```
✅ Broadcasted to: backend, frontend, llm-orchestrator
```

**Notes:**
- Use sparingly — only for truly important, workspace-wide changes
- The `exclude` parameter is useful to avoid posting to yourself
- If no workspaces exist or all are excluded, returns a message indicating no targets
- All receiving workspaces get the same note with the same timestamp

---

## 7. clear_notes

**Purpose:** Clear all notes from a workspace (cleanup).

**Parameters:**
- `workspace` (required, string) — Workspace to clear

**Returns:** Success confirmation message

**Example:**
```
clear_notes(workspace: "frontend")
```

**Notes:**
- This permanently deletes all notes for the workspace
- Use when notes become stale or outdated
- The workspace itself remains registered; only notes are cleared
- Returns an error if the workspace doesn't exist

---

## Suggested Note Tags

Use these tags consistently for better discoverability:

| Tag | Purpose | Example |
|-----|---------|---------|
| `api-change` | Endpoint signature or contract changed | "POST /users now requires 'email' field" |
| `decision` | Architectural or technical decision made | "Migrating from REST to GraphQL" |
| `todo` | Action item for another workspace | "Frontend needs to update login flow" |
| `bug` | Known bug affecting other workspaces | "Auth service has memory leak in v2.1.0" |
| `breaking-change` | Breaks existing integrations | "Switching to Bun; npm scripts won't work" |
| `info` | General FYI or announcement | "Database maintenance window tonight" |
| `broadcast` | Auto-tagged for broadcast_note calls | (automatic) |
| `general` | Default tag if none specified | (default) |

---

## Common Workflows

### Scenario 1: Backend notifies frontend of API change

**Backend workspace:**
```
post_note(
  workspace: "frontend",
  content: "POST /api/sessions now requires a 'locale' field in the body. Returns 400 if missing.",
  tag: "api-change",
  from: "backend"
)
```

**Frontend workspace (later):**
```
get_notes(workspace: "backend", tag: "api-change")
```

### Scenario 2: Frontend checks backend status

**Frontend workspace:**
```
get_workspace(name: "backend")
```

Returns full workspace details including tech stack, metadata, and all recent notes.

### Scenario 3: LLM orchestrator broadcasts breaking change

**LLM Orchestrator workspace:**
```
broadcast_note(
  content: "All AI responses now return { result, confidence, model } instead of plain string. Update your integrations.",
  tag: "breaking-change",
  from: "llm-orchestrator",
  exclude: ["llm-orchestrator"]
)
```

### Scenario 4: Natural language prompts

You don't need to call tools directly. Talk naturally to Cascade:

- *"What's the backend working on right now?"* → Cascade calls `get_workspace("backend")`
- *"Tell the frontend team our auth endpoint changed"* → Cascade calls `post_note` with appropriate parameters
- *"What API changes should I know about?"* → Cascade calls `get_notes(tag: "api-change")`
- *"List all workspaces"* → Cascade calls `list_workspaces`
- *"Announce to everyone that we're switching to Bun"* → Cascade calls `broadcast_note`

---

## Error Handling

All tools return error messages if something goes wrong:

- **Workspace not found** — "❌ Workspace 'xyz' not found."
- **No results** — "No notes found for 'xyz' with the given filters."
- **Empty broadcast** — "No workspaces to broadcast to."

If you encounter errors, verify:
1. Workspace name spelling (case-sensitive)
2. Workspace is registered (use `list_workspaces` to check)
3. File permissions on `workspaces/store.json`
4. Disk space available

---

## Best Practices

1. **Be specific in notes** — Include concrete details (endpoint names, field names, breaking changes)
2. **Use tags consistently** — Adopt the suggested tag vocabulary for discoverability
3. **Register once per workspace** — Registration is idempotent but should only happen once
4. **Clean up stale notes** — Periodically use `clear_notes` to remove outdated information
5. **Broadcast sparingly** — Use `broadcast_note` only for truly important, workspace-wide changes
6. **Include source in notes** — Use the `from` parameter so recipients know who posted it
7. **Check before posting** — Use `list_workspaces` to verify the target workspace exists
