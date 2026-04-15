import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";
import { StepAction } from "../types/requests.js";

function parseTargetId(targetId: string) {
  return { id: targetId, seqno: 1 };
}

function createStepTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  action: StepAction,
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
      await debugClient.step(session, parseTargetId(args.targetId), action);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, action }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Step ${action} failed`, details: String(err) }) }],
        isError: true,
      };
    }
  };
}

export function createContinueTool(debugClient: DebugClient, sessionManager: SessionManager) {
  return createStepTool(debugClient, sessionManager, StepAction.CONTINUE);
}

export function createStepInTool(debugClient: DebugClient, sessionManager: SessionManager) {
  return createStepTool(debugClient, sessionManager, StepAction.STEP_IN);
}

export function createStepOutTool(debugClient: DebugClient, sessionManager: SessionManager) {
  return createStepTool(debugClient, sessionManager, StepAction.STEP_OUT);
}

export function createPauseTool(debugClient: DebugClient, sessionManager: SessionManager) {
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
      await debugClient.attachDetachTargets(session, parseTargetId(args.targetId), true);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Pause failed", details: String(err) }) }],
        isError: true,
      };
    }
  };
}
