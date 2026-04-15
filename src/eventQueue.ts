import { EventEmitter } from "events";
import type { DebugEventUnion, StopEvent } from "./types/events.js";

export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`No stop event received within ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class EventQueue extends EventEmitter {
  enqueue(event: DebugEventUnion): void {
    this.emit("event", event);
    if (event.type === "DBGUIExtCmdInfoCallStackFormed") {
      this.emit("stop", event);
    }
  }

  waitForStop(timeoutMs: number): Promise<StopEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("stop", onStop);
        reject(new TimeoutError(timeoutMs));
      }, timeoutMs);

      const onStop = (event: StopEvent) => {
        clearTimeout(timer);
        resolve(event);
      };

      this.once("stop", onStop);
    });
  }
}

export const eventQueue = new EventQueue();
