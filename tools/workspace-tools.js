import { z } from "zod/v3";
import { loadStore, saveStore } from "../lib/store.js";

export function registerWorkspaceTools(server) {
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
        tasks: store.workspaces[name]?.tasks ?? [],
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
}
