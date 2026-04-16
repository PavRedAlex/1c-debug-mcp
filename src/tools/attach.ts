import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";
import type { PingLoop } from "../pingLoop.js";
import type { EventQueue } from "../eventQueue.js";
import type { Config } from "../config.js";
import { DebugTargetType } from "../types/requests.js";

export function createAttachTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  pingLoop: PingLoop,
  eventQueue: EventQueue,
  config: Config,
) {
  return async (args: {
    url?: string;
    infobaseAlias?: string;
    autoAttach?: boolean;
    password?: string;
  }) => {
    const url = args.url ?? config.url;
    const infobaseAlias = args.infobaseAlias ?? config.alias;
    const autoAttach = args.autoAttach ?? true;
    const password = args.password ?? config.password;

    if (!url || !infobaseAlias) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "url and infobaseAlias are required. Set ONEC_DEBUG_URL and ONEC_INFOBASE_ALIAS in mcp.json env section, or pass them explicitly." }) }],
        isError: true,
      };
    }

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
      process.stderr.write(`[1c-debug] calling debugClient.attach...\n`);
      await debugClient.attach(session);
      // initSettings with breakOnNextLine=false
      try {
        await debugClient.initSettings(session, false);
      } catch (err) {
        process.stderr.write(`[1c-debug] initSettings failed: ${String(err)}\n`);
      }
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
          DebugTargetType.ServerEmulation,
          DebugTargetType.BackgroundJob,
        ]);
      } catch {
        // non-fatal
      }
    }

    // Step 5: attach existing targets explicitly
    try {
      const targets = await debugClient.getTargets(session);
      for (const target of targets) {
        try {
          // Pass targetIDStr for reliable identification
          const tid = { ...target.targetID, targetIDStr: target.targetIDStr };
          await debugClient.attachDetachTargets(session, tid, true);
        } catch (err) {
          process.stderr.write(`[1c-debug] attach target failed: ${String(err)}\n`);
        }
      }
    } catch { /* non-fatal */ }

    // Step 6: start ping loop
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
