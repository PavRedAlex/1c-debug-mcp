import { serialize, deserialize } from "./xmlSerializer.js";
import type { Session } from "./sessionManager.js";
import type { DebugEventUnion } from "./types/events.js";
import type {
  TargetID,
  BPWorkspaceInternal,
  StepAction,
  DebugTargetType,
  ModuleType,
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

    process.stderr.write(`[1c-debug] POST ${cmd} body: ${xml.substring(0, 400)}\n`);

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
    process.stderr.write(`[1c-debug] ATTACH start: alias=${session.alias} id=${session.id}\n`);
    // XSD order: infoBaseAlias first, then idOfDebuggerUI (RDbgBaseRequest field order)
    const body: Record<string, unknown> = {
      _type: "RDBGAttachDebugUIRequest",
      infoBaseAlias: session.alias,
      idOfDebuggerUI: session.id,
      options: {
        foregroundAbility: true,
      },
    };
    if (session.password) {
      body["credentials"] = Buffer.from(session.password).toString("base64");
    }

    // Retry up to 5 times if ibInDebug (another debugger holds the session)
    for (let attempt = 1; attempt <= 5; attempt++) {
      const xml = await this.post(session.url, "rdbg", "attachDebugUI", body);
      process.stderr.write(`[1c-debug] ATTACH response (attempt ${attempt}, len=${xml.length}): ${xml.substring(0, 300)}\n`);

      if (xml.includes("registered") && !xml.includes("notRegistered")) {
        return; // success
      }
      if (xml.includes("notRegistered")) {
        throw new Error("Attach failed: notRegistered — check infoBaseAlias and credentials");
      }
      if (xml.includes("credentialsRequired") || xml.includes("fullCredentialsRequired")) {
        throw new Error("Attach failed: credentials required");
      }
      if (xml.includes("ibInDebug")) {
        if (attempt < 5) {
          process.stderr.write(`[1c-debug] ibInDebug — trying to detach existing session and retry in 1s...\n`);
          // Try to detach with current id — may free the slot
          try {
            await this.detach(session);
          } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, 1000));
        } else {
          throw new Error("Attach failed: ibInDebug — another debugger is connected. Close Configurator debugger and retry.");
        }
      }
    }
  }

  async initSettings(session: Session, breakOnNextLine = false): Promise<void> {
    const body = {
      _type: "RDBGSetInitialDebugSettingsRequest",
      infoBaseAlias: session.alias,
      idOfDebuggerUI: session.id,
      data: { breakOnNextLine },
    };
    const xml = await this.post(session.url, "rdbg", "initSettings", body);
    process.stderr.write(`[1c-debug] INIT response: ${xml}\n`);
  }

  async detach(session: Session): Promise<void> {
    const body = {
      _type: "RDBGDetachDebugUIRequest",
      infoBaseAlias: session.alias,
      idOfDebuggerUI: session.id,
    };
    await this.post(session.url, "rdbg", "detachDebugUI", body);
  }

  async setAutoAttach(session: Session, types: DebugTargetType[]): Promise<void> {
    const body = {
      _type: "RDBGSetAutoAttachSettingsRequest",
      infoBaseAlias: session.alias,
      idOfDebuggerUI: session.id,
      autoAttachSettings: {
        targetType: types,
        areaName: [],
      },
    };
    await this.post(session.url, "rdbg", "setAutoAttachSettings", body);
  }

  async ping(session: Session): Promise<DebugEventUnion[]> {
    // C# adapter sends ping with NO body — just query params
    const url = `${session.url}/e1crdbg/rdbg?cmd=pingDebugUIParams&dbgui=${session.id}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Accept": "application/xml",
        "User-Agent": "1CV8",
      },
      // no body
    });

    const text = await response.text();

    if (!response.ok) {
      process.stderr.write(`[1c-debug] PING ${response.status} body: ${text}\n`);
      throw new HttpError(response.status, text, url);
    }

    if (!text.trim()) return [];

    process.stderr.write(`[1c-debug] PING non-empty len=${text.length}: ${text.substring(0, 800)}\n`);

    process.stderr.write(`[1c-debug] PING response: ${text.substring(0, 1200)}\n`);

    // Parse ping response manually — events use namespace debugDBGUICommands
    // and field is cmdID (not cmdId)
    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      isArray: (name) => ["result", "callStack"].includes(name),
      parseTagValue: true,
    });
    const parsed = parser.parse(text) as Record<string, unknown>;
    const root = (parsed["response"] ?? parsed["result"] ?? {}) as Record<string, unknown>;
    const results: Record<string, unknown>[] = (root["result"] as Record<string, unknown>[]) ?? [];
    process.stderr.write(`[1c-debug] PING parsed root keys: ${Object.keys(root).join(", ")}\n`);
    process.stderr.write(`[1c-debug] PING results count: ${results.length}, first: ${JSON.stringify(results[0])?.substring(0, 300)}\n`);

    return results.map((event) => {
      const cmdId = String(event["cmdID"] ?? event["cmdId"] ?? "");
      const targetID = event["targetID"] as Record<string, unknown> | undefined;
      const targetId = String(targetID?.["id"] ?? "");

      if (cmdId === "callStackFormed") {
        const callStack = (event["callStack"] as Record<string, unknown>[]) ?? [];
        // C# adapter: CallStack.Reverse().First() — last frame is the current execution point
        const currentFrame = callStack[callStack.length - 1] as Record<string, unknown> | undefined;
        const moduleID = currentFrame?.["moduleID"] as Record<string, unknown> | undefined;
        return {
          type: "DBGUIExtCmdInfoCallStackFormed" as const,
          targetId,
          moduleName: String(moduleID?.["objectID"] ?? moduleID?.["URL"] ?? ""),
          lineNo: Number(currentFrame?.["lineNo"] ?? 0),
          callStack: callStack.map(f => {
            const mid = f["moduleID"] as Record<string, unknown> | undefined;
            return {
              moduleID: {
                type: "ObjectModule" as ModuleType,
                name: String(mid?.["URL"] ?? ""),
                url: String(mid?.["URL"] ?? ""),
                objectID: String(mid?.["objectID"] ?? ""),
                propertyID: String(mid?.["propertyID"] ?? ""),
              },
              lineNo: Number(f["lineNo"] ?? 0),
            };
          }),
        };
      } else if (cmdId === "exprEvaluated") {
        // Result of evalLocalVariables/evalExpr — dispatch to waiting callback
        const evalData = event["evalExprResBaseData"] as Record<string, unknown> | undefined;
        const resultId = String(evalData?.["expressionResultID"] ?? "");
        process.stderr.write(`[1c-debug] exprEvaluated: resultId=${resultId}, hasData=${!!evalData}\n`);
        process.stderr.write(`[1c-debug] exprEvaluated full: ${JSON.stringify(evalData)?.substring(0, 1000)}\n`);
        if (resultId) {
          // Will be dispatched by ping loop to eventQueue
          return {
            type: "DBGUIExtCmdInfoExprEvaluated" as const,
            targetId,
            expressionResultID: resultId,
            evalData,
          };
        }
        return { type: "DBGUIExtCmdInfoStarted" as const, targetId };
      } else if (cmdId === "targetQuit") {
        return { type: "DBGUIExtCmdInfoQuit" as const, targetId };
      } else {
        return { type: "DBGUIExtCmdInfoStarted" as const, targetId };
      }
    });
  }

  async getTargets(session: Session): Promise<DebugTarget[]> {
    const body = {
      _type: "RDBGGetDbgAllTargetStatesRequest",
      infoBaseAlias: session.alias,
      idOfDebuggerUI: session.id,
    };
    const xml = await this.post(session.url, "rdbg", "getDbgAllTargetStates", body);
    if (!xml.trim()) return [];
    const response = deserialize<RDBGGetDbgAllTargetStatesResponse>(xml);
    return response.item ?? [];
  }

  async setBreakpoints(session: Session, bp: BPWorkspaceInternal, targetId?: TargetID): Promise<void> {
    // If targetId provided: clearBreakOnNextStatement → attachDetachTargets → setBreakpoints
    if (targetId) {
      await this.clearBreakOnNextStatement(session);
      await this.attachDetachTargets(session, targetId, true);
    }

    // Build XML manually — setBreakpoints uses multiple namespaces
    const NS_RDBG = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";
    const NS_BP   = "http://v8.1c.ru/8.3/debugger/debugBreakpoints";
    const NS_BD   = "http://v8.1c.ru/8.3/debugger/debugBaseData";

    const modulesXml = bp.obj.map((obj) => {
      const bpLines = obj.bp.map((b) =>
        `<bpInfo xmlns="${NS_BP}">` +
        `<line>${b.line}</line>` +
        `<isActive>true</isActive>` +
        `<breakOnCondition>false</breakOnCondition>` +
        `<condition></condition>` +
        `<breakOnParentMethod>false</breakOnParentMethod>` +
        `<parentMethod></parentMethod>` +
        `<breakOnHitCount>false</breakOnHitCount>` +
        `<hitCountVariant>0</hitCountVariant>` +
        `<hitCount>1</hitCount>` +
        `<temp>false</temp>` +
        `</bpInfo>`
      ).join("");

      // Use objectID (GUID) if available, otherwise fall back to URL
      // Field order must match XSD: type → URL → extensionName → objectID → propertyID → extId
      const isExtension = !!(obj.moduleID.extensionName);
      const moduleIdXml = obj.moduleID.objectID
        ? `<type xmlns="${NS_BD}">${isExtension ? "ExtensionModule" : "ConfigModule"}</type>` +
          `<URL xmlns="${NS_BD}"></URL>` +
          `<extensionName xmlns="${NS_BD}">${obj.moduleID.extensionName ?? ""}</extensionName>` +
          `<objectID xmlns="${NS_BD}">${obj.moduleID.objectID}</objectID>` +
          (obj.moduleID.propertyID ? `<propertyID xmlns="${NS_BD}">${obj.moduleID.propertyID}</propertyID>` : "") +
          `<extId xmlns="${NS_BD}">0</extId>`
        : `<type xmlns="${NS_BD}">ConfigModule</type>` +
          `<URL xmlns="${NS_BD}">${obj.moduleID.url ?? `e1cib/data/${obj.moduleID.type}.${obj.moduleID.name}`}</URL>` +
          `<extensionName xmlns="${NS_BD}"></extensionName>` +
          `<extId xmlns="${NS_BD}">0</extId>`;

      return `<moduleBPInfo xmlns="${NS_BP}">` +
        `<id xmlns="${NS_BP}">` +
        moduleIdXml +
        `</id>` +
        bpLines +
        `</moduleBPInfo>`;
    }).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<request xmlns="${NS_RDBG}">` +
      `<infoBaseAlias>${session.alias}</infoBaseAlias>` +
      `<idOfDebuggerUI>${session.id}</idOfDebuggerUI>` +
      `<bpWorkspace>${modulesXml}</bpWorkspace>` +
      `</request>`;

    const url = `${session.url}/e1crdbg/rdbg?cmd=setBreakpoints`;
    process.stderr.write(`[1c-debug] POST setBreakpoints XML: ${xml.substring(0, 1200)}\n`);
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
  }
  async step(session: Session, targetId: TargetID, action: StepAction): Promise<void> {
    const NS_RDBG = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";
    const NS_BD = "http://v8.1c.ru/8.3/debugger/debugBaseData";
    const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";

    // triggeredTargetID causes XDTO error — omit it
    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<request xmlns="${NS_RDBG}" xmlns:bd="${NS_BD}" xmlns:xsi="${NS_XSI}">` +
      `<infoBaseAlias>${session.alias}</infoBaseAlias>` +
      `<idOfDebuggerUI>${session.id}</idOfDebuggerUI>` +
      `<targetID xsi:type="bd:DebugTargetIdLight"><bd:id>${targetId.id}</bd:id></targetID>` +
      `<action>${action}</action>` +
      `<simple>false</simple>` +
      `</request>`;

    const url = `${session.url}/e1crdbg/rdbg?cmd=step`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml", "User-Agent": "1CV8" },
      body: xml,
    });
    const text = await response.text();
    if (!response.ok) throw new HttpError(response.status, text, url);
  }

  async attachDetachTargets(session: Session, targetId: TargetID, attach: boolean): Promise<void> {
    const NS_RDBG = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";
    const NS_BD = "http://v8.1c.ru/8.3/debugger/debugBaseData";
    const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";

    // xsi:type="bd:DebugTargetIdLight" required — XmlSerializer adds it because field is Collection<DebugTargetIdLight>
    const idXml = `<id xsi:type="bd:DebugTargetIdLight"><bd:id>${targetId.id}</bd:id></id>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<request xmlns="${NS_RDBG}" xmlns:bd="${NS_BD}" xmlns:xsi="${NS_XSI}">` +
      `<infoBaseAlias>${session.alias}</infoBaseAlias>` +
      `<idOfDebuggerUI>${session.id}</idOfDebuggerUI>` +
      `<attach>${attach}</attach>` +
      idXml +
      `</request>`;

    const url = `${session.url}/e1crdbg/rdbg?cmd=attachDetachDbgTargets`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml", "User-Agent": "1CV8" },
      body: xml,
    });
    const text = await response.text();
    process.stderr.write(`[1c-debug] attachDetachDbgTargets response: ${text.substring(0, 600)}\n`);
    if (!response.ok) throw new HttpError(response.status, text, url);
  }

  async getCallStack(session: Session, targetId: TargetID): Promise<StackFrame[]> {
    const NS_RDBG = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";
    const NS_BD = "http://v8.1c.ru/8.3/debugger/debugBaseData";

    // Build XML manually — outer <id> inherits NS_RDBG, inner <id> needs explicit xmlns="NS_BD"
    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<request xmlns="${NS_RDBG}">` +
      `<infoBaseAlias>${session.alias}</infoBaseAlias>` +
      `<idOfDebuggerUI>${session.id}</idOfDebuggerUI>` +
      `<id><id xmlns="${NS_BD}">${targetId.id}</id></id>` +
      `</request>`;

    const url = `${session.url}/e1crdbg/rdbg?cmd=getCallStack`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml", "User-Agent": "1CV8" },
      body: xml,
    });
    const text = await response.text();
    if (!response.ok) throw new HttpError(response.status, text, url);
    if (!text.trim()) return [];
    const resp = deserialize<RDBGGetCallStackResponse>(text);
    const cs = resp.callStack;
    if (!cs) return [];
    return Array.isArray(cs) ? cs : [cs];
  }

  async evalLocalVariables(session: Session, targetId: TargetID, exprs?: string[], queue?: import("./eventQueue.js").EventQueue): Promise<Variable[]> {
    const NS_RDBG = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";
    const NS_BD = "http://v8.1c.ru/8.3/debugger/debugBaseData";
    const NS_CALC = "http://v8.1c.ru/8.3/debugger/debugCalculations";
    const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";

    // expressionResultID must be a valid UUID
    const resultId = crypto.randomUUID ? crypto.randomUUID() :
      `${Date.now().toString(16).padStart(8,'0')}-${Math.floor(Math.random()*0xffff).toString(16).padStart(4,'0')}-4${Math.floor(Math.random()*0xfff).toString(16).padStart(3,'0')}-${(Math.floor(Math.random()*4)+8).toString(16)}${Math.floor(Math.random()*0xfff).toString(16).padStart(3,'0')}-${Math.floor(Math.random()*0xffffffffffff).toString(16).padStart(12,'0')}`;

    // <expr> requires xsi:type="calc:CalculationSourceDataStorage"
    // All child elements inherit calc namespace from <expr>
    const exprXml = `<expr xsi:type="calc:CalculationSourceDataStorage">` +
      `<calc:stackLevel>0</calc:stackLevel>` +
      `<calc:srcCalcInfo>` +
      `<calc:expressionResultID>${resultId}</calc:expressionResultID>` +
      `<calc:interfaces>context</calc:interfaces>` +
      `</calc:srcCalcInfo>` +
      `<calc:presOptions>` +
      `<calc:maxTextSize>307200</calc:maxTextSize>` +
      `<calc:stopOnFirstEOL>false</calc:stopOnFirstEOL>` +
      `</calc:presOptions>` +
      `</expr>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<request xmlns="${NS_RDBG}" xmlns:bd="${NS_BD}" xmlns:calc="${NS_CALC}" xmlns:xsi="${NS_XSI}">` +
      `<infoBaseAlias>${session.alias}</infoBaseAlias>` +
      `<idOfDebuggerUI>${session.id}</idOfDebuggerUI>` +
      `<calcWaitingTime>5000</calcWaitingTime>` +
      `<targetID xsi:type="bd:DebugTargetIdLight"><bd:id>${targetId.id}</bd:id></targetID>` +
      exprXml +
      `</request>`;

    const url = `${session.url}/e1crdbg/rdbg?cmd=evalLocalVariables`;

    // Register callback BEFORE sending request to avoid race condition with ping loop
    const resultPromise = queue ? queue.waitForEvalResult(resultId, 10000) : null;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml", "User-Agent": "1CV8" },
      body: xml,
    });
    const text = await response.text();
    process.stderr.write(`[1c-debug] evalLocalVariables response: ${text.substring(0, 200)}\n`);
    if (!response.ok) throw new HttpError(response.status, text, url);

    if (!resultPromise) return [];

    // Wait for exprEvaluated event from ping loop
    const evalData = await resultPromise as Record<string, unknown> | undefined;
    if (!evalData) return [];

    return this._parseEvalResult(evalData);
  }

  async evalExpr(session: Session, targetId: TargetID, expression: string, queue: import("./eventQueue.js").EventQueue): Promise<{ typeName: string; value: string } | null> {
    const NS_RDBG = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";
    const NS_BD = "http://v8.1c.ru/8.3/debugger/debugBaseData";
    const NS_CALC = "http://v8.1c.ru/8.3/debugger/debugCalculations";
    const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";

    const resultId = crypto.randomUUID();

    // SourceCalculationDataItem field order: itemType → expression → property → index
    // SourceCalculationDataInfo field order: expressionResultID → calcItem → interfaces
    // CalculationSourceDataStorage field order: stackLevel → srcCalcInfo → presOptions
    const exprXml =
      `<expr xsi:type="calc:CalculationSourceDataStorage">` +
      `<calc:stackLevel>0</calc:stackLevel>` +
      `<calc:srcCalcInfo>` +
      `<calc:expressionResultID>${resultId}</calc:expressionResultID>` +
      `<calc:calcItem>` +
      `<calc:itemType>expression</calc:itemType>` +
      `<calc:expression>${expression}</calc:expression>` +
      `<calc:property></calc:property>` +
      `</calc:calcItem>` +
      `<calc:interfaces>context</calc:interfaces>` +
      `</calc:srcCalcInfo>` +
      `<calc:presOptions>` +
      `<calc:maxTextSize>307200</calc:maxTextSize>` +
      `<calc:stopOnFirstEOL>false</calc:stopOnFirstEOL>` +
      `</calc:presOptions>` +
      `</expr>`;

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<request xmlns="${NS_RDBG}" xmlns:bd="${NS_BD}" xmlns:calc="${NS_CALC}" xmlns:xsi="${NS_XSI}">` +
      `<infoBaseAlias>${session.alias}</infoBaseAlias>` +
      `<idOfDebuggerUI>${session.id}</idOfDebuggerUI>` +
      `<calcWaitingTime>5000</calcWaitingTime>` +
      `<targetID xsi:type="bd:DebugTargetIdLight"><bd:id>${targetId.id}</bd:id></targetID>` +
      exprXml +
      `</request>`;

    const url = `${session.url}/e1crdbg/rdbg?cmd=evalExpr`;

    const resultPromise = queue.waitForEvalResult(resultId, 10000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml", "User-Agent": "1CV8" },
      body: xml,
    });
    const text = await response.text();
    process.stderr.write(`[1c-debug] evalExpr response: ${text.substring(0, 200)}\n`);
    if (!response.ok) throw new HttpError(response.status, text, url);

    const evalData = await resultPromise as Record<string, unknown> | undefined;
    if (!evalData) return null;

    const decodeBase64 = (val: unknown): string => {
      if (!val) return "";
      try { return Buffer.from(String(val), "base64").toString("utf-8"); } catch { return String(val); }
    };

    // evalExpr returns resultValueInfo directly (not valueOfContextPropInfo)
    const resultValueInfo = evalData["resultValueInfo"] as Record<string, unknown> | undefined;
    if (resultValueInfo) {
      return {
        typeName: String(resultValueInfo["typeName"] ?? ""),
        value: decodeBase64(resultValueInfo["pres"]),
      };
    }

    // fallback: try context prop info
    const vars = this._parseEvalResult(evalData);
    if (vars.length > 0) return { typeName: vars[0].typeName, value: vars[0].value };
    return null;
  }

  private _parseEvalResult(evalData: Record<string, unknown>): Variable[] {
    // pres field is base64-encoded UTF-8 string
    // propName is a plain UTF-8 string (not base64)
    const decodeBase64 = (val: unknown): string => {
      if (!val) return "";
      try { return Buffer.from(String(val), "base64").toString("utf-8"); } catch { return String(val); }
    };
    const asString = (val: unknown): string => val ? String(val) : "";

    const calcResult = evalData["calculationResult"] as Record<string, unknown> | undefined;
    if (!calcResult) return [];

    const raw = calcResult["valueOfContextPropInfo"];
    const propInfos: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw ? [raw as Record<string, unknown>] : []);

    return propInfos.map((item) => {
      const propInfo = item["propInfo"] as Record<string, unknown> | undefined;
      const valueInfo = item["valueInfo"] as Record<string, unknown> | undefined;
      const name = asString(propInfo?.["propName"]);  // plain UTF-8 string
      const isReaded = propInfo?.["isReaded"] !== false;
      if (isReaded) {
        return { name, typeName: asString(valueInfo?.["typeName"]), value: decodeBase64(valueInfo?.["pres"]) };
      } else {
        return { name, typeName: "Error", value: asString(propInfo?.["errorStr"]) };
      }
    }).filter(v => v.name);
  }

  async clearBreakOnNextStatement(session: Session): Promise<void> {
    const NS_RDBG = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";
    process.stderr.write(`[1c-debug] clearBreakOnNextStatement called\n`);
    // RDbgBaseRequest only — no additional fields
    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<request xmlns="${NS_RDBG}">` +
      `<infoBaseAlias>${session.alias}</infoBaseAlias>` +
      `<idOfDebuggerUI>${session.id}</idOfDebuggerUI>` +
      `</request>`;

    const url = `${session.url}/e1crdbg/rdbg?cmd=clearBreakOnNextStatement`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml", "User-Agent": "1CV8" },
      body: xml,
    });
    const text = await response.text();
    if (!response.ok) throw new HttpError(response.status, text, url);
  }
}

export const debugClient = new DebugClient();
