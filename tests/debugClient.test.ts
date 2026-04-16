import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import { DebugClient, HttpError } from "../src/debugClient.js";
import { NS, serialize } from "../src/xmlSerializer.js";
import { StepAction, ModuleType } from "../src/types/requests.js";

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

const session = {
  id: "test-uuid-1234",
  url: "http://localhost:1550",
  alias: "DefAlias",
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("DebugClient — unit tests", () => {
  it("test() succeeds on HTTP 200", async () => {
    vi.stubGlobal("fetch", mockFetch(200, "<RDBGTestResponse/>"));
    const client = new DebugClient();
    await expect(client.test("http://localhost:1550")).resolves.toBeUndefined();
  });

  it("test() throws HttpError on HTTP 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, "Not Found"));
    const client = new DebugClient();
    await expect(client.test("http://localhost:1550")).rejects.toThrow(HttpError);
    await expect(client.test("http://localhost:1550")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("attach() throws HttpError on HTTP 500", async () => {
    vi.stubGlobal("fetch", mockFetch(500, "Internal Server Error"));
    const client = new DebugClient();
    await expect(client.attach(session)).rejects.toThrow(HttpError);
    await expect(client.attach(session)).rejects.toMatchObject({ status: 500 });
  });

  it("attach() sends credentials when password is set", async () => {
    const captured: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      captured.push(init);
      return Promise.resolve({ ok: true, status: 200, text: async () => "<RDBGAttachDebugUIResponse/>" });
    }));

    const client = new DebugClient();
    await client.attach({ ...session, password: "secret" });

    const body = captured[0].body as string;
    expect(body).toContain("credentials");
  });

  it("ping() returns empty array on empty response", async () => {
    vi.stubGlobal("fetch", mockFetch(200, ""));
    const client = new DebugClient();
    const result = await client.ping(session);
    expect(result).toEqual([]);
  });

  it("getTargets() returns empty array on empty response", async () => {
    vi.stubGlobal("fetch", mockFetch(200, ""));
    const client = new DebugClient();
    const result = await client.getTargets(session);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Property 3: HTTP headers
// ---------------------------------------------------------------------------

describe("Feature: 1c-debug-mcp-server, Property 3: HTTP headers", () => {
  it("every request includes required headers", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        (alias) => {
          const capturedHeaders: Record<string, string>[] = [];

          vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            capturedHeaders.push(init.headers as Record<string, string>);
            return Promise.resolve({ ok: true, status: 200, text: async () => "" });
          }));

          const client = new DebugClient();
          const s = { ...session, alias };

          // Fire and forget — we just need the headers captured
          void client.test(s.url);

          if (capturedHeaders.length > 0) {
            const h = capturedHeaders[0];
            return (
              h["Content-Type"] === "application/xml; charset=utf-8" &&
              h["Accept"] === "application/xml" &&
              h["User-Agent"] === "1CV8"
            );
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it("attach request always has correct headers", async () => {
    const capturedHeaders: Record<string, string>[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders.push(init.headers as Record<string, string>);
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.attach(session);

    expect(capturedHeaders[0]["Content-Type"]).toBe("application/xml; charset=utf-8");
    expect(capturedHeaders[0]["Accept"]).toBe("application/xml");
    expect(capturedHeaders[0]["User-Agent"]).toBe("1CV8");
  });
});

// ---------------------------------------------------------------------------
// Property 7: Stop event extraction (via serializer — covered in xmlSerializer tests)
// Property 8 & 9: Parsing covered via deserialize in xmlSerializer tests
// ---------------------------------------------------------------------------

describe("Feature: 1c-debug-mcp-server, Property 8: call stack parsing", () => {
  it("getCallStack returns N frames for N-frame XML response", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            moduleName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Zа-яА-Я][a-zA-Zа-яА-Я0-9]*$/.test(s)),
            lineNo: fc.integer({ min: 1, max: 9999 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (frames) => {
          const callStackXml = frames
            .map(
              (f) =>
                `<callStack><moduleID><type>CommonModule</type><name>${f.moduleName}</name></moduleID><lineNo>${f.lineNo}</lineNo></callStack>`,
            )
            .join("");

          const xml = `<?xml version="1.0" encoding="UTF-8"?><RDBGGetCallStackResponse xmlns="${NS}">${callStackXml}</RDBGGetCallStackResponse>`;

          vi.stubGlobal("fetch", mockFetch(200, xml));
          const client = new DebugClient();
          const result = await client.getCallStack(session, { id: "t1", seqno: 1 });

          return result.length === frames.length &&
            result.every((frame, i) => frame.lineNo === frames[i].lineNo);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("Feature: 1c-debug-mcp-server, Property 10: targets parsing", () => {
  it("getTargets returns K targets for K-target XML response", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RDBGGetDbgAllTargetStatesResponse xmlns="${NS}">
  <item><targetID><id>t1</id><seqno>1</seqno></targetID><targetType>Client</targetType><suspended>true</suspended></item>
  <item><targetID><id>t2</id><seqno>2</seqno></targetID><targetType>Server</targetType><suspended>false</suspended></item>
</RDBGGetDbgAllTargetStatesResponse>`;

    vi.stubGlobal("fetch", mockFetch(200, xml));
    const client = new DebugClient();
    const result = await client.getTargets(session);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Serializer-level property tests (Properties 5 & 6 already in xmlSerializer.test.ts)
// Verify step action mapping at DebugClient level
// ---------------------------------------------------------------------------

describe("DebugClient — step action mapping", () => {
  it.each([
    [StepAction.CONTINUE, "Continue"],
    [StepAction.STEP_IN, "StepIn"],
    [StepAction.STEP_OUT, "StepOut"],
    [StepAction.STEP_OVER, "StepOver"],
  ])("step(%s) sends correct action in XML body", async (action, expected) => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.step(session, { id: "t1", seqno: 1 }, action);
    expect(capturedBody).toContain(expected);
  });
});

// ---------------------------------------------------------------------------
// Task 2: evalLocalVariables XML structure
// ---------------------------------------------------------------------------

describe("DebugClient — evalLocalVariables XML structure (Task 2)", () => {
  it("evalLocalVariables sends xmlns on <expr> element, not on children", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.evalLocalVariables(session, { id: "661f9511-f3ac-52e5-b827-557766551111", seqno: 1 });

    const NS_CALC = "http://v8.1c.ru/8.3/debugger/debugCalculations";
    // xmlns must be on <expr>
    expect(capturedBody).toContain(`<expr xmlns="${NS_CALC}">`);
    // child elements must NOT have their own xmlns
    expect(capturedBody).not.toContain(`<stackLevel xmlns=`);
    expect(capturedBody).not.toContain(`<srcCalcInfo xmlns=`);
    expect(capturedBody).not.toContain(`<expressionResultID xmlns=`);
    expect(capturedBody).not.toContain(`<interfaces xmlns=`);
    expect(capturedBody).not.toContain(`<presOptions xmlns=`);
    expect(capturedBody).not.toContain(`<maxTextSize xmlns=`);
  });

  it("evalLocalVariables uses expressionResultID (capital D)", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.evalLocalVariables(session, { id: "test-uuid", seqno: 1 });

    expect(capturedBody).toContain("<expressionResultID>");
    expect(capturedBody).not.toContain("<expressionResultId>");
  });

  it("evalLocalVariables sends calcWaitingTime=100", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.evalLocalVariables(session, { id: "test-uuid", seqno: 1 });

    expect(capturedBody).toContain("<calcWaitingTime>100</calcWaitingTime>");
  });

  it("evalLocalVariables sends targetID with xsi:type and bd:id", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.evalLocalVariables(session, { id: "661f9511-f3ac-52e5-b827-557766551111", seqno: 1 });

    expect(capturedBody).toContain(`xsi:type="bd:DebugTargetIdLight"`);
    expect(capturedBody).toContain(`<bd:id>661f9511-f3ac-52e5-b827-557766551111</bd:id>`);
  });

  it("evalLocalVariables includes stopOnFirstEOL in presOptions", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.evalLocalVariables(session, { id: "test-uuid", seqno: 1 });

    expect(capturedBody).toContain("<stopOnFirstEOL>false</stopOnFirstEOL>");
  });
});

// ---------------------------------------------------------------------------
// Task 1: step XML structure — DebugTargetIdLight (only <id> field)
// ---------------------------------------------------------------------------

describe("DebugClient — step XML structure (Task 1)", () => {
  it("step() sends <targetID> with only <id> field (DebugTargetIdLight)", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.step(session, { id: "661f9511-f3ac-52e5-b827-557766551111", seqno: 1 }, StepAction.CONTINUE);

    // targetID must contain only <id>
    expect(capturedBody).toContain("<targetID><id>661f9511-f3ac-52e5-b827-557766551111</id></targetID>");
    // must NOT contain seqno or appID inside targetID
    expect(capturedBody).not.toContain("<seqno>");
    expect(capturedBody).not.toContain("<appID>");
  });

  it("step() sends <triggeredTargetID> with only <id> field", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.step(session, { id: "661f9511-f3ac-52e5-b827-557766551111", seqno: 1 }, StepAction.STEP_IN);

    expect(capturedBody).toContain("<triggeredTargetID><id>661f9511-f3ac-52e5-b827-557766551111</id></triggeredTargetID>");
  });

  it("step() action values match 1C protocol (Continue/StepIn/StepOut/StepOver)", async () => {
    const cases: [StepAction, string][] = [
      [StepAction.CONTINUE, "Continue"],
      [StepAction.STEP_IN, "StepIn"],
      [StepAction.STEP_OUT, "StepOut"],
      [StepAction.STEP_OVER, "StepOver"],
    ];

    for (const [action, expected] of cases) {
      let capturedBody = "";
      vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return Promise.resolve({ ok: true, status: 200, text: async () => "" });
      }));

      const client = new DebugClient();
      await client.step(session, { id: "test-uuid", seqno: 0 }, action);
      expect(capturedBody).toContain(`<action>${expected}</action>`);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 3: getCallStack XML structure — inner <id> with xmlns="NS_BD"
// ---------------------------------------------------------------------------

describe("DebugClient — getCallStack XML structure (Task 3)", () => {
  const NS_BD = "http://v8.1c.ru/8.3/debugger/debugBaseData";

  it("getCallStack sends inner <id> with xmlns NS_BD", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.getCallStack(session, { id: "661f9511-f3ac-52e5-b827-557766551111", seqno: 1 });

    // Inner <id> must have xmlns="NS_BD"
    expect(capturedBody).toContain(`<id xmlns="${NS_BD}">661f9511-f3ac-52e5-b827-557766551111</id>`);
  });

  it("getCallStack outer <id> does not have its own xmlns attribute", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.getCallStack(session, { id: "test-uuid", seqno: 1 });

    // Outer <id> must NOT have xmlns attribute — it inherits from <request>
    expect(capturedBody).toContain("<id><id xmlns=");
    expect(capturedBody).not.toMatch(/<id xmlns="http:\/\/v8\.1c\.ru\/8\.3\/debugger\/debugRDBGRequestResponse">/);
  });

  it("getCallStack structure matches: <id><id xmlns=NS_BD>uuid</id></id>", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.getCallStack(session, { id: "abc-123", seqno: 0 });

    expect(capturedBody).toContain(`<id><id xmlns="${NS_BD}">abc-123</id></id>`);
  });
});

// ---------------------------------------------------------------------------
// Task 4: attachDetachTargets XML structure — xsi:type and bd: prefix
// ---------------------------------------------------------------------------

describe("DebugClient — attachDetachTargets XML structure (Task 4)", () => {
  it("attachDetachTargets sends xsi:type=bd:DebugTargetIdLight on <id>", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.attachDetachTargets(session, { id: "661f9511-f3ac-52e5-b827-557766551111", seqno: 1 }, true);

    expect(capturedBody).toContain(`xsi:type="bd:DebugTargetIdLight"`);
  });

  it("attachDetachTargets uses bd: prefix on nested id", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.attachDetachTargets(session, { id: "661f9511-f3ac-52e5-b827-557766551111", seqno: 1 }, true);

    expect(capturedBody).toContain(`<bd:id>661f9511-f3ac-52e5-b827-557766551111</bd:id>`);
  });

  it("attachDetachTargets declares xmlns:bd and xmlns:xsi on <request>", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.attachDetachTargets(session, { id: "test-uuid", seqno: 0 }, false);

    expect(capturedBody).toContain(`xmlns:bd="http://v8.1c.ru/8.3/debugger/debugBaseData"`);
    expect(capturedBody).toContain(`xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`);
  });
});

// ---------------------------------------------------------------------------
// Task 5: clearBreakOnNextStatement
// ---------------------------------------------------------------------------

describe("DebugClient — clearBreakOnNextStatement (Task 5)", () => {
  it("sends request with cmd=clearBreakOnNextStatement", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, _init: RequestInit) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.clearBreakOnNextStatement(session);

    expect(capturedUrl).toContain("cmd=clearBreakOnNextStatement");
  });

  it("body contains only infoBaseAlias and idOfDebuggerUI (RDbgBaseRequest)", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.clearBreakOnNextStatement(session);

    expect(capturedBody).toContain("<infoBaseAlias>DefAlias</infoBaseAlias>");
    expect(capturedBody).toContain("<idOfDebuggerUI>test-uuid-1234</idOfDebuggerUI>");
    // No extra fields
    expect(capturedBody).not.toContain("<targetID>");
    expect(capturedBody).not.toContain("<attach>");
    expect(capturedBody).not.toContain("<expr");
  });
});

// ---------------------------------------------------------------------------
// Task 6: setBreakpoints call order — clearBreakOnNextStatement → attachDetachTargets → setBreakpoints
// ---------------------------------------------------------------------------

describe("DebugClient — setBreakpoints call order (Task 6)", () => {
  it("when targetId provided: clearBreakOnNextStatement called before attachDetachTargets", async () => {
    const callOrder: string[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, _init: RequestInit) => {
      if (url.includes("clearBreakOnNextStatement")) callOrder.push("clear");
      else if (url.includes("attachDetachDbgTargets")) callOrder.push("attach");
      else if (url.includes("setBreakpoints")) callOrder.push("setBreakpoints");
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.setBreakpoints(session, { obj: [] }, { id: "target-uuid", seqno: 1 });

    expect(callOrder[0]).toBe("clear");
    expect(callOrder[1]).toBe("attach");
    expect(callOrder[2]).toBe("setBreakpoints");
  });

  it("when targetId NOT provided: only setBreakpoints is called", async () => {
    const callOrder: string[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, _init: RequestInit) => {
      if (url.includes("clearBreakOnNextStatement")) callOrder.push("clear");
      else if (url.includes("attachDetachDbgTargets")) callOrder.push("attach");
      else if (url.includes("setBreakpoints")) callOrder.push("setBreakpoints");
      return Promise.resolve({ ok: true, status: 200, text: async () => "" });
    }));

    const client = new DebugClient();
    await client.setBreakpoints(session, { obj: [] });

    expect(callOrder).toEqual(["setBreakpoints"]);
  });
});

// ---------------------------------------------------------------------------
// Task 7: evalLocalVariables response parsing — valueOfContextPropInfo + base64
// ---------------------------------------------------------------------------

describe("DebugClient — evalLocalVariables response parsing (Task 7)", () => {
  const NS_CALC = "http://v8.1c.ru/8.3/debugger/debugCalculations";

  function makeEvalResponse(vars: Array<{ propName: string; typeName: string; pres: string }>) {
    const propInfoXml = vars.map(v => {
      const propNameB64 = Buffer.from(v.propName, "utf-8").toString("base64");
      const presB64 = Buffer.from(v.pres, "utf-8").toString("base64");
      return `<valueOfContextPropInfo>` +
        `<propInfo><propName>${propNameB64}</propName><isReadable>true</isReadable><isWritable>true</isWritable><isReaded>true</isReaded></propInfo>` +
        `<valueInfo><typeCode>6</typeCode><typeName>${v.typeName}</typeName><pres>${presB64}</pres><presProcessedCorrectly>true</presProcessedCorrectly></valueInfo>` +
        `</valueOfContextPropInfo>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<response xmlns="${NS_CALC}">` +
      `<result>` +
      `<evalResultState>correctly</evalResultState>` +
      `<expressionResultID>test-id</expressionResultID>` +
      `<errorOccurred>false</errorOccurred>` +
      `<calculationResult>` +
      `<viewInterface>context</viewInterface>` +
      propInfoXml +
      `</calculationResult>` +
      `</result>` +
      `</response>`;
  }

  it("returns non-empty list of variables from valueOfContextPropInfo", async () => {
    const mockXml = makeEvalResponse([
      { propName: "МояПеременная", typeName: "Строка", pres: "Привет мир" },
      { propName: "Число", typeName: "Число", pres: "42" },
    ]);

    vi.stubGlobal("fetch", mockFetch(200, mockXml));
    const client = new DebugClient();
    const result = await client.evalLocalVariables(session, { id: "target-uuid", seqno: 1 });

    expect(result.length).toBeGreaterThan(0);
  });

  it("decodes base64 propName correctly", async () => {
    const mockXml = makeEvalResponse([
      { propName: "МояПеременная", typeName: "Строка", pres: "значение" },
    ]);

    vi.stubGlobal("fetch", mockFetch(200, mockXml));
    const client = new DebugClient();
    const result = await client.evalLocalVariables(session, { id: "target-uuid", seqno: 1 });

    expect(result[0].name).toBe("МояПеременная");
  });

  it("decodes base64 pres (value) correctly", async () => {
    const mockXml = makeEvalResponse([
      { propName: "Var", typeName: "Строка", pres: "Привет мир" },
    ]);

    vi.stubGlobal("fetch", mockFetch(200, mockXml));
    const client = new DebugClient();
    const result = await client.evalLocalVariables(session, { id: "target-uuid", seqno: 1 });

    expect(result[0].value).toBe("Привет мир");
  });

  it("uses errorStr when isReaded=false", async () => {
    const errorB64 = Buffer.from("Ошибка чтения", "utf-8").toString("base64");
    const propNameB64 = Buffer.from("БрokenVar", "utf-8").toString("base64");
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<response xmlns="${NS_CALC}">` +
      `<result>` +
      `<calculationResult>` +
      `<valueOfContextPropInfo>` +
      `<propInfo><propName>${propNameB64}</propName><isReaded>false</isReaded><errorStr>${errorB64}</errorStr></propInfo>` +
      `</valueOfContextPropInfo>` +
      `</calculationResult>` +
      `</result>` +
      `</response>`;

    vi.stubGlobal("fetch", mockFetch(200, mockXml));
    const client = new DebugClient();
    const result = await client.evalLocalVariables(session, { id: "target-uuid", seqno: 1 });

    expect(result[0].typeName).toBe("Error");
    expect(result[0].value).toBe("Ошибка чтения");
  });
});

// ---------------------------------------------------------------------------
// Task 9: Property tests for preservation checking
// ---------------------------------------------------------------------------

describe("Property 2: Preservation — attachDebugUI XML unchanged", () => {
  it("attach() XML structure is preserved for any valid session", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          url: fc.constant("http://localhost:1550"),
          alias: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.includes("<") && !s.includes(">") && !s.includes("&") && !s.includes('"') && !s.includes("'")),
        }),
        async (sess) => {
          let attachBody = "";
          vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init: RequestInit) => {
            // Capture only the attachDebugUI request
            if ((url as string).includes("attachDebugUI")) {
              attachBody = init.body as string;
            }
            return Promise.resolve({ ok: true, status: 200, text: async () => "<response>registered</response>" });
          }));

          const client = new DebugClient();
          await client.attach(sess);

          // Preservation: attachDebugUI must always contain infoBaseAlias and idOfDebuggerUI
          return (
            attachBody.includes(`<infoBaseAlias>${sess.alias}</infoBaseAlias>`) &&
            attachBody.includes(`<idOfDebuggerUI>${sess.id}</idOfDebuggerUI>`) &&
            attachBody.includes(`xmlns="http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse"`)
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("Property 1: Bug Condition — step always uses DebugTargetIdLight", () => {
  it("step() <targetID> always contains only <id> for any UUID targetId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(StepAction.CONTINUE, StepAction.STEP_IN, StepAction.STEP_OUT, StepAction.STEP_OVER),
        async (targetUuid, action) => {
          let capturedBody = "";
          vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            capturedBody = init.body as string;
            return Promise.resolve({ ok: true, status: 200, text: async () => "" });
          }));

          const client = new DebugClient();
          await client.step(session, { id: targetUuid, seqno: 0 }, action);

          // Property: targetID must contain ONLY <id> — no seqno, appID, or other fields
          const hasOnlyId = capturedBody.includes(`<targetID><id>${targetUuid}</id></targetID>`);
          const hasNoSeqno = !capturedBody.includes("<seqno>");
          const hasNoAppID = !capturedBody.includes("<appID>");

          return hasOnlyId && hasNoSeqno && hasNoAppID;
        },
      ),
      { numRuns: 100 },
    );
  });
});
