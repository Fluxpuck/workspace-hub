#!/usr/bin/env node
/**
 * Workspace Hub MCP Server
 * Allows multiple Windsurf IDE workspaces to share context with each other.
 *
 * Each workspace registers itself with a name + metadata.
 * Any workspace can then query others via MCP tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "workspaces/store.json");

// ─── Persistence helpers ────────────────────────────────────────────────────

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { workspaces: {} };
  }
}

function saveStore(store) {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    throw new Error(`Failed to save store: ${err.message}`);
  }
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "workspace-hub",
  version: "1.0.0",
});

// ── Tool: register_workspace ─────────────────────────────────────────────────
server.tool(
  "register_workspace",
  "Register this workspace so other workspaces can discover and query it",
  {
    name: z.string().describe("Unique workspace name, e.g. 'backend', 'frontend', 'llm-orchestrator'"),
    description: z.string().describe("Short description of what this workspace does"),
    tech_stack: z.array(z.string()).optional().describe("Technologies used, e.g. ['Express', 'TypeScript', 'PostgreSQL']"),
    metadata: z.record(z.string()).optional().describe("Any extra key/value pairs to share (repo URL, port, etc.)"),
  },
  async ({ name, description, tech_stack, metadata }) => {
    const store = loadStore();
    store.workspaces[name] = {
      name,
      description,
      tech_stack: tech_stack ?? [],
      metadata: metadata ?? {},
      notes: store.workspaces[name]?.notes ?? [],
      registered_at: store.workspaces[name]?.registered_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveStore(store);
    return {
      content: [{ type: "text", text: `✅ Workspace "${name}" registered successfully.` }],
    };
  }
);

// ── Tool: list_workspaces ────────────────────────────────────────────────────
server.tool(
  "list_workspaces",
  "List all registered workspaces and their descriptions",
  {},
  async () => {
    const store = loadStore();
    const workspaces = Object.values(store.workspaces);
    if (workspaces.length === 0) {
      return { content: [{ type: "text", text: "No workspaces registered yet." }] };
    }
    const lines = workspaces.map((w) =>
      `• **${w.name}** — ${w.description}\n  Stack: ${w.tech_stack.join(", ") || "unspecified"}\n  Last updated: ${w.updated_at}`
    );
    return { content: [{ type: "text", text: lines.join("\n\n") }] };
  }
);

// ── Tool: get_workspace ──────────────────────────────────────────────────────
server.tool(
  "get_workspace",
  "Get full details about a specific workspace, including all its notes",
  {
    name: z.string().describe("Name of the workspace to retrieve"),
  },
  async ({ name }) => {
    const store = loadStore();
    const ws = store.workspaces[name];
    if (!ws) {
      return { content: [{ type: "text", text: `❌ Workspace "${name}" not found.` }] };
    }
    const notesSection = ws.notes.length
      ? ws.notes.map((n, i) => `  [${i + 1}] (${n.timestamp}) ${n.content}`).join("\n")
      : "  (none)";
    const metaSection = Object.entries(ws.metadata)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n") || "  (none)";

    const text = [
      `# Workspace: ${ws.name}`,
      `Description: ${ws.description}`,
      `Tech stack: ${ws.tech_stack.join(", ") || "unspecified"}`,
      `Registered: ${ws.registered_at}`,
      `Updated: ${ws.updated_at}`,
      `\nMetadata:\n${metaSection}`,
      `\nNotes:\n${notesSection}`,
    ].join("\n");
    return { content: [{ type: "text", text }] };
  }
);

// ── Tool: post_note ──────────────────────────────────────────────────────────
server.tool(
  "post_note",
  "Post a note to a workspace — share context, API changes, decisions, TODOs that other workspaces should know about",
  {
    workspace: z.string().describe("Target workspace name"),
    content: z.string().describe("The note content — be specific and useful"),
    tag: z.string().optional().describe("Optional tag: 'api-change', 'decision', 'todo', 'bug', etc."),
    from: z.string().optional().describe("Name of the workspace posting this note"),
  },
  async ({ workspace, content, tag, from }) => {
    const store = loadStore();
    if (!store.workspaces[workspace]) {
      return { content: [{ type: "text", text: `❌ Workspace "${workspace}" not found. Register it first.` }] };
    }
    const note = {
      content,
      tag: tag ?? "general",
      from: from ?? "unknown",
      timestamp: new Date().toISOString(),
    };
    store.workspaces[workspace].notes.push(note);
    store.workspaces[workspace].updated_at = new Date().toISOString();
    saveStore(store);
    return {
      content: [{ type: "text", text: `✅ Note posted to "${workspace}".` }],
    };
  }
);

// ── Tool: get_notes ──────────────────────────────────────────────────────────
server.tool(
  "get_notes",
  "Retrieve notes for a workspace, optionally filtered by tag or source workspace",
  {
    workspace: z.string().describe("Workspace to get notes from"),
    tag: z.string().optional().describe("Filter by tag"),
    from: z.string().optional().describe("Filter by source workspace"),
    limit: z.number().optional().describe("Max number of notes to return (default: 20)"),
  },
  async ({ workspace, tag, from, limit = 20 }) => {
    const store = loadStore();
    const ws = store.workspaces[workspace];
    if (!ws) {
      return { content: [{ type: "text", text: `❌ Workspace "${workspace}" not found.` }] };
    }
    let notes = [...ws.notes].reverse(); // newest first
    if (tag) notes = notes.filter((n) => n.tag === tag);
    if (from) notes = notes.filter((n) => n.from === from);
    notes = notes.slice(0, limit);

    if (notes.length === 0) {
      return { content: [{ type: "text", text: `No notes found for "${workspace}" with the given filters.` }] };
    }
    const lines = notes.map((n) =>
      `[${n.tag}] ${n.timestamp} (from: ${n.from})\n${n.content}`
    );
    return { content: [{ type: "text", text: lines.join("\n\n---\n\n") }] };
  }
);

// ── Tool: broadcast_note ─────────────────────────────────────────────────────
server.tool(
  "broadcast_note",
  "Post the same note to ALL registered workspaces at once",
  {
    content: z.string().describe("Note content to broadcast"),
    tag: z.string().optional().describe("Tag for the note"),
    from: z.string().optional().describe("Source workspace name"),
    exclude: z.array(z.string()).optional().describe("Workspace names to skip"),
  },
  async ({ content, tag, from, exclude = [] }) => {
    const store = loadStore();
    const targets = Object.keys(store.workspaces).filter((n) => !exclude.includes(n));
    if (targets.length === 0) {
      return {
        content: [{ type: "text", text: "No workspaces to broadcast to." }],
      };
    }
    const note = {
      content,
      tag: tag ?? "broadcast",
      from: from ?? "unknown",
      timestamp: new Date().toISOString(),
    };
    for (const name of targets) {
      store.workspaces[name].notes.push(note);
      store.workspaces[name].updated_at = new Date().toISOString();
    }
    saveStore(store);
    return {
      content: [{ type: "text", text: `✅ Broadcasted to: ${targets.join(", ")}` }],
    };
  }
);

// ── Tool: clear_notes ───────────────────────────────────────────────────────
server.tool(
  "clear_notes",
  "Clear all notes from a workspace",
  {
    workspace: z.string(),
  },
  async ({ workspace }) => {
    const store = loadStore();
    if (!store.workspaces[workspace]) {
      return { content: [{ type: "text", text: `❌ Workspace "${workspace}" not found.` }] };
    }
    store.workspaces[workspace].notes = [];
    store.workspaces[workspace].updated_at = new Date().toISOString();
    saveStore(store);
    return { content: [{ type: "text", text: `✅ Notes cleared for "${workspace}".` }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Workspace Hub MCP running on stdio");
