import { describe, it, expect, vi, afterEach } from "vitest";
import { EventQueue, TimeoutError } from "../src/eventQueue.js";
import type { StopEvent, StartedEvent } from "../src/types/events.js";

describe("EventQueue — unit tests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waitForStop resolves when a stop event is enqueued", async () => {
    const queue = new EventQueue();

    const stopEvent: StopEvent = {
      type: "DBGUIExtCmdInfoCallStackFormed",
      targetId: "target-1",
      moduleName: "МойМодуль",
      lineNo: 42,
      callStack: [],
    };

    // Enqueue after a short delay
    setTimeout(() => queue.enqueue(stopEvent), 10);

    const result = await queue.waitForStop(1000);
    expect(result.targetId).toBe("target-1");
    expect(result.lineNo).toBe(42);
    expect(result.moduleName).toBe("МойМодуль");
  });

  it("waitForStop rejects with TimeoutError when timeout expires", async () => {
    vi.useFakeTimers();
    const queue = new EventQueue();

    const promise = queue.waitForStop(500);
    vi.advanceTimersByTime(600);

    await expect(promise).rejects.toThrow(TimeoutError);
    await expect(promise).rejects.toMatchObject({ timeoutMs: 500 });
  });

  it("non-stop events do not resolve waitForStop", async () => {
    vi.useFakeTimers();
    const queue = new EventQueue();

    const startedEvent: StartedEvent = {
      type: "DBGUIExtCmdInfoStarted",
      targetId: "target-1",
    };

    const promise = queue.waitForStop(500);
    queue.enqueue(startedEvent);
    vi.advanceTimersByTime(600);

    await expect(promise).rejects.toThrow(TimeoutError);
  });

  it("emits event for all enqueued events", () => {
    const queue = new EventQueue();
    const received: string[] = [];

    queue.on("event", (e) => received.push(e.type));

    queue.enqueue({ type: "DBGUIExtCmdInfoStarted", targetId: "t1" });
    queue.enqueue({ type: "DBGUIExtCmdInfoQuit", targetId: "t1" });

    expect(received).toEqual([
      "DBGUIExtCmdInfoStarted",
      "DBGUIExtCmdInfoQuit",
    ]);
  });
});

describe("PingLoop — unit tests", () => {
  it("ping errors do not stop the loop", async () => {
    const { PingLoop } = await import("../src/pingLoop.js");
    const { EventQueue } = await import("../src/eventQueue.js");

    const loop = new PingLoop();
    const queue = new EventQueue();

    let callCount = 0;
    const mockClient = {
      ping: async () => {
        callCount++;
        if (callCount === 1) throw new Error("network error");
        return [];
      },
    };

    const session = { id: "uuid", url: "http://localhost:1550", alias: "DefAlias" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loop.start(session as any, mockClient as any, queue);

    await new Promise((r) => setTimeout(r, 1200));
    loop.stop();

    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(loop.isRunning()).toBe(false);
  });

  it("stop events from ping are enqueued", async () => {
    const { PingLoop } = await import("../src/pingLoop.js");
    const { EventQueue } = await import("../src/eventQueue.js");

    const loop = new PingLoop();
    const queue = new EventQueue();

    const stopEvent = {
      type: "DBGUIExtCmdInfoCallStackFormed" as const,
      targetId: "t1",
      moduleName: "Mod",
      lineNo: 10,
      callStack: [],
    };

    const mockClient = {
      ping: async () => [stopEvent],
    };

    const session = { id: "uuid", url: "http://localhost:1550", alias: "DefAlias" };

    const stopPromise = queue.waitForStop(2000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loop.start(session as any, mockClient as any, queue);

    const result = await stopPromise;
    loop.stop();

    expect(result.targetId).toBe("t1");
    expect(result.lineNo).toBe(10);
  });
});
