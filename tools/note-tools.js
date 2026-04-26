import { z } from "zod/v3";
import { loadStore, saveStore } from "../lib/store.js";

export function registerNoteTools(server) {
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
}
