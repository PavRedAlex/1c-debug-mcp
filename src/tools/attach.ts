import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";
import type { PingLoop } from "../pingLoop.js";
import type { EventQueue } from "../eventQueue.js";
import { DebugTargetType } from "../types/requests.js";

export function createAttachTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  pingLoop: PingLoop,
  eventQueue: EventQueue,
) {
  return async (args: {
    url: string;
    infobaseAlias: string;
    autoAttach?: boolean;
    password?: string;
  }) => {
    const { url, infobaseAlias, autoAttach = true, password } = args;

    // Step 1: verify connectivity
    try {
      await debugClient.test(url);
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Debug server unreachable", url, details: String(err) }) }],
        isError: true,
      };
    }

    // Step 2: create session
    const session = sessionManager.createSession(url, infobaseAlias, password);

    // Step 3: attach
    try {
      await debugClient.attach(session);
      await debugClient.initSettings(session);
    } catch (err) {
      sessionManager.clearSession();
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Attach failed", details: String(err) }) }],
        isError: true,
      };
    }

    // Step 4: auto-attach settings
    if (autoAttach) {
      try {
        await debugClient.setAutoAttach(session, [
          DebugTargetType.Client,
          DebugTargetType.Server,
          DebugTargetType.BackgroundJob,
        ]);
      } catch {
        // non-fatal
      }
    }

    // Step 5: start ping loop
    pingLoop.start(session, debugClient, eventQueue);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ sessionId: session.id, url, infobaseAlias }) }],
    };
  };
}

export function createDetachTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  pingLoop: PingLoop,
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

    pingLoop.stop();

    try {
      await debugClient.detach(session);
    } catch {
      // best-effort
    }

    sessionManager.clearSession();

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
    };
  };
}
