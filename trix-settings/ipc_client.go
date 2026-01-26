// Package main provides IPC client for daemon communication.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

// IPCClient communicates with trix-daemon via Unix socket.
type IPCClient struct {
	conn       net.Conn
	reader     *bufio.Reader
	mu         sync.Mutex
	closed     bool
	socketPath string
	reqCounter uint64
}

// IPCRequest represents a request to the daemon.
type IPCRequest struct {
	Method string                 `json:"method"`
	Params map[string]interface{} `json:"params,omitempty"`
	ID     string                 `json:"id"`
}

// IPCResponse represents a response from the daemon.
type IPCResponse struct {
	Result interface{} `json:"result,omitempty"`
	Error  string      `json:"error,omitempty"`
	Code   int         `json:"code,omitempty"`
	ID     string      `json:"id"`
}

// NewIPCClient creates a new IPC client connected to the daemon.
func NewIPCClient(socketPath string) (*IPCClient, error) {
	conn, err := net.DialTimeout("unix", socketPath, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to daemon: %w", err)
	}

	return &IPCClient{
		conn:       conn,
		reader:     bufio.NewReader(conn),
		socketPath: socketPath,
	}, nil
}

// Close closes the IPC connection.
func (c *IPCClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return nil
	}
	c.closed = true
	return c.conn.Close()
}

// Call sends a request to the daemon and waits for a response.
func (c *IPCClient) Call(method string, params map[string]interface{}) (*IPCResponse, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return nil, fmt.Errorf("client is closed")
	}

	// Generate unique request ID
	reqID := atomic.AddUint64(&c.reqCounter, 1)
	req := &IPCRequest{
		Method: method,
		Params: params,
		ID:     fmt.Sprintf("settings-%d-%d", time.Now().UnixNano(), reqID),
	}

	// Set write deadline
	if err := c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return nil, fmt.Errorf("failed to set write deadline: %w", err)
	}

	// Send request
	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	if _, err := c.conn.Write(append(data, '\n')); err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	// Set read deadline
	if err := c.conn.SetReadDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return nil, fmt.Errorf("failed to set read deadline: %w", err)
	}

	// Read response
	line, err := c.reader.ReadBytes('\n')
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var resp IPCResponse
	if err := json.Unmarshal(line, &resp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if resp.Error != "" {
		return nil, fmt.Errorf("daemon error (code %d): %s", resp.Code, resp.Error)
	}

	return &resp, nil
}

// Ping checks if the daemon is responsive.
func (c *IPCClient) Ping() error {
	resp, err := c.Call("ping", nil)
	if err != nil {
		return err
	}

	result, ok := resp.Result.(string)
	if !ok || result != "pong" {
		return fmt.Errorf("unexpected ping response: %v", resp.Result)
	}

	return nil
}

// IsConnected returns true if the client is connected and responsive.
func (c *IPCClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return !c.closed
}
