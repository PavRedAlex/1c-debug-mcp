import type { Session } from "./sessionManager.js";
import type { EventQueue } from "./eventQueue.js";
import type { DebugClient } from "./debugClient.js";
import { HttpError } from "./debugClient.js";

const PING_INTERVAL_MS = 500;
const REATTACH_DELAY_MS = 3000;

export class PingLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private reattaching = false;

  start(session: Session, client: DebugClient, queue: EventQueue): void {
    if (this.timer !== null) {
      this.stop();
    }

    this.timer = setInterval(async () => {
      if (this.reattaching) return;
      try {
        const events = await client.ping(session);
        for (const event of events) {
          // Auto-attach new targets when they start + re-send breakpoints to ALL targets
          if (event.type === "DBGUIExtCmdInfoStarted" && event.targetId) {
            process.stderr.write(`[PingLoop] TargetStarted: ${event.targetId} — attaching...\n`);
            try {
              await client.attachDetachTargets(session, { id: event.targetId, seqno: 0 }, true);
            } catch (err) {
              process.stderr.write(`[PingLoop] attach target failed: ${String(err)}\n`);
            }
            // Re-attach ALL known targets and re-send breakpoints globally
            // Server targets (ServerEmulation) don't send their own ForegroundHelperRequest
            if (session.lastBreakpoints) {
              try {
                // Re-attach all existing targets to ensure they receive the breakpoints
                const targets = await client.getTargets(session);
                for (const target of targets) {
                  try {
                    await client.attachDetachTargets(session, { id: target.targetID.id, seqno: 0 }, true);
                  } catch { /* ignore */ }
                }
                await client.setBreakpoints(session, session.lastBreakpoints);
                process.stderr.write(`[PingLoop] breakpoints re-sent after ForegroundHelperRequest\n`);
              } catch (err) {
                process.stderr.write(`[PingLoop] re-send breakpoints failed: ${String(err)}\n`);
              }
            }
          }
          // Dispatch eval results to waiting callbacks
          if (event.type === "DBGUIExtCmdInfoExprEvaluated") {
            queue.enqueueEvalResult(event.expressionResultID, event.evalData);
          }
          queue.enqueue(event);
        }
      } catch (err) {
        // If 400 "not registered" — try to re-attach
        if (err instanceof HttpError && err.status === 400) {
          this.reattaching = true;
          process.stderr.write(`[PingLoop] 400 detected, re-attaching in ${REATTACH_DELAY_MS}ms...\n`);
          setTimeout(async () => {
            try {
              // detach first to free the slot, then re-attach
              try { await client.detach(session); } catch { /* ignore */ }
              await new Promise(r => setTimeout(r, 500));
              await client.attach(session);
              process.stderr.write(`[PingLoop] re-attach successful\n`);
            } catch (attachErr) {
              process.stderr.write(`[PingLoop] re-attach failed: ${String(attachErr)}\n`);
            } finally {
              this.reattaching = false;
            }
          }, REATTACH_DELAY_MS);
        } else {
          process.stderr.write(`[PingLoop] error: ${String(err)}\n`);
        }
      }
    }, PING_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.reattaching = false;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}

export const pingLoop = new PingLoop();
