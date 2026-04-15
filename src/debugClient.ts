import { serialize, deserialize } from "./xmlSerializer.js";
import type { Session } from "./sessionManager.js";
import type { DebugEventUnion } from "./types/events.js";
import type {
  TargetID,
  BPWorkspaceInternal,
  StepAction,
  DebugTargetType,
} from "./types/requests.js";
import type {
  DebugTarget,
  StackFrame,
  Variable,
  RDBGPingDebugUIResponse,
  RDBGGetDbgAllTargetStatesResponse,
  RDBGGetCallStackResponse,
  RDBGEvalLocalVariablesResponse,
  DBGUIExtCmdInfoCallStackFormed,
} from "./types/responses.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly url: string,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = "HttpError";
  }
}

export class DebugClient {
  private async post(baseUrl: string, resource: string, cmd: string, body: Record<string, unknown>, debugId?: string): Promise<string> {
    let url = `${baseUrl}/e1crdbg/${resource}?cmd=${cmd}`;
    if (debugId) url += `&dbgui=${debugId}`;

    const xml = serialize(body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Accept": "application/xml",
        "User-Agent": "1CV8",
      },
      body: xml,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new HttpError(response.status, text, url);
    }

    return text;
  }

  async test(url: string): Promise<void> {
    const body = { _type: "RDBGTestRequest" };
    await this.post(url, "rdbgTest", "test", body);
  }

  async attach(session: Session): Promise<void> {
    const body: Record<string, unknown> = {
      _type: "RDBGAttachDebugUIRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
    };
    if (session.password) {
      body["credentials"] = Buffer.from(session.password).toString("base64");
    }
    await this.post(session.url, "rdbg", "attachDebugUI", body);
  }

  async detach(session: Session): Promise<void> {
    const body = {
      _type: "RDBGDetachDebugUIRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
    };
    await this.post(session.url, "rdbg", "detachDebugUI", body);
  }

  async initSettings(session: Session): Promise<void> {
    const body = {
      _type: "RDBGSetInitialDebugSettingsRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
      data: { breakOnNextLine: false },
    };
    await this.post(session.url, "rdbg", "initSettings", body);
  }

  async setAutoAttach(session: Session, types: DebugTargetType[]): Promise<void> {
    const body = {
      _type: "RDBGSetAutoAttachSettingsRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
      autoAttachSettings: {
        targetType: types,
        areaName: [],
      },
    };
    await this.post(session.url, "rdbg", "setAutoAttachSettings", body);
  }

  async ping(session: Session): Promise<DebugEventUnion[]> {
    const body = {
      _type: "RDBGPingDebugUIRequest",
      idOfDebuggerUI: session.id,
    };
    const xml = await this.post(session.url, "rdbg", "pingDebugUIParams", body, session.id);
    if (!xml.trim()) return [];

    const response = deserialize<RDBGPingDebugUIResponse>(xml);
    const results = response.result ?? [];

    return results.map((event) => {
      const cmdId = (event as unknown as Record<string, unknown>)["cmdId"] as string ?? "";
      const targetID = (event as unknown as Record<string, unknown>)["targetID"] as TargetID | undefined;
      const targetId = targetID?.id ?? "";

      if (cmdId.includes("CallStackFormed")) {
        const callStackEvent = event as DBGUIExtCmdInfoCallStackFormed;
        const callStack = callStackEvent.callStack ?? [];
        const firstFrame = callStack[0];
        return {
          type: "DBGUIExtCmdInfoCallStackFormed" as const,
          targetId,
          moduleName: firstFrame?.moduleID?.name ?? "",
          lineNo: firstFrame?.lineNo ?? 0,
          callStack,
        };
      } else if (cmdId.includes("Quit")) {
        return { type: "DBGUIExtCmdInfoQuit" as const, targetId };
      } else {
        return { type: "DBGUIExtCmdInfoStarted" as const, targetId };
      }
    });
  }

  async getTargets(session: Session): Promise<DebugTarget[]> {
    const body = {
      _type: "RDBGGetDbgAllTargetStatesRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
    };
    const xml = await this.post(session.url, "rdbg", "getDbgAllTargetStates", body);
    if (!xml.trim()) return [];
    const response = deserialize<RDBGGetDbgAllTargetStatesResponse>(xml);
    return response.item ?? [];
  }

  async setBreakpoints(session: Session, bp: BPWorkspaceInternal): Promise<void> {
    const body = {
      _type: "RDBGSetBreakpointsRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
      bpWorkspace: bp,
    };
    await this.post(session.url, "rdbg", "setBreakpoints", body);
  }

  async step(session: Session, targetId: TargetID, action: StepAction): Promise<void> {
    const body = {
      _type: "RDBGStepRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
      targetID: targetId,
      action,
    };
    await this.post(session.url, "rdbg", "step", body);
  }

  async attachDetachTargets(session: Session, targetId: TargetID, attach: boolean): Promise<void> {
    const body = {
      _type: "RDBGAttachDetachDebugTargetsRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
      attach,
      id: [targetId],
    };
    await this.post(session.url, "rdbg", "attachDetachDbgTargets", body);
  }

  async getCallStack(session: Session, targetId: TargetID): Promise<StackFrame[]> {
    const body = {
      _type: "RDBGGetCallStackRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
      id: targetId,
    };
    const xml = await this.post(session.url, "rdbg", "getCallStack", body);
    if (!xml.trim()) return [];
    const response = deserialize<RDBGGetCallStackResponse>(xml);
    const cs = response.callStack;
    if (!cs) return [];
    return Array.isArray(cs) ? cs : [cs];
  }

  async evalLocalVariables(session: Session, targetId: TargetID, exprs?: string[]): Promise<Variable[]> {
    const expressions = (exprs ?? []).map((e) => ({ expression: e }));
    const body = {
      _type: "RDBGEvalLocalVariablesRequest",
      idOfDebuggerUI: session.id,
      infoBaseAlias: session.alias,
      targetID: targetId,
      expr: expressions,
      calcWaitingTime: 5000,
    };
    const xml = await this.post(session.url, "rdbg", "evalLocalVariables", body);
    if (!xml.trim()) return [];
    const response = deserialize<RDBGEvalLocalVariablesResponse>(xml);
    return response.result?.items ?? [];
  }
}

export const debugClient = new DebugClient();
