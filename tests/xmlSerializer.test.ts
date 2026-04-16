import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { serialize, deserialize, NS, XmlParseError } from "../src/xmlSerializer.js";
import { StepAction, ModuleType } from "../src/types/requests.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttachRequest(id: string, alias: string) {
  return {
    _type: "RDBGAttachDebugUIRequest",
    idOfDebuggerUI: id,
    infoBaseAlias: alias,
  };
}

function makeSetBreakpointsRequest(
  id: string,
  alias: string,
  moduleName: string,
  moduleType: ModuleType,
  lines: number[],
) {
  return {
    _type: "RDBGSetBreakpointsRequest",
    idOfDebuggerUI: id,
    infoBaseAlias: alias,
    bpWorkspace: {
      obj: [
        {
          moduleID: { type: moduleType, name: moduleName },
          bp: lines.map((line) => ({ line })),
        },
      ],
    },
  };
}

function makeStepRequest(
  id: string,
  alias: string,
  targetId: string,
  action: StepAction,
) {
  return {
    _type: "RDBGStepRequest",
    idOfDebuggerUI: id,
    infoBaseAlias: alias,
    targetID: { id: targetId, seqno: 1 },
    action,
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("XmlSerializer — unit tests", () => {
  it("serializes attach request with correct root element", () => {
    const req = makeAttachRequest("test-uuid", "DefAlias");
    const xml = serialize(req);
    // serialize() always uses <request> as root element (1C protocol requirement)
    expect(xml).toContain("<request");
    expect(xml).toContain("test-uuid");
    expect(xml).toContain("DefAlias");
  });

  it("serializes setBreakpoints with correct bp elements", () => {
    const req = makeSetBreakpointsRequest(
      "uuid",
      "DefAlias",
      "МойМодуль",
      ModuleType.CommonModule,
      [10, 20, 30],
    );
    const xml = serialize(req);
    const bpCount = (xml.match(/<bp>/g) ?? []).length;
    expect(bpCount).toBe(3);
    expect(xml).toContain("<line>10</line>");
    expect(xml).toContain("<line>20</line>");
    expect(xml).toContain("<line>30</line>");
  });

  it("serializes step request with correct action", () => {
    const req = makeStepRequest("uuid", "DefAlias", "target-1", StepAction.STEP_IN);
    const xml = serialize(req);
    expect(xml).toContain("StepIn");
    expect(xml).toContain("target-1");
  });

  it("deserializes ping response with empty result", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RDBGPingDebugUIResponse xmlns="${NS}">
</RDBGPingDebugUIResponse>`;
    const result = deserialize<{ result?: unknown[] }>(xml);
    expect(result).toBeDefined();
  });

  it("deserializes call stack response", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RDBGGetCallStackResponse xmlns="${NS}">
  <callStack>
    <moduleID><type>CommonModule</type><name>МойМодуль</name></moduleID>
    <procedureName>МояПроцедура</procedureName>
    <lineNo>42</lineNo>
  </callStack>
</RDBGGetCallStackResponse>`;
    const result = deserialize<{ callStack: Array<{ lineNo: number; procedureName: string }> }>(xml);
    const frames = Array.isArray(result.callStack) ? result.callStack : [result.callStack];
    expect(frames).toHaveLength(1);
    expect(frames[0].lineNo).toBe(42);
    expect(frames[0].procedureName).toBe("МояПроцедура");
  });

  it("throws XmlParseError for malformed XML", () => {
    const badXml = "<unclosed>";
    expect(() => deserialize(badXml)).toThrow(XmlParseError);
    try {
      deserialize(badXml);
    } catch (e) {
      expect(e).toBeInstanceOf(XmlParseError);
      expect((e as XmlParseError).raw).toBe(badXml);
    }
  });

  it("throws XmlParseError and includes raw body", () => {
    const badXml = "not xml at all <<<";
    expect(() => deserialize(badXml)).toThrow(XmlParseError);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

// Arbitrary generators
const arbitraryUuid = fc.uuid();
const arbitraryAlias = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);
const arbitraryModuleName = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => /^[a-zA-Zа-яА-Я][a-zA-Zа-яА-Я0-9_]*$/.test(s));
const arbitraryModuleType = fc.constantFrom(...Object.values(ModuleType));
const arbitraryStepAction = fc.constantFrom(...Object.values(StepAction));
const arbitraryLines = fc.array(fc.integer({ min: 1, max: 9999 }), {
  minLength: 1,
  maxLength: 20,
});

describe("Feature: 1c-debug-mcp-server, Property 2: XML namespace", () => {
  it("serialize always includes the 1C debug namespace", () => {
    fc.assert(
      fc.property(arbitraryUuid, arbitraryAlias, (id, alias) => {
        const req = makeAttachRequest(id, alias);
        const xml = serialize(req);
        return xml.includes(NS);
      }),
      { numRuns: 100 },
    );
  });

  it("setBreakpoints XML always includes namespace", () => {
    fc.assert(
      fc.property(
        arbitraryUuid,
        arbitraryAlias,
        arbitraryModuleName,
        arbitraryModuleType,
        arbitraryLines,
        (id, alias, name, type, lines) => {
          const req = makeSetBreakpointsRequest(id, alias, name, type, lines);
          const xml = serialize(req);
          return xml.includes(NS);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("step request XML always includes namespace", () => {
    fc.assert(
      fc.property(
        arbitraryUuid,
        arbitraryAlias,
        arbitraryUuid,
        arbitraryStepAction,
        (id, alias, targetId, action) => {
          const req = makeStepRequest(id, alias, targetId, action);
          const xml = serialize(req);
          return xml.includes(NS);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: 1c-debug-mcp-server, Property 5: breakpoint structure", () => {
  it("serialized setBreakpoints contains exactly lines.length <bp> elements", () => {
    fc.assert(
      fc.property(
        arbitraryUuid,
        arbitraryAlias,
        arbitraryModuleName,
        arbitraryModuleType,
        arbitraryLines,
        (id, alias, name, type, lines) => {
          const req = makeSetBreakpointsRequest(id, alias, name, type, lines);
          const xml = serialize(req);
          const bpCount = (xml.match(/<bp>/g) ?? []).length;
          return bpCount === lines.length;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: 1c-debug-mcp-server, Property 6: step action mapping", () => {
  it("serialized step request contains correct action and targetId", () => {
    fc.assert(
      fc.property(
        arbitraryUuid,
        arbitraryAlias,
        arbitraryUuid,
        arbitraryStepAction,
        (id, alias, targetId, action) => {
          const req = makeStepRequest(id, alias, targetId, action);
          const xml = serialize(req);
          return xml.includes(action) && xml.includes(targetId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
