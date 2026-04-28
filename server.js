#!/usr/bin/env node
/**
 * Workspace Hub MCP Server
 * Allows multiple IDE workspaces to share context with each other.
 *
 * Each workspace registers itself with a name + metadata.
 * Any workspace can then query others via MCP tools.
 *
 * Runs as a single HTTP server using MCP Streamable HTTP transport.
 * All workspaces connect to the same process and share in-memory state.
 */

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { unbindSession } from "./lib/sessions.js";
import { registerNoteTools } from "./tools/note-tools.js";
import { registerTaskTools } from "./tools/task-tools.js";
import { registerWorkspaceTools } from "./tools/workspace-tools.js";

// ─── Server factory ─────────────────────────────────────────────────────────

function createServer() {
  const server = new McpServer({
    name: "workspace-hub",
    description:
      "A local MCP server that enables multiple IDE workspaces to share context and communicate with each other.",
    version: "1.0.0",
  });

  registerWorkspaceTools(server, server);
  registerNoteTools(server);
  registerTaskTools(server);

  return server;
}

// ─── HTTP app ────────────────────────────────────────────────────────────────

const app = createMcpExpressApp();
const transports = new Map();

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport for this session
      transport = transports.get(sessionId);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request — create transport + server
      const mcpServer = createServer();

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
        }
        unbindSession(mcpServer);
      };

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const transport = sessionId ? transports.get(sessionId) : undefined;

  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
  }
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const transport = sessionId ? transports.get(sessionId) : undefined;

  if (transport) {
    await transport.close();
    transports.delete(sessionId);
    res.status(200).end();
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const DEFAULT_PORT = 4440;
const PORT = parseInt(process.env.PORT, 10) || DEFAULT_PORT;

app.listen(PORT, () => {
  console.log(`Workspace Hub MCP running on http://localhost:${PORT}/mcp`);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  process.exit(0);
});
