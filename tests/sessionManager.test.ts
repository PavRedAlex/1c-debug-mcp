import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { SessionManager, NoSessionError } from "../src/sessionManager.js";

describe("SessionManager — unit tests", () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager();
  });

  it("getSession returns null initially", () => {
    expect(sm.getSession()).toBeNull();
  });

  it("createSession returns a session with a UUID id", () => {
    const session = sm.createSession("http://localhost:1550", "DefAlias");
    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(session.url).toBe("http://localhost:1550");
    expect(session.alias).toBe("DefAlias");
  });

  it("createSession stores password when provided", () => {
    const session = sm.createSession("http://localhost:1550", "DefAlias", "secret");
    expect(session.password).toBe("secret");
  });

  it("getSession returns the created session", () => {
    sm.createSession("http://localhost:1550", "DefAlias");
    expect(sm.getSession()).not.toBeNull();
  });

  it("clearSession removes the session", () => {
    sm.createSession("http://localhost:1550", "DefAlias");
    sm.clearSession();
    expect(sm.getSession()).toBeNull();
  });

  it("requireSession throws NoSessionError when no session", () => {
    expect(() => sm.requireSession()).toThrow(NoSessionError);
  });

  it("requireSession returns session when active", () => {
    const created = sm.createSession("http://localhost:1550", "DefAlias");
    const required = sm.requireSession();
    expect(required.id).toBe(created.id);
  });

  it("requireSession throws after clearSession", () => {
    sm.createSession("http://localhost:1550", "DefAlias");
    sm.clearSession();
    expect(() => sm.requireSession()).toThrow(NoSessionError);
  });
});

describe("Feature: 1c-debug-mcp-server, Property 4: UUID uniqueness", () => {
  it("N sequential createSession calls produce N distinct UUIDs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (n) => {
          const sm = new SessionManager();
          const ids = new Set<string>();
          for (let i = 0; i < n; i++) {
            const session = sm.createSession("http://localhost:1550", "DefAlias");
            ids.add(session.id);
            sm.clearSession();
          }
          return ids.size === n;
        },
      ),
      { numRuns: 100 },
    );
  });
});
