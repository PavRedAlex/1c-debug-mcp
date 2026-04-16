import { EventEmitter } from "events";
import type { DebugEventUnion, StopEvent } from "./types/events.js";

export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`No stop event received within ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class EventQueue extends EventEmitter {
  private _pendingStop: StopEvent | null = null;
  private _lastCallStack: StopEvent | null = null;
  private _evalCallbacks = new Map<string, (result: unknown) => void>();

  enqueue(event: DebugEventUnion): void {
    this.emit("event", event);
    if (event.type === "DBGUIExtCmdInfoCallStackFormed") {
      this._pendingStop = event;
      this._lastCallStack = event;
      this.emit("stop", event);
    }
  }

  getLastCallStack(): StopEvent | null {
    return this._lastCallStack;
  }

  enqueueEvalResult(expressionResultID: string, result: unknown): void {
    const cb = this._evalCallbacks.get(expressionResultID);
    if (cb) {
      this._evalCallbacks.delete(expressionResultID);
      cb(result);
    }
  }

  waitForEvalResult(expressionResultID: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._evalCallbacks.delete(expressionResultID);
        reject(new TimeoutError(timeoutMs));
      }, timeoutMs);

      this._evalCallbacks.set(expressionResultID, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  clearPendingStop(): void {
    this._pendingStop = null;
  }

  waitForStop(timeoutMs: number): Promise<StopEvent> {
    // If already stopped — return immediately
    if (this._pendingStop) {
      const event = this._pendingStop;
      this._pendingStop = null;
      return Promise.resolve(event);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("stop", onStop);
        reject(new TimeoutError(timeoutMs));
      }, timeoutMs);

      const onStop = (event: StopEvent) => {
        clearTimeout(timer);
        this._pendingStop = null;
        resolve(event);
      };

      this.once("stop", onStop);
    });
  }
}

export const eventQueue = new EventQueue();
