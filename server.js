#!/usr/bin/env node
/**
 * Workspace Hub MCP Server
 * Allows multiple IDE workspaces to share context with each other.
 *
 * Each workspace registers itself with a name + metadata.
 * Any workspace can then query others via MCP tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v3";
import crypto from "crypto";
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

// ─── Task helpers ─────────────────────────────────────────────────────────────

function generateTaskId() {
  return crypto.randomUUID();
}

function ensureTasks(workspace) {
  if (!Array.isArray(workspace.tasks)) {
    workspace.tasks = [];
  }
}

/**
 * Attempts to answer pending tasks for a workspace via MCP sampling.
 * Returns a notice string if there are pending tasks (whether or not sampling succeeded).
 * Returns null if there are no pending tasks.
 */
async function processPendingTasksViaSampling(workspaceName, mcpServer) {
  const store = loadStore();
  const ws = store.workspaces[workspaceName];
  if (!ws) return null;

  ensureTasks(ws);
  const pendingTasks = ws.tasks.filter((t) => t.status === "pending");
  if (pendingTasks.length === 0) return null;

  const clientCapabilities = mcpServer.server.getClientCapabilities();
  const isSamplingSupported = !!clientCapabilities?.sampling;

  const results = [];

  for (const task of pendingTasks) {
    if (isSamplingSupported) {
      try {
        const response = await mcpServer.server.createMessage({
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `A workspace called "${task.from}" is asking you the following question about this workspace ("${workspaceName}").\n\nQuestion: ${task.question}\n\nAnswer based on what you know about this workspace. Be specific and concise.`,
              },
            },
          ],
          maxTokens: 1000,
        });

        const answerText =
          response.content?.type === "text"
            ? response.content.text
            : "Unable to generate response via sampling.";

        task.status = "completed";
        task.response = answerText;
        task.completed_at = new Date().toISOString();
        results.push(`✅ Auto-answered task ${task.id} from "${task.from}" via sampling.`);
      } catch (err) {
        results.push(`⚠️ Sampling failed for task ${task.id}: ${err.message}. Task remains pending.`);
      }
    } else {
      results.push(`📋 Pending task ${task.id} from "${task.from}": "${task.question}"`);
    }
  }

  saveStore(store);

  const pendingCount = ws.tasks.filter((t) => t.status === "pending").length;
  const header = isSamplingSupported
    ? `\n\n---\n🤖 Sampling auto-response processed ${pendingTasks.length} task(s):\n`
    : `\n\n---\n📬 You have ${pendingCount} pending task(s) from other workspaces. Use \`get_pending_tasks\` to see them and \`respond_to_task\` to answer.\n`;

  return header + results.join("\n");
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

// ── Tool: post_task ──────────────────────────────────────────────────────────
server.tool(
  "post_task",
  "Post a question or lookup request to another workspace. Their agent will answer it (automatically via sampling if supported, or manually).",
  {
    target: z.string().describe("Target workspace name to ask the question to"),
    question: z.string().describe("The question or lookup request — be specific"),
    from: z.string().describe("Your workspace name (the one asking)"),
  },
  async ({ target, question, from }) => {
    const store = loadStore();
    if (!store.workspaces[target]) {
      return { content: [{ type: "text", text: `❌ Workspace "${target}" not found. Register it first.` }] };
    }
    ensureTasks(store.workspaces[target]);
    const task = {
      id: generateTaskId(),
      question,
      from,
      status: "pending",
      response: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    store.workspaces[target].tasks.push(task);
    store.workspaces[target].updated_at = new Date().toISOString();
    saveStore(store);
    return {
      content: [{ type: "text", text: `✅ Task ${task.id} posted to "${target}". The next time their agent interacts with the hub, it will attempt to auto-answer via sampling.` }],
    };
  }
);

// ── Tool: get_pending_tasks ─────────────────────────────────────────────────
server.tool(
  "get_pending_tasks",
  "Check for pending tasks assigned to your workspace from other workspaces",
  {
    workspace: z.string().describe("Your workspace name"),
  },
  async ({ workspace }) => {
    const store = loadStore();
    const ws = store.workspaces[workspace];
    if (!ws) {
      return { content: [{ type: "text", text: `❌ Workspace "${workspace}" not found.` }] };
    }

    // Attempt to auto-answer pending tasks via sampling first
    const samplingNotice = await processPendingTasksViaSampling(workspace, server);

    // Reload store after sampling may have updated tasks
    const freshStore = loadStore();
    const freshWs = freshStore.workspaces[workspace];
    ensureTasks(freshWs);
    const pendingTasks = freshWs.tasks.filter((t) => t.status === "pending");

    if (pendingTasks.length === 0) {
      const doneMsg = samplingNotice
        ? `All tasks handled.${samplingNotice}`
        : `No pending tasks for "${workspace}".`;
      return { content: [{ type: "text", text: doneMsg }] };
    }
    const lines = pendingTasks.map(
      (t) => `**Task ${t.id}**\n  From: ${t.from}\n  Question: ${t.question}\n  Posted: ${t.created_at}`
    );
    const mainText = `📋 ${pendingTasks.length} pending task(s) for "${workspace}":\n\n${lines.join("\n\n")}\n\nUse \`respond_to_task\` to answer each one.`;
    return {
      content: [{ type: "text", text: samplingNotice ? mainText + samplingNotice : mainText }],
    };
  }
);

// ── Tool: respond_to_task ───────────────────────────────────────────────────
server.tool(
  "respond_to_task",
  "Respond to a pending task from another workspace. Use this after investigating the question with your local tools.",
  {
    task_id: z.string().describe("The task ID to respond to"),
    response: z.string().describe("Your response — be specific and include concrete details"),
  },
  async ({ task_id, response }) => {
    const store = loadStore();
    for (const ws of Object.values(store.workspaces)) {
      ensureTasks(ws);
      const task = ws.tasks.find((t) => t.id === task_id);
      if (task) {
        if (task.status !== "pending") {
          return { content: [{ type: "text", text: `⚠️ Task ${task_id} is already ${task.status}.` }] };
        }
        task.status = "completed";
        task.response = response;
        task.completed_at = new Date().toISOString();
        ws.updated_at = new Date().toISOString();
        saveStore(store);
        return {
          content: [{ type: "text", text: `✅ Response posted to task ${task_id} (from "${task.from}").` }],
        };
      }
    }
    return { content: [{ type: "text", text: `❌ Task "${task_id}" not found.` }] };
  }
);

// ── Tool: get_task_responses ────────────────────────────────────────────────
server.tool(
  "get_task_responses",
  "Retrieve responses to tasks you posted to other workspaces",
  {
    from: z.string().describe("Your workspace name (the one that posted the tasks)"),
    status: z.enum(["pending", "completed", "failed"]).optional().describe("Filter by task status (default: all)"),
  },
  async ({ from, status }) => {
    const store = loadStore();
    const allTasks = [];
    for (const [wsName, ws] of Object.entries(store.workspaces)) {
      ensureTasks(ws);
      const matching = ws.tasks.filter(
        (t) => t.from === from && (!status || t.status === status)
      );
      for (const t of matching) {
        allTasks.push({ ...t, target: wsName });
      }
    }
    if (allTasks.length === 0) {
      return { content: [{ type: "text", text: `No tasks found from "${from}"${status ? ` with status "${status}"` : ""}.` }] };
    }
    const lines = allTasks.map((t) => {
      const responseText = t.response ? `\n  Response: ${t.response}` : "\n  Response: (awaiting)";
      return `**[${t.status}] Task ${t.id}** → ${t.target}\n  Question: ${t.question}${responseText}\n  Posted: ${t.created_at}`;
    });
    return {
      content: [{ type: "text", text: lines.join("\n\n---\n\n") }],
    };
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Workspace Hub MCP running on stdio");
