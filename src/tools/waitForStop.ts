import type { SessionManager } from "../sessionManager.js";
import type { EventQueue } from "../eventQueue.js";
import { TimeoutError } from "../eventQueue.js";

export function createWaitForStopTool(
  sessionManager: SessionManager,
  eventQueue: EventQueue,
) {
  return async (args: { timeout?: number }) => {
    const timeoutMs = args.timeout ?? 30000;

    try {
      sessionManager.requireSession();
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "No active session" }) }],
        isError: true,
      };
    }

    try {
      const event = await eventQueue.waitForStop(timeoutMs);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            targetId: event.targetId,
            moduleName: event.moduleName,
            lineNo: event.lineNo,
            callStack: event.callStack,
          }),
        }],
      };
    } catch (err) {
      if (err instanceof TimeoutError) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Timeout", timeoutMs }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Wait failed", details: String(err) }) }],
        isError: true,
      };
    }
  };
}
