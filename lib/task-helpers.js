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
