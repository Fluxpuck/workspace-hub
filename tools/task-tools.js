import { z } from "zod/v3";
import store from "../lib/store.js";
import { generateTaskId, ensureTasks, autoAnswerTask, withTaskNotice } from "../lib/task-helpers.js";

export function registerTaskTools(server) {
  // ── Tool: post_task ──────────────────────────────────────────────────────────
  server.tool(
    "post_task",
    "Post a question or lookup request to another workspace. Their agent will answer it (automatically via sampling if supported, or manually).",
    {
      target: z.string().describe("Target workspace name to ask the question to"),
      question: z.string().describe("The question or lookup request — be specific"),
      from: z.string().describe("Your workspace name (the one asking)"),
    },
    withTaskNotice(async ({ target, question, from }) => {
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

      const autoResult = await autoAnswerTask(task, target);

      if (autoResult.answered) {
        return {
          content: [{ type: "text", text: `✅ Task ${task.id} posted to "${target}" and auto-answered via sampling.\n\n**Response:** ${task.response}` }],
        };
      }
      return {
        content: [{ type: "text", text: `✅ Task ${task.id} posted to "${target}". ${autoResult.reason}` }],
      };
    })
  );

  // ── Tool: get_pending_tasks ─────────────────────────────────────────────────
  server.tool(
    "get_pending_tasks",
    "Check for pending tasks assigned to your workspace from other workspaces",
    {
      workspace: z.string().describe("Your workspace name"),
    },
    withTaskNotice(async ({ workspace }) => {
      const ws = store.workspaces[workspace];
      if (!ws) {
        return { content: [{ type: "text", text: `❌ Workspace "${workspace}" not found.` }] };
      }

      ensureTasks(ws);
      const pendingTasks = ws.tasks.filter((t) => t.status === "pending");

      if (pendingTasks.length === 0) {
        return { content: [{ type: "text", text: `No pending tasks for "${workspace}".` }] };
      }
      const lines = pendingTasks.map(
        (t) => `**Task ${t.id}**\n  From: ${t.from}\n  Question: ${t.question}\n  Posted: ${t.created_at}`
      );
      return {
        content: [{ type: "text", text: `📋 ${pendingTasks.length} pending task(s) for "${workspace}":\n\n${lines.join("\n\n")}\n\nUse \`respond_to_task\` to answer each one.` }],
      };
    })
  );

  // ── Tool: respond_to_task ───────────────────────────────────────────────────
  server.tool(
    "respond_to_task",
    "Respond to a pending task from another workspace. Use this after investigating the question with your local tools.",
    {
      task_id: z.string().describe("The task ID to respond to"),
      response: z.string().describe("Your response — be specific and include concrete details"),
    },
    withTaskNotice(async ({ task_id, response }) => {
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
          return {
            content: [{ type: "text", text: `✅ Response posted to task ${task_id} (from "${task.from}").` }],
          };
        }
      }
      return { content: [{ type: "text", text: `❌ Task "${task_id}" not found.` }] };
    })
  );

  // ── Tool: get_task_responses ────────────────────────────────────────────────
  server.tool(
    "get_task_responses",
    "Retrieve responses to tasks you posted to other workspaces",
    {
      from: z.string().describe("Your workspace name (the one that posted the tasks)"),
      status: z.enum(["pending", "completed", "failed"]).optional().describe("Filter by task status (default: all)"),
    },
    withTaskNotice(async ({ from, status }) => {
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
    })
  );
}
