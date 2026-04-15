import type { Session } from "./sessionManager.js";
import type { EventQueue } from "./eventQueue.js";
import type { DebugClient } from "./debugClient.js";

const PING_INTERVAL_MS = 500;

export class PingLoop {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(session: Session, client: DebugClient, queue: EventQueue): void {
    if (this.timer !== null) {
      this.stop();
    }

    this.timer = setInterval(async () => {
      try {
        const events = await client.ping(session);
        for (const event of events) {
          queue.enqueue(event);
        }
      } catch (err) {
        process.stderr.write(`[PingLoop] error: ${String(err)}\n`);
      }
    }, PING_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}

export const pingLoop = new PingLoop();
