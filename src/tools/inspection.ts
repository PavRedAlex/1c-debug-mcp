import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";

function parseTargetId(targetId: string) {
  return { id: targetId, seqno: 1 };
}

export function createGetCallStackTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
) {
  return async (args: { targetId: string }) => {
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
      const callStack = await debugClient.getCallStack(session, parseTargetId(args.targetId));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ callStack }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to get call stack", details: String(err) }) }],
        isError: true,
      };
    }
  };
}

export function createGetVariablesTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
) {
  return async (args: { targetId: string }) => {
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
      const variables = await debugClient.evalLocalVariables(session, parseTargetId(args.targetId));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ variables }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to get variables", details: String(err) }) }],
        isError: true,
      };
    }
  };
}

export function createEvaluateTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
) {
  return async (args: { targetId: string; expression: string }) => {
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
      const results = await debugClient.evalLocalVariables(
        session,
        parseTargetId(args.targetId),
        [args.expression],
      );
      const result = results[0] ?? { name: args.expression, typeName: "Unknown", value: "" };
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ expression: args.expression, result }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Evaluation failed", details: String(err) }) }],
        isError: true,
      };
    }
  };
}
