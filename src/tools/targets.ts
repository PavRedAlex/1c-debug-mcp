import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";
import type { MetadataProvider } from "../metadataProvider.js";

export function createGetTargetsTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  metadata?: MetadataProvider,
) {
  return async () => {
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
      const targets = await debugClient.getTargets(session);
      const result: Record<string, unknown> = { targets };
      if (metadata) {
        result.metadata = metadata.isReady
          ? { ready: true, moduleCount: metadata.moduleCount }
          : { ready: false, message: "Metadata is still loading in background..." };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to get targets", details: String(err) }) }],
        isError: true,
      };
    }
  };
}
