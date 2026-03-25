// Package main provides the Wails application backend.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
)

// ConnectionStatus represents the daemon connection state.
type ConnectionStatus string

const (
	StatusConnected    ConnectionStatus = "connected"
	StatusDisconnected ConnectionStatus = "disconnected"
	StatusConnecting   ConnectionStatus = "connecting"
	StatusError        ConnectionStatus = "error"
)

// App struct holds the application state.
type App struct {
	ctx         context.Context
	socketPath  string
	ipcClient   *IPCClient
	mu          sync.RWMutex
	status      ConnectionStatus
	lastError   string
	connectDone chan struct{}
}

// NewApp creates a new App instance.
func NewApp(socketPath string) (*App, error) {
	if socketPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("cannot determine home directory: %w", err)
		}
		socketPath = filepath.Join(home, ".trix", "daemon.sock")
	}
	return &App{
		socketPath: socketPath,
		status:     StatusDisconnected,
	}, nil
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.connectDone = make(chan struct{})
	go a.connectToDaemon()
}

// shutdown is called when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.ipcClient != nil {
		a.ipcClient.Close()
		a.ipcClient = nil
	}
}

// connectToDaemon establishes connection to the daemon.
// Signals completion via a.connectDone when finished.
func (a *App) connectToDaemon() {
	defer close(a.connectDone)

	a.mu.Lock()
	a.status = StatusConnecting
	a.mu.Unlock()

	client, err := NewIPCClient(a.socketPath)
	if err != nil {
		a.mu.Lock()
		a.status = StatusError
		a.lastError = err.Error()
		a.mu.Unlock()
		return
	}

	a.mu.Lock()
	a.ipcClient = client
	a.status = StatusConnected
	a.lastError = ""
	a.mu.Unlock()
}

// GetConnectionStatus returns the current daemon connection status.
func (a *App) GetConnectionStatus() ConnectionStatusInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return ConnectionStatusInfo{
		Status:     string(a.status),
		Error:      a.lastError,
		SocketPath: a.socketPath,
	}
}

// ConnectionStatusInfo provides connection details to the frontend.
type ConnectionStatusInfo struct {
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
	SocketPath string `json:"socketPath"`
}

// Reconnect attempts to reconnect to the daemon.
func (a *App) Reconnect() ConnectionStatusInfo {
	a.mu.Lock()
	if a.ipcClient != nil {
		a.ipcClient.Close()
		a.ipcClient = nil
	}
	a.mu.Unlock()

	a.connectDone = make(chan struct{})
	go a.connectToDaemon()
	<-a.connectDone

	return a.GetConnectionStatus()
}

// GetConfig retrieves the current daemon configuration.
func (a *App) GetConfig() (*SettingsConfig, error) {
	a.mu.RLock()
	client := a.ipcClient
	a.mu.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("not connected to daemon")
	}

	resp, err := client.Call("config.get", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get config: %w", err)
	}

	// Parse the response into SettingsConfig
	data, err := json.Marshal(resp.Result)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal config: %w", err)
	}

	var cfg SettingsConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	return &cfg, nil
}

// SaveConfig saves configuration changes to the daemon.
func (a *App) SaveConfig(cfg *SettingsConfig) error {
	a.mu.RLock()
	client := a.ipcClient
	a.mu.RUnlock()

	if client == nil {
		return fmt.Errorf("not connected to daemon")
	}

	// Convert config to map for IPC
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	var params map[string]interface{}
	if err := json.Unmarshal(data, &params); err != nil {
		return fmt.Errorf("failed to prepare config: %w", err)
	}

	_, err = client.Call("config.set", params)
	if err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	// Trigger config reload
	_, err = client.Call("config.reload", nil)
	if err != nil {
		return fmt.Errorf("config saved but reload failed: %w", err)
	}

	return nil
}

// ReloadConfig triggers a config reload on the daemon.
func (a *App) ReloadConfig() error {
	a.mu.RLock()
	client := a.ipcClient
	a.mu.RUnlock()

	if client == nil {
		return fmt.Errorf("not connected to daemon")
	}

	_, err := client.Call("config.reload", nil)
	return err
}

// GetDaemonStatus retrieves the daemon's current status.
func (a *App) GetDaemonStatus() (*DaemonStatus, error) {
	a.mu.RLock()
	client := a.ipcClient
	a.mu.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("not connected to daemon")
	}

	resp, err := client.Call("status", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get status: %w", err)
	}

	data, err := json.Marshal(resp.Result)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal status: %w", err)
	}

	var status DaemonStatus
	if err := json.Unmarshal(data, &status); err != nil {
		return nil, fmt.Errorf("failed to unmarshal status: %w", err)
	}

	return &status, nil
}

// ClearCache clears the daemon's memory cache.
func (a *App) ClearCache() error {
	a.mu.RLock()
	client := a.ipcClient
	a.mu.RUnlock()

	if client == nil {
		return fmt.Errorf("not connected to daemon")
	}

	_, err := client.Call("cache.clear", nil)
	return err
}

// TriggerSync triggers an immediate sync with the API.
func (a *App) TriggerSync() error {
	a.mu.RLock()
	client := a.ipcClient
	a.mu.RUnlock()

	if client == nil {
		return fmt.Errorf("not connected to daemon")
	}

	_, err := client.Call("sync", nil)
	return err
}

// hotkeyPattern matches formats like "Ctrl+X", "Ctrl+Alt+Space", "Super+Shift+F1".
// Requires at least one modifier (Ctrl, Alt, Shift, Super, Cmd, Meta) followed by a key.
var hotkeyPattern = regexp.MustCompile(
	`^(Ctrl|Alt|Shift|Super|Cmd|Meta)(\+(Ctrl|Alt|Shift|Super|Cmd|Meta))*\+[A-Za-z0-9F][A-Za-z0-9]*$`,
)

// ValidateHotkey checks if a hotkey combination is available.
func (a *App) ValidateHotkey(hotkey string) HotkeyValidation {
	// TODO: Implement actual conflict detection via daemon
	if hotkey == "" {
		return HotkeyValidation{
			Valid:   false,
			Message: "Hotkey cannot be empty",
		}
	}
	if !hotkeyPattern.MatchString(hotkey) {
		return HotkeyValidation{
			Valid:   false,
			Message: "Invalid format: use Modifier+Key (e.g. Ctrl+Alt+Space)",
		}
	}
	return HotkeyValidation{
		Valid:   true,
		Message: "Hotkey is available",
	}
}

// HotkeyValidation result from hotkey validation.
type HotkeyValidation struct {
	Valid    bool   `json:"valid"`
	Message  string `json:"message"`
	Conflict string `json:"conflict,omitempty"`
}

// DaemonStatus represents the daemon's current state.
type DaemonStatus struct {
	Version      string `json:"version"`
	Uptime       int64  `json:"uptime"`
	State        string `json:"state"`
	APIStatus    string `json:"apiStatus"`
	CacheEntries int    `json:"cacheEntries"`
	LastSync     string `json:"lastSync,omitempty"`
	Healthy      bool   `json:"healthy"`
}
