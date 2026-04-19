package client

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/1c-debug-mcp/go/internal/events"
	"github.com/1c-debug-mcp/go/internal/session"
	"github.com/1c-debug-mcp/go/internal/xmlproto"
	"github.com/google/uuid"
)

// DebugTarget represents a connected 1C debug target (process).
type DebugTarget struct {
	TargetIDStr string
	TargetID    xmlproto.TargetID
	TargetType  string
	State       string
	StateNum    int
}

// DebugEventType represents the type of a debug event from ping.
type DebugEventType string

const (
	EventCallStackFormed DebugEventType = "callStackFormed"
	EventExprEvaluated   DebugEventType = "exprEvaluated"
	EventTargetStarted   DebugEventType = "targetStarted"
	EventTargetQuit      DebugEventType = "targetQuit"
)

// DebugEvent represents a parsed event from pingDebugUIParams.
type DebugEvent struct {
	Type               DebugEventType
	TargetID           string
	TargetIDStr        string
	CallStack          []xmlproto.StackFrame
	ExpressionResultID string
	EvalItems          []EvalItem
}

// EvalItem represents a single variable/expression result.
type EvalItem struct {
	Name     string
	TypeName string
	Pres     string // base64-encoded presentation
}

// Client is the HTTP client for the 1C debug server (dbgs.exe).
type Client struct {
	http *http.Client
}

// New creates a new Client.
func New() *Client {
	return &Client{
		http: &http.Client{Timeout: 30 * time.Second},
	}
}

// post sends a POST request to the debug server.
func (c *Client) post(url, cmd, xmlBody string) (string, int, error) {
	reqURL := fmt.Sprintf("%s/e1crdbg/rdbg?cmd=%s", url, cmd)
	req, err := http.NewRequest("POST", reqURL, strings.NewReader(xmlBody))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/xml; charset=utf-8")
	req.Header.Set("Accept", "application/xml")
	req.Header.Set("User-Agent", "1CV8")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", resp.StatusCode, err
	}
	return string(body), resp.StatusCode, nil
}

// Test verifies connectivity to the debug server.
func (c *Client) Test(url string) error {
	xmlBody := `<?xml version="1.0" encoding="UTF-8"?><request xmlns="http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse"></request>`
	_, status, err := c.post(url, "rdbgTest", xmlBody)
	if err != nil {
		return fmt.Errorf("debug server unreachable at %s: %w", url, err)
	}
	if status >= 500 {
		return fmt.Errorf("debug server error at %s: HTTP %d", url, status)
	}
	return nil
}

// Attach connects to the debug server and sets up the session.
func (c *Client) Attach(s *session.Session) error {
	xmlBody := xmlproto.BuildAttachXML(s.Alias, s.ID, s.Password)
	body, _, err := c.post(s.URL, "attachDebugUI", xmlBody)
	if err != nil {
		return err
	}

	result := xmlproto.ExtractResult(body)
	switch result {
	case "ibInDebug":
		return fmt.Errorf("ibInDebug")
	case "notRegistered":
		return fmt.Errorf("notRegistered — check infobaseAlias: %s", s.Alias)
	case "credentialsRequired", "fullCredentialsRequired":
		return fmt.Errorf("%s — password required", result)
	}
	return nil
}

// AttachWithRetry attaches with retry on ibInDebug (up to 5 attempts).
func (c *Client) AttachWithRetry(s *session.Session) error {
	for i := 0; i < 5; i++ {
		err := c.Attach(s)
		if err == nil {
			return nil
		}
		if err.Error() == "ibInDebug" {
			// Try to detach first, then retry
			_ = c.Detach(s)
			time.Sleep(1 * time.Second)
			continue
		}
		return err
	}
	return fmt.Errorf("ibInDebug — another debugger is connected, failed after 5 retries")
}

// Detach disconnects from the debug server.
func (c *Client) Detach(s *session.Session) error {
	xmlBody := xmlproto.BuildDetachXML(s.Alias, s.ID)
	_, _, err := c.post(s.URL, "detachDebugUI", xmlBody)
	return err
}

// InitSettings sends initial debug settings.
func (c *Client) InitSettings(s *session.Session, breakOnNextLine bool) error {
	xmlBody := xmlproto.BuildInitSettingsXML(s.Alias, s.ID, breakOnNextLine)
	_, _, err := c.post(s.URL, "initSettings", xmlBody)
	return err
}

// SetAutoAttach configures auto-attach for the given target types.
func (c *Client) SetAutoAttach(s *session.Session, targetTypes []string) error {
	xmlBody := xmlproto.BuildAutoAttachXML(s.Alias, s.ID, targetTypes)
	_, _, err := c.post(s.URL, "setAutoAttachSettings", xmlBody)
	return err
}

// Ping polls the debug server for events.
func (c *Client) Ping(s *session.Session) ([]DebugEvent, int, error) {
	xmlBody := xmlproto.BuildPingXML(s.ID)
	body, status, err := c.post(s.URL, "pingDebugUIParams", xmlBody)
	if err != nil {
		return nil, status, err
	}
	if status == 400 {
		return nil, status, fmt.Errorf("HTTP 400 from ping")
	}

	resp, err := xmlproto.ParsePingResponse(body)
	if err != nil {
		return nil, status, err
	}

	var events []DebugEvent
	for _, item := range resp.Items {
		ev := DebugEvent{
			TargetID: item.TargetID.ID,
		}
		switch item.CmdID {
		case "callStackFormed":
			ev.Type = EventCallStackFormed
			for _, f := range item.CallStack {
				ev.CallStack = append(ev.CallStack, xmlproto.StackFrame{
					ModuleID: xmlproto.ModuleID{
						Type:          f.ModuleID.Type,
						URL:           f.ModuleID.URL,
						ObjectID:      f.ModuleID.ObjectID,
						PropertyID:    f.ModuleID.PropertyID,
						ExtensionName: f.ModuleID.ExtensionName,
					},
					LineNo: f.LineNo,
				})
			}
		case "exprEvaluated":
			ev.Type = EventExprEvaluated
			if item.ExprResult != nil {
				ev.ExpressionResultID = item.ExprResult.ExpressionResultID
				for _, ei := range item.ExprResult.Items {
					ev.EvalItems = append(ev.EvalItems, EvalItem{
						Name:     ei.Name,
						TypeName: ei.TypeName,
						Pres:     ei.Pres,
					})
				}
			}
		case "targetStarted", "DBGUIExtCmdInfoStarted":
			ev.Type = EventTargetStarted
		case "targetQuit", "DBGUIExtCmdInfoQuit":
			ev.Type = EventTargetQuit
		}
		if ev.Type != "" {
			events = append(events, ev)
		}
	}
	return events, status, nil
}

// GetTargets returns the list of connected debug targets.
func (c *Client) GetTargets(s *session.Session) ([]DebugTarget, error) {
	xmlBody := xmlproto.BuildGetTargetsXML(s.Alias, s.ID)
	body, _, err := c.post(s.URL, "getDbgAllTargetStates", xmlBody)
	if err != nil {
		return nil, err
	}

	resp, err := xmlproto.ParseGetTargetsResponse(body)
	if err != nil {
		return nil, err
	}

	var targets []DebugTarget
	for _, item := range resp.Items {
		targets = append(targets, DebugTarget{
			TargetIDStr: item.TargetIDStr,
			TargetID: xmlproto.TargetID{
				ID: item.TargetID.ID,
			},
			TargetType: item.TargetID.TargetType,
			State:      item.State,
			StateNum:   item.StateNum,
		})
	}
	return targets, nil
}

// SetBreakpoints sets breakpoints in a BSL module.
func (c *Client) SetBreakpoints(s *session.Session, bp *xmlproto.BPWorkspace, targetID *xmlproto.TargetID) error {
	if targetID != nil {
		_ = c.ClearBreakOnNextStatement(s)
		_ = c.AttachDetachTargets(s, *targetID, true)
	}
	xmlBody := xmlproto.BuildSetBreakpointsXML(s.Alias, s.ID, bp)
	_, _, err := c.post(s.URL, "setBreakpoints", xmlBody)
	return err
}

// AttachDetachTargets attaches or detaches a specific debug target.
func (c *Client) AttachDetachTargets(s *session.Session, targetID xmlproto.TargetID, attach bool) error {
	xmlBody := xmlproto.BuildAttachDetachTargetsXML(s.Alias, s.ID, targetID, attach)
	_, _, err := c.post(s.URL, "attachDetachDbgTargets", xmlBody)
	return err
}

// ClearBreakOnNextStatement clears the break-on-next-statement flag.
func (c *Client) ClearBreakOnNextStatement(s *session.Session) error {
	xmlBody := xmlproto.BuildClearBreakOnNextStatementXML(s.Alias, s.ID)
	_, _, err := c.post(s.URL, "clearBreakOnNextStatement", xmlBody)
	return err
}

// Step sends a step command (continue, stepIn, stepOut, breakOnNextStatement).
func (c *Client) Step(s *session.Session, targetID xmlproto.TargetID, action string) error {
	xmlBody := xmlproto.BuildStepXML(s.Alias, s.ID, targetID, action)
	_, _, err := c.post(s.URL, "step", xmlBody)
	return err
}

// EvalLocalVariables retrieves local variables for a stopped target.
func (c *Client) EvalLocalVariables(s *session.Session, targetID xmlproto.TargetID, queue *events.Queue) ([]events.EvalResult, error) {
	resultID := uuid.New().String()
	ch := queue.RegisterEvalWaiter(resultID)

	xmlBody := xmlproto.BuildEvalLocalVariablesXML(s.Alias, s.ID, targetID, resultID)
	_, _, err := c.post(s.URL, "evalLocalVariables", xmlBody)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	select {
	case result := <-ch:
		return []events.EvalResult{result}, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("Timeout waiting for evalLocalVariables result")
	}
}

// EvalExpr evaluates a BSL expression in the context of a stopped target.
func (c *Client) EvalExpr(s *session.Session, targetID xmlproto.TargetID, expression string, queue *events.Queue) (*events.EvalResult, error) {
	resultID := uuid.New().String()
	ch := queue.RegisterEvalWaiter(resultID)

	xmlBody := xmlproto.BuildEvalExprXML(s.Alias, s.ID, targetID, expression, resultID)
	_, _, err := c.post(s.URL, "evalExpr", xmlBody)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	select {
	case result := <-ch:
		return &result, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("Timeout waiting for evalExpr result")
	}
}

// RawRequest sends an arbitrary XML request to the debug server.
func (c *Client) RawRequest(url, cmd, xmlBody, dbgui string) (string, int, error) {
	reqURL := fmt.Sprintf("%s/e1crdbg/rdbg?cmd=%s", url, cmd)
	if dbgui != "" {
		reqURL += "&dbgui=" + dbgui
	}
	req, err := http.NewRequest("POST", reqURL, strings.NewReader(xmlBody))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/xml; charset=utf-8")
	req.Header.Set("Accept", "application/xml")
	req.Header.Set("User-Agent", "1CV8")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body), resp.StatusCode, nil
}

// DecodePresentation decodes a base64-encoded presentation string.
func DecodePresentation(pres string) string {
	if pres == "" {
		return ""
	}
	b, err := base64.StdEncoding.DecodeString(pres)
	if err != nil {
		return pres
	}
	return string(b)
}
