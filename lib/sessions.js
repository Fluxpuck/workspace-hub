/**
 * Session registry — maps workspace names to their active McpServer instances.
 * Used to route sampling requests (createMessage) to the correct workspace's session.
 */

/** @type {Map<string, import("@modelcontextprotocol/sdk/server/mcp.js").McpServer>} */
const sessions = new Map();

/**
 * Bind a workspace name to an active McpServer session.
 * Replaces any previous binding for that workspace name.
 */
export function bindSession(workspaceName, mcpServer) {
  sessions.set(workspaceName, mcpServer);
}

/**
 * Remove a session binding by McpServer reference.
 * Called when a transport closes to clean up stale entries.
 */
export function unbindSession(mcpServer) {
  for (const [name, server] of sessions) {
    if (server === mcpServer) {
      sessions.delete(name);
    }
  }
}

/**
 * Get the active McpServer for a workspace, if one exists.
 * Returns undefined if the workspace has no active session.
 */
export function getSession(workspaceName) {
  return sessions.get(workspaceName);
}
