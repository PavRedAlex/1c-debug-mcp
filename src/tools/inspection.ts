import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";
import type { EventQueue } from "../eventQueue.js";

function parseTargetId(targetId: string) {
  return { id: targetId, seqno: 1 };
}

export function createGetCallStackTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  eventQueue: EventQueue,
) {
  return async (args: { targetId: string }) => {
    try {
      sessionManager.requireSession();
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "No active session" }) }],
        isError: true,
      };
    }

    // Call stack comes with callStackFormed event — return from last stop event
    const lastStop = eventQueue.getLastCallStack();
    if (lastStop && lastStop.targetId === args.targetId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ callStack: lastStop.callStack, lineNo: lastStop.lineNo, moduleName: lastStop.moduleName }) }],
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ callStack: [], note: "No call stack available — target not stopped or targetId mismatch" }) }],
    };
  };
}

export function createGetVariablesTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  eventQueue: EventQueue,
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
      const variables = await debugClient.evalLocalVariables(session, parseTargetId(args.targetId), undefined, eventQueue);
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
  eventQueue: EventQueue,
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
      const result = await debugClient.evalExpr(
        session,
        parseTargetId(args.targetId),
        args.expression,
        eventQueue,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ expression: args.expression, result: result ?? { typeName: "Unknown", value: "" } }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Evaluation failed", details: String(err) }) }],
        isError: true,
      };
    }
  };
}
