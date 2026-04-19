package ping

import (
	"context"
	"sync"
	"time"

	"github.com/1c-debug-mcp/go/internal/client"
	"github.com/1c-debug-mcp/go/internal/events"
	"github.com/1c-debug-mcp/go/internal/logger"
	"github.com/1c-debug-mcp/go/internal/session"
	"github.com/1c-debug-mcp/go/internal/xmlproto"
)

// Loop manages the ping goroutine that polls dbgs.exe for debug events.
type Loop struct {
	mu          sync.Mutex
	cancel      context.CancelFunc
	done        chan struct{}
	running     bool
	reattaching bool
}

// IsReattaching returns true if the ping loop is currently reconnecting.
func (l *Loop) IsReattaching() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.reattaching
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
					logger.Error("ping HTTP 400, reconnecting in 3s")
					l.mu.Lock()
					l.reattaching = true
					l.mu.Unlock()
					select {
					case <-ctx.Done():
						l.mu.Lock()
						l.reattaching = false
						l.mu.Unlock()
						return
					case <-time.After(3 * time.Second):
					}
					_ = c.Detach(s)
					time.Sleep(500 * time.Millisecond)
					if err := c.AttachWithRetry(s); err != nil {
						logger.Error("ping reconnect failed: %v", err)
					} else {
						_ = c.InitSettings(s, false)
						_ = c.SetAutoAttach(s, []string{"Client", "ManagedClient", "Server", "ServerEmulation", "JOB"})
						// Wait for clients to reconnect to dbgs.exe
						time.Sleep(2 * time.Second)
						if targets, terr := c.GetTargets(s); terr == nil && len(targets) > 0 {
							var tids []xmlproto.TargetID
							for _, t := range targets {
								tids = append(tids, t.TargetID)
							}
							_ = c.AttachDetachTargets(s, tids, true)
						}
						if s.LastBreakpoints != nil {
							_ = c.SetBreakpoints(s, s.LastBreakpoints, nil)
						}
						logger.Info("ping reconnected successfully")
					}
					l.mu.Lock()
					l.reattaching = false
					l.mu.Unlock()
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
					logger.Info("callStackFormed: target=%s line=%d", ev.TargetID, stopEvent.LineNo)
					q.EnqueueStop(stopEvent)

				case client.EventExprEvaluated:
					if ev.ExpressionResultID != "" && len(ev.EvalItems) > 0 {
						var evalItems []events.EvalItem
						for _, item := range ev.EvalItems {
							name := item.LocalVariableName
							if name == "" {
								name = item.Name
							}
							evalItems = append(evalItems, events.EvalItem{
								Name:     name,
								TypeName: item.TypeName,
								Value:    client.DecodePresentation(item.Pres),
							})
						}
						result := events.EvalResult{
							TypeName: ev.EvalItems[0].TypeName,
							Value:    client.DecodePresentation(ev.EvalItems[0].Pres),
							Items:    evalItems,
						}
						q.DeliverEval(ev.ExpressionResultID, result)
					}

				case client.EventTargetStarted:
					// Auto-attach new target
					logger.Info("targetStarted: %s — attaching", ev.TargetID)
					tid := xmlproto.TargetID{ID: ev.TargetID}
					_ = c.AttachDetachTargets(s, []xmlproto.TargetID{tid}, true)
					// Re-attach ALL known targets and re-send breakpoints globally
					if s.LastBreakpoints != nil {
						if targets, err := c.GetTargets(s); err == nil && len(targets) > 0 {
							var tids []xmlproto.TargetID
							for _, t := range targets {
								tids = append(tids, t.TargetID)
							}
							_ = c.AttachDetachTargets(s, tids, true)
						}
						_ = c.SetBreakpoints(s, s.LastBreakpoints, nil)
					}
				}
			}
		}
	}
}
