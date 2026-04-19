package events

import (
	"context"
	"errors"
	"sync"

	"github.com/1c-debug-mcp/go/internal/xmlproto"
)

// StopEvent represents a debugger stop event (breakpoint hit or step).
type StopEvent struct {
	TargetID   string
	ModuleName string
	LineNo     int
	CallStack  []xmlproto.StackFrame
}

// EvalResult represents the result of a BSL expression evaluation.
type EvalResult struct {
	TypeName string
	Value    string
	Items    []EvalItem // populated for evalLocalVariables (multiple variables)
}

// EvalItem represents a single variable in an evalLocalVariables result.
type EvalItem struct {
	Name     string
	TypeName string
	Value    string
}

// Queue manages stop events and eval result delivery between PingLoop and tools.
type Queue struct {
	mu            sync.Mutex
	pendingStop   *StopEvent
	lastCallStack *StopEvent // last stop event, never cleared — for get_call_stack
	stopCh        chan StopEvent
	evalWaiters   map[string]chan EvalResult
}

// New creates a new Queue.
func New() *Queue {
	return &Queue{
		stopCh:      make(chan StopEvent, 1),
		evalWaiters: make(map[string]chan EvalResult),
	}
}

// EnqueueStop stores a stop event. If the channel is full, replaces the existing event.
func (q *Queue) EnqueueStop(e StopEvent) {
	q.mu.Lock()
	q.pendingStop = &e
	q.lastCallStack = &e
	q.mu.Unlock()

	// Non-blocking send — drain first if full
	select {
	case q.stopCh <- e:
	default:
		select {
		case <-q.stopCh:
		default:
		}
		q.stopCh <- e
	}
}

// WaitForStop waits for a stop event or context cancellation.
// Returns immediately if a pending stop event already exists.
func (q *Queue) WaitForStop(ctx context.Context) (*StopEvent, error) {
	// Check for already-pending stop
	q.mu.Lock()
	if q.pendingStop != nil {
		e := *q.pendingStop
		q.pendingStop = nil
		q.mu.Unlock()
		return &e, nil
	}
	q.mu.Unlock()

	select {
	case e := <-q.stopCh:
		q.mu.Lock()
		q.pendingStop = nil
		q.mu.Unlock()
		return &e, nil
	case <-ctx.Done():
		return nil, errors.New("Timeout waiting for stop event")
	}
}

// GetLastCallStack returns the last stop event without consuming it.
// Unlike WaitForStop, this is never cleared — always returns the most recent stop.
func (q *Queue) GetLastCallStack() *StopEvent {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.lastCallStack
}

// ClearPendingStop removes any pending stop event.
func (q *Queue) ClearPendingStop() {
	q.mu.Lock()
	q.pendingStop = nil
	q.mu.Unlock()
	// Drain channel
	select {
	case <-q.stopCh:
	default:
	}
}

// RegisterEvalWaiter registers a channel to receive an eval result for the given resultID.
func (q *Queue) RegisterEvalWaiter(resultID string) chan EvalResult {
	ch := make(chan EvalResult, 1)
	q.mu.Lock()
	q.evalWaiters[resultID] = ch
	q.mu.Unlock()
	return ch
}

// DeliverEval delivers an eval result to the waiter registered for resultID.
func (q *Queue) DeliverEval(resultID string, result EvalResult) {
	q.mu.Lock()
	ch, ok := q.evalWaiters[resultID]
	if ok {
		delete(q.evalWaiters, resultID)
	}
	q.mu.Unlock()
	if ok {
		select {
		case ch <- result:
		default:
		}
	}
}
