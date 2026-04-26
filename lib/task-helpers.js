import crypto from "crypto";
import { loadStore, saveStore } from "./store.js";

export function generateTaskId() {
  return crypto.randomUUID();
}

export function ensureTasks(workspace) {
  if (!Array.isArray(workspace.tasks)) {
    workspace.tasks = [];
  }
}

/**
 * Scans all workspaces for pending tasks and returns a summary notice.
 * Returns null if no pending tasks exist anywhere.
 */
export function getPendingTasksSummary() {
  const store = loadStore();
  const summaries = [];
  for (const [wsName, ws] of Object.entries(store.workspaces)) {
    ensureTasks(ws);
    const pendingCount = ws.tasks.filter((t) => t.status === "pending").length;
    if (pendingCount > 0) {
      summaries.push(`${pendingCount} for "${wsName}"`);
    }
  }
  if (summaries.length === 0) return null;
  return `\n\n---\n📬 Pending tasks: ${summaries.join(", ")}. Use \`get_pending_tasks\` to see them and \`respond_to_task\` to answer.`;
}

/**
 * Wraps a tool handler to append a pending-task notice to its response.
 */
export function withTaskNotice(handler) {
  return async (params) => {
    const result = await handler(params);
    const notice = getPendingTasksSummary();
    if (notice) {
      const lastContent = result.content[result.content.length - 1];
      if (lastContent?.type === "text") {
        lastContent.text += notice;
      }
    }
    return result;
  };
}

/**
 * Attempts to answer pending tasks for a workspace via MCP sampling.
 * Returns a notice string if there are pending tasks (whether or not sampling succeeded).
 * Returns null if there are no pending tasks.
 */
export async function processPendingTasksViaSampling(workspaceName, mcpServer) {
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
