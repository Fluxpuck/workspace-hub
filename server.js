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
import { registerWorkspaceTools } from "./tools/workspace-tools.js";
import { registerNoteTools } from "./tools/note-tools.js";
import { registerTaskTools } from "./tools/task-tools.js";

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "workspace-hub",
  version: "1.0.0",
});

registerWorkspaceTools(server);
registerNoteTools(server);
registerTaskTools(server);

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Workspace Hub MCP running on stdio");
