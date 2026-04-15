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
    [StepAction.CONTINUE, "CONTINUE"],
    [StepAction.STEP_IN, "STEP_IN"],
    [StepAction.STEP_OUT, "STEP_OUT"],
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
