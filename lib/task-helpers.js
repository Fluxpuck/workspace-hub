import crypto from "crypto";
import store from "./store.js";

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
 * Extracts text from a sampling response content field.
 * Per the MCP spec, content can be a single content block or an array of content blocks.
 */
function extractTextFromSamplingResponse(response) {
  const content = response.content;

  // Single content block
  if (!Array.isArray(content)) {
    return content?.type === "text" ? content.text : null;
  }

  // Array of content blocks — concatenate all text blocks
  const textParts = content
    .filter((block) => block.type === "text")
    .map((block) => block.text);

  return textParts.length > 0 ? textParts.join("\n") : null;
}

/**
 * Attempts to answer pending tasks for a workspace via MCP sampling.
 * Returns a notice string if there are pending tasks (whether or not sampling succeeded).
 * Returns null if there are no pending tasks.
 */
export async function processPendingTasksViaSampling(workspaceName, mcpServer) {
  const ws = store.workspaces[workspaceName];
  if (!ws) return null;

  ensureTasks(ws);
  const pendingTasks = ws.tasks.filter((t) => t.status === "pending");
  if (pendingTasks.length === 0) return null;

  const clientCapabilities = mcpServer.server.getClientCapabilities();
  const isSamplingSupported = !!clientCapabilities?.sampling;

  if (!isSamplingSupported) {
    const lines = pendingTasks.map(
      (t) => `📋 Pending task ${t.id} from "${t.from}": "${t.question}"`
    );
    return `\n\n---\n📬 You have ${pendingTasks.length} pending task(s) from other workspaces. Use \`get_pending_tasks\` to see them and \`respond_to_task\` to answer.\n` + lines.join("\n");
  }

  const results = [];

  for (const task of pendingTasks) {
    try {
      const response = await mcpServer.server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Question from workspace "${task.from}": ${task.question}`,
            },
          },
        ],
        systemPrompt: `You are the coding agent for the "${workspaceName}" workspace. Another workspace is asking you a question. Answer based on what you know about this workspace. Be specific and concise.`,
        modelPreferences: {
          intelligencePriority: 0.6,
          speedPriority: 0.8,
          costPriority: 0.7,
        },
        maxTokens: 1000,
      });

      const answerText = extractTextFromSamplingResponse(response);

      if (!answerText) {
        results.push(`⚠️ Task ${task.id}: sampling returned no text content. Task remains pending.`);
        continue;
      }

      const isTruncated = response.stopReason === "maxTokens";
      task.status = "completed";
      task.response = isTruncated ? answerText + "\n\n(response truncated)" : answerText;
      task.completed_at = new Date().toISOString();
      results.push(`✅ Auto-answered task ${task.id} from "${task.from}" via sampling.`);
    } catch (err) {
      results.push(`⚠️ Sampling failed for task ${task.id}: ${err.message}. Task remains pending.`);
    }
  }

  return `\n\n---\n🤖 Sampling auto-response processed ${pendingTasks.length} task(s):\n` + results.join("\n");
}
