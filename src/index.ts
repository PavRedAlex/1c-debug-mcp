#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { DebugClient } from "./debugClient.js";
import { SessionManager } from "./sessionManager.js";
import { PingLoop } from "./pingLoop.js";
import { EventQueue } from "./eventQueue.js";
import { parseConfig } from "./config.js";
import { ModuleType } from "./types/requests.js";

import { createAttachTool, createDetachTool } from "./tools/attach.js";
import { createGetTargetsTool } from "./tools/targets.js";
import { createSetBreakpointsTool, createClearBreakpointsTool } from "./tools/breakpoints.js";
import { createContinueTool, createStepInTool, createStepOutTool, createPauseTool } from "./tools/execution.js";
import { createWaitForStopTool } from "./tools/waitForStop.js";
import { createGetCallStackTool, createGetVariablesTool, createEvaluateTool } from "./tools/inspection.js";

// Singletons
const debugClient = new DebugClient();
const sessionManager = new SessionManager();
const pingLoop = new PingLoop();
const eventQueue = new EventQueue();

// Tool handlers
const attachTool = createAttachTool(debugClient, sessionManager, pingLoop, eventQueue);
const detachTool = createDetachTool(debugClient, sessionManager, pingLoop);
const getTargetsTool = createGetTargetsTool(debugClient, sessionManager);
const setBreakpointsTool = createSetBreakpointsTool(debugClient, sessionManager);
const clearBreakpointsTool = createClearBreakpointsTool(debugClient, sessionManager);
const continueTool = createContinueTool(debugClient, sessionManager);
const stepInTool = createStepInTool(debugClient, sessionManager);
const stepOutTool = createStepOutTool(debugClient, sessionManager);
const pauseTool = createPauseTool(debugClient, sessionManager);
const waitForStopTool = createWaitForStopTool(sessionManager, eventQueue);
const getCallStackTool = createGetCallStackTool(debugClient, sessionManager);
const getVariablesTool = createGetVariablesTool(debugClient, sessionManager);
const evaluateTool = createEvaluateTool(debugClient, sessionManager);

// MCP Server
const server = new McpServer({
  name: "1c-debug",
  version: "1.0.0",
});

server.tool(
  "attach",
  "Connect to 1C debug server (dbgs.exe)",
  {
    url: z.string().describe("Debug server URL, e.g. http://localhost:1550"),
    infobaseAlias: z.string().describe("Infobase alias, e.g. DefAlias"),
    autoAttach: z.boolean().optional().describe("Auto-attach to all debug targets (default: true)"),
    password: z.string().optional().describe("Debug server password"),
  },
  attachTool,
);

server.tool(
  "detach",
  "Disconnect from 1C debug server",
  {},
  detachTool,
);

server.tool(
  "get_targets",
  "Get list of connected debug targets (1C processes)",
  {},
  getTargetsTool,
);

server.tool(
  "set_breakpoints",
  "Set breakpoints in a BSL module",
  {
    moduleName: z.string().describe("Module name, e.g. МойОбщийМодуль"),
    moduleType: z.string().optional().describe(`Module type: ${Object.values(ModuleType).join(", ")}`),
    lines: z.array(z.number().int().positive()).describe("Line numbers to set breakpoints on"),
  },
  setBreakpointsTool,
);

server.tool(
  "clear_breakpoints",
  "Clear all breakpoints",
  {
    moduleName: z.string().optional(),
    moduleType: z.string().optional(),
  },
  clearBreakpointsTool,
);

server.tool(
  "continue",
  "Continue execution of a stopped debug target",
  {
    targetId: z.string().describe("Debug target ID from get_targets"),
  },
  continueTool,
);

server.tool(
  "step_in",
  "Step into the next statement (enters procedures/functions)",
  {
    targetId: z.string().describe("Debug target ID"),
  },
  stepInTool,
);

server.tool(
  "step_out",
  "Step out of the current procedure/function",
  {
    targetId: z.string().describe("Debug target ID"),
  },
  stepOutTool,
);

server.tool(
  "pause",
  "Pause execution of a debug target on the next statement",
  {
    targetId: z.string().describe("Debug target ID"),
  },
  pauseTool,
);

server.tool(
  "wait_for_stop",
  "Wait until a debug target stops (breakpoint or step)",
  {
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
  },
  waitForStopTool,
);

server.tool(
  "get_call_stack",
  "Get call stack of a stopped debug target",
  {
    targetId: z.string().describe("Debug target ID"),
  },
  getCallStackTool,
);

server.tool(
  "get_variables",
  "Get local variables of a stopped debug target",
  {
    targetId: z.string().describe("Debug target ID"),
  },
  getVariablesTool,
);

server.tool(
  "evaluate",
  "Evaluate a BSL expression in the context of a stopped debug target",
  {
    targetId: z.string().describe("Debug target ID"),
    expression: z.string().describe("BSL expression to evaluate"),
  },
  evaluateTool,
);

// Graceful shutdown
async function shutdown() {
  pingLoop.stop();
  const session = sessionManager.getSession();
  if (session) {
    try {
      await debugClient.detach(session);
    } catch {
      // best-effort
    }
    sessionManager.clearSession();
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

// Start
const config = parseConfig();
if (config.url) {
  process.stderr.write(`[1c-debug] Default URL: ${config.url}, alias: ${config.alias ?? "DefAlias"}\n`);
} else {
  process.stderr.write(`[1c-debug] No default URL configured. Use 'attach' tool or create .1c-debug.json in project root.\n`);
}

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[1c-debug] MCP server started\n");
