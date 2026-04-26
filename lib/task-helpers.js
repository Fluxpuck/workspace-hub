import crypto from "crypto";
import store, { saveStore } from "./store.js";
import { getSession } from "./sessions.js";

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
    saveStore();
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
 * Immediately attempts to auto-answer a single task by calling createMessage()
 * on the target workspace's active MCP session.
 *
 * Returns { answered: true } if sampling succeeded, or
 *         { answered: false, reason: "..." } explaining why it didn't.
 */
export async function autoAnswerTask(task, targetWorkspaceName) {
  const targetServer = getSession(targetWorkspaceName);
  if (!targetServer) {
    return { answered: false, reason: "Target workspace has no active session. Task remains pending." };
  }

  const clientCapabilities = targetServer.getClientCapabilities();
  const isSamplingSupported = !!clientCapabilities?.sampling;
  if (!isSamplingSupported) {
    return { answered: false, reason: "Target workspace does not support sampling. Task remains pending." };
  }

  try {
    const response = await targetServer.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Question from workspace "${task.from}": ${task.question}`,
          },
        },
      ],
      systemPrompt: `You are the coding agent for the "${targetWorkspaceName}" workspace. Another workspace is asking you a question. Answer based on what you know about this workspace. Be specific and concise.`,
      modelPreferences: {
        intelligencePriority: 0.6,
        speedPriority: 0.8,
        costPriority: 0.7,
      },
      maxTokens: 1000,
    });

    const answerText = extractTextFromSamplingResponse(response);
    if (!answerText) {
      return { answered: false, reason: "Sampling returned no text content. Task remains pending." };
    }

    const isTruncated = response.stopReason === "maxTokens";
    task.status = "completed";
    task.response = isTruncated ? answerText + "\n\n(response truncated)" : answerText;
    task.completed_at = new Date().toISOString();
    return { answered: true };
  } catch (err) {
    return { answered: false, reason: `Sampling failed: ${err.message}. Task remains pending.` };
  }
}
