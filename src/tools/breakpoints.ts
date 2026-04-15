import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";
import { ModuleType } from "../types/requests.js";

export function createSetBreakpointsTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
) {
  return async (args: {
    moduleName: string;
    moduleType?: string;
    lines: number[];
  }) => {
    const { moduleName, moduleType = ModuleType.CommonModule, lines } = args;

    if (!lines || lines.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Validation error", message: "At least one line number is required" }) }],
        isError: true,
      };
    }

    let session;
    try {
      session = sessionManager.requireSession();
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "No active session" }) }],
        isError: true,
      };
    }

    try {
      await debugClient.setBreakpoints(session, {
        obj: [{
          moduleID: { type: moduleType as ModuleType, name: moduleName },
          bp: lines.map((line) => ({ line })),
        }],
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, moduleName, lines }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to set breakpoints", details: String(err) }) }],
        isError: true,
      };
    }
  };
}

export function createClearBreakpointsTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
) {
  return async (args: { moduleName?: string; moduleType?: string }) => {
    let session;
    try {
      session = sessionManager.requireSession();
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "No active session" }) }],
        isError: true,
      };
    }

    try {
      await debugClient.setBreakpoints(session, { obj: [] });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to clear breakpoints", details: String(err) }) }],
        isError: true,
      };
    }
  };
}
