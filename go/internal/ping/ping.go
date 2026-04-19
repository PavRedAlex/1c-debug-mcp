package ping

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/1c-debug-mcp/go/internal/client"
	"github.com/1c-debug-mcp/go/internal/events"
	"github.com/1c-debug-mcp/go/internal/session"
	"github.com/1c-debug-mcp/go/internal/xmlproto"
)

// Loop manages the ping goroutine that polls dbgs.exe for debug events.
type Loop struct {
	mu      sync.Mutex
	cancel  context.CancelFunc
	done    chan struct{}
	running bool
}

// New creates a new Loop.
func New() *Loop {
	return &Loop{}
}

// Start launches the ping goroutine.
func (l *Loop) Start(s *session.Session, c *client.Client, q *events.Queue) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.running {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	l.cancel = cancel
	l.done = done
	l.running = true

	go l.run(ctx, s, c, q, done)
}

// Stop stops the ping goroutine and waits for it to finish.
func (l *Loop) Stop() {
	l.mu.Lock()
	if !l.running {
		l.mu.Unlock()
		return
	}
	cancel := l.cancel
	done := l.done
	l.running = false
	l.mu.Unlock()

	cancel()
	<-done
}

// IsRunning returns true if the ping loop is active.
func (l *Loop) IsRunning() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.running
}

func (l *Loop) run(ctx context.Context, s *session.Session, c *client.Client, q *events.Queue, done chan struct{}) {
	defer close(done)

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			evts, status, err := c.Ping(s)
			if err != nil {
				if status == 400 {
					// HTTP 400 — wait 3s then reconnect
					fmt.Fprintf(nil, "[ping] HTTP 400, reconnecting in 3s\n")
					select {
					case <-ctx.Done():
						return
					case <-time.After(3 * time.Second):
					}
					_ = c.Detach(s)
					time.Sleep(500 * time.Millisecond)
					_ = c.Attach(s)
				}
				continue
			}

			for _, ev := range evts {
				switch ev.Type {
				case client.EventCallStackFormed:
					stopEvent := events.StopEvent{
						TargetID: ev.TargetID,
						LineNo:   0,
					}
					if len(ev.CallStack) > 0 {
						stopEvent.LineNo = ev.CallStack[0].LineNo
						stopEvent.CallStack = ev.CallStack
					}
					q.EnqueueStop(stopEvent)

				case client.EventExprEvaluated:
					if ev.ExpressionResultID != "" && len(ev.EvalItems) > 0 {
						item := ev.EvalItems[0]
						result := events.EvalResult{
							TypeName: item.TypeName,
							Value:    client.DecodePresentation(item.Pres),
						}
						q.DeliverEval(ev.ExpressionResultID, result)
					}

				case client.EventTargetStarted:
					// Auto-attach new target and re-send breakpoints
					tid := xmlproto.TargetID{ID: ev.TargetID}
					_ = c.AttachDetachTargets(s, tid, true)
					if s.LastBreakpoints != nil {
						_ = c.SetBreakpoints(s, s.LastBreakpoints, nil)
					}
				}
			}
		}
	}
}
