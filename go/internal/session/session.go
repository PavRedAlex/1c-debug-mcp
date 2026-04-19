package session

import (
	"errors"
	"sync"

	"github.com/1c-debug-mcp/go/internal/xmlproto"
	"github.com/google/uuid"
)

// Session holds the state of an active debug session.
type Session struct {
	ID              string
	URL             string
	Alias           string
	Password        string
	LastBreakpoints *xmlproto.BPWorkspace
}

// Manager manages the single active debug session.
type Manager struct {
	mu      sync.RWMutex
	session *Session
}

// New creates a new Manager.
func New() *Manager {
	return &Manager{}
}

// Create creates a new Session with a unique UUID v4 and stores it.
func (m *Manager) Create(url, alias, password string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := &Session{
		ID:       uuid.New().String(),
		URL:      url,
		Alias:    alias,
		Password: password,
	}
	m.session = s
	return s
}

// Get returns the current session or nil if none exists.
func (m *Manager) Get() *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.session
}

// Require returns the current session or an error if none exists.
func (m *Manager) Require() (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.session == nil {
		return nil, errors.New("No active debug session. Call 'attach' first.")
	}
	return m.session, nil
}

// Clear removes the current session.
func (m *Manager) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.session = nil
}

// SetLastBreakpoints stores the last used breakpoints in the current session.
func (m *Manager) SetLastBreakpoints(bp *xmlproto.BPWorkspace) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.session != nil {
		m.session.LastBreakpoints = bp
	}
}
