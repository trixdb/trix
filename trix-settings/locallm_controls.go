// Package main: local-LLM runtime controls (ADR-141) exposed to the
// Wails frontend. Delegates to the daemon over IPC. If the daemon has
// not yet implemented a given method, the frontend receives a
// structured "not implemented" error so it can degrade gracefully.
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ErrNotImplemented is returned when the daemon does not yet support a
// requested method. Frontend code should treat this as a soft failure.
var ErrNotImplemented = errors.New("not implemented by daemon")

// isNotImplementedErr detects daemon responses indicating the method
// is unknown. The daemon typically returns "unknown method" or
// "method not found" strings; we match broadly.
func isNotImplementedErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unknown method") ||
		strings.Contains(msg, "method not found") ||
		strings.Contains(msg, "not implemented") ||
		strings.Contains(msg, "method not supported")
}

// KillSwitchState is returned to the frontend with the current value.
type KillSwitchState struct {
	Enabled bool   `json:"enabled"`
	Source  string `json:"source,omitempty"`
}

// LocalLLMGetKillSwitch reads the daemon's "allow remote inference"
// flag. When the method is not implemented, we return the local
// cached value (default: true, i.e. remote inference allowed) so the
// UI remains usable.
func (a *App) LocalLLMGetKillSwitch() (*KillSwitchState, error) {
	result, err := a.callIPC("locallm.get-kill-switch", nil)
	if err != nil {
		if isNotImplementedErr(err) {
			return &KillSwitchState{Enabled: true, Source: "default"}, nil
		}
		return nil, fmt.Errorf("failed to read kill switch: %w", err)
	}

	// Daemon may return bool directly, or an object with enabled.
	switch v := result.(type) {
	case bool:
		return &KillSwitchState{Enabled: v, Source: "daemon"}, nil
	case map[string]interface{}:
		enabled, _ := v["enabled"].(bool)
		return &KillSwitchState{Enabled: enabled, Source: "daemon"}, nil
	}
	return &KillSwitchState{Enabled: true, Source: "default"}, nil
}

// LocalLLMSetKillSwitch toggles the "allow remote inference" flag on
// the daemon. When OFF, the daemon must refuse incoming WS inference
// command frames with error code remote_inference_disabled.
func (a *App) LocalLLMSetKillSwitch(enabled bool) error {
	_, err := a.callIPC("locallm.set-kill-switch", map[string]interface{}{
		"enabled": enabled,
	})
	if err != nil {
		if isNotImplementedErr(err) {
			return ErrNotImplemented
		}
		return fmt.Errorf("failed to set kill switch: %w", err)
	}
	return nil
}

// LocalLLMInspectRef performs a dry-run inspection of an arbitrary
// ollama ref (e.g. user/model:tag) via the daemon. This is Step 1 of
// the Custom tab flow; the user must confirm before anything runs.
// Returns the raw daemon result (expected shape: Modelfile summary +
// size + license + security verdict). A missing daemon method yields
// ErrNotImplemented so the UI can show "not yet available".
func (a *App) LocalLLMInspectRef(ref string) (interface{}, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, fmt.Errorf("ref is required")
	}
	result, err := a.callIPC("locallm.inspect-ref", map[string]interface{}{
		"ref": ref,
	})
	if err != nil {
		if isNotImplementedErr(err) {
			return nil, ErrNotImplemented
		}
		return nil, fmt.Errorf("failed to inspect ref: %w", err)
	}
	return result, nil
}

// TelemetryState is returned to the frontend for the privacy toggle.
type TelemetryState struct {
	Enabled bool `json:"enabled"`
}

// telemetryFilePath returns the path where opt-in telemetry flag is
// stored on disk alongside the daemon config.
func telemetryFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".trix", "telemetry.json"), nil
}

// GetTelemetryEnabled reads the local opt-in telemetry flag. Default
// is OFF per ADR-141 privacy stance.
func (a *App) GetTelemetryEnabled() (*TelemetryState, error) {
	path, err := telemetryFilePath()
	if err != nil {
		return &TelemetryState{Enabled: false}, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return &TelemetryState{Enabled: false}, nil
	}
	var s TelemetryState
	if err := json.Unmarshal(data, &s); err != nil {
		return &TelemetryState{Enabled: false}, nil
	}
	return &s, nil
}

// SetTelemetryEnabled persists the opt-in telemetry flag to disk and
// notifies the daemon so it can start/stop emission. Daemon-side
// failures are non-fatal — the local flag still persists.
func (a *App) SetTelemetryEnabled(enabled bool) error {
	path, err := telemetryFilePath()
	if err != nil {
		return fmt.Errorf("cannot locate telemetry config path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("cannot create config dir: %w", err)
	}
	data, err := json.Marshal(TelemetryState{Enabled: enabled})
	if err != nil {
		return fmt.Errorf("cannot marshal telemetry state: %w", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("cannot write telemetry config: %w", err)
	}
	// Best-effort notify daemon; ignore ErrNotImplemented.
	_, err = a.callIPC("telemetry.set-enabled", map[string]interface{}{
		"enabled": enabled,
	})
	if err != nil && !isNotImplementedErr(err) {
		// Daemon reachable but refused — surface for visibility.
		return fmt.Errorf("saved locally but daemon rejected: %w", err)
	}
	return nil
}

// DiagnosticsBundle is the shape returned from diagnostics.export.
type DiagnosticsBundle struct {
	SavedPath   string `json:"savedPath,omitempty"`
	SizeBytes   int    `json:"sizeBytes"`
	GeneratedAt string `json:"generatedAt"`
	Cancelled   bool   `json:"cancelled,omitempty"`
}

// DiagnosticsExport asks the daemon to collect a diagnostic bundle
// (logs with prompts redacted, capability report, installed models,
// recent error codes) and then prompts the user via SaveFileDialog
// to choose a destination zip path.
func (a *App) DiagnosticsExport() (*DiagnosticsBundle, error) {
	result, err := a.callIPC("diagnostics.export", nil)
	if err != nil {
		if isNotImplementedErr(err) {
			return nil, ErrNotImplemented
		}
		return nil, fmt.Errorf("daemon failed to build bundle: %w", err)
	}

	payload, err := decodeBundlePayload(result)
	if err != nil {
		return nil, err
	}

	defaultName := fmt.Sprintf("trix-diagnostics-%s.zip",
		time.Now().UTC().Format("20060102-150405"))

	target, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Trix diagnostics bundle",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip archive (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("save dialog failed: %w", err)
	}
	if target == "" {
		return &DiagnosticsBundle{
			Cancelled:   true,
			GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	if err := os.WriteFile(target, payload, 0o600); err != nil {
		return nil, fmt.Errorf("failed to write bundle: %w", err)
	}

	return &DiagnosticsBundle{
		SavedPath:   target,
		SizeBytes:   len(payload),
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// decodeBundlePayload extracts the zip byte payload from a daemon
// response. The daemon returns either a raw base64 string or an
// object with a "bundle_b64" field; we accept both shapes.
func decodeBundlePayload(result interface{}) ([]byte, error) {
	switch v := result.(type) {
	case string:
		return base64.StdEncoding.DecodeString(v)
	case map[string]interface{}:
		if raw, ok := v["bundle_b64"].(string); ok {
			return base64.StdEncoding.DecodeString(raw)
		}
	}
	return nil, fmt.Errorf("unexpected diagnostics.export payload shape")
}
