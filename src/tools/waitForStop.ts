import type { SessionManager } from "../sessionManager.js";
import type { EventQueue } from "../eventQueue.js";
import type { MetadataProvider } from "../metadataProvider.js";
import { TimeoutError } from "../eventQueue.js";

export function createWaitForStopTool(
  sessionManager: SessionManager,
  eventQueue: EventQueue,
  metadata?: MetadataProvider,
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

      // Resolve objectIDs to human-readable module names
      const resolveModule = (objectID: string) =>
        (metadata?.resolveModuleName(objectID) ?? objectID);

      const resolvedModuleName = resolveModule(event.moduleName);
      const resolvedCallStack = event.callStack.map(frame => ({
        ...frame,
        moduleID: {
          ...frame.moduleID,
          name: resolveModule(frame.moduleID.objectID ?? frame.moduleID.name),
        },
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            targetId: event.targetId,
            moduleName: resolvedModuleName,
            lineNo: event.lineNo,
            callStack: resolvedCallStack,
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
