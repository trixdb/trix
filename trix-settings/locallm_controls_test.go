// Tests for ADR-141 Local LLM runtime controls — kill switch,
// telemetry flag, diagnostics bundle decode, and NotImplemented
// detection. These cover the pure-logic paths that don't require a
// live daemon or Wails frontend.
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestIsNotImplementedErr(t *testing.T) {
	cases := []struct {
		in   error
		want bool
	}{
		{nil, false},
		{errors.New("unknown method: locallm.foo"), true},
		{errors.New("daemon error (code 404): method not found"), true},
		{errors.New("not implemented by daemon"), true},
		{errors.New("daemon returned: method not supported"), true},
		{errors.New("write: broken pipe"), false},
		{errors.New("connection refused"), false},
	}
	for _, c := range cases {
		if got := isNotImplementedErr(c.in); got != c.want {
			t.Errorf("isNotImplementedErr(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestTelemetryRoundtrip(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)

	app := &App{}
	// Default is OFF when file missing.
	state, err := app.GetTelemetryEnabled()
	if err != nil {
		t.Fatalf("GetTelemetryEnabled: %v", err)
	}
	if state.Enabled {
		t.Fatal("expected telemetry to default to OFF")
	}

	// Writing requires the daemon, so we bypass SetTelemetryEnabled
	// (which calls IPC) and instead exercise the persistence logic
	// by writing the file directly then re-reading.
	path, err := telemetryFilePath()
	if err != nil {
		t.Fatalf("telemetryFilePath: %v", err)
	}
	if filepath.Dir(path) != filepath.Join(dir, ".trix") {
		t.Fatalf("expected path under HOME/.trix, got %s", path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	data, _ := json.Marshal(TelemetryState{Enabled: true})
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}

	state, err = app.GetTelemetryEnabled()
	if err != nil {
		t.Fatalf("GetTelemetryEnabled after write: %v", err)
	}
	if !state.Enabled {
		t.Fatal("expected telemetry to read back as ON")
	}
}

func TestDecodeBundlePayload(t *testing.T) {
	// String payload — raw base64.
	raw := []byte("PK\x03\x04fakezip")
	b64 := base64.StdEncoding.EncodeToString(raw)
	got, err := decodeBundlePayload(b64)
	if err != nil {
		t.Fatalf("string decode: %v", err)
	}
	if string(got) != string(raw) {
		t.Fatalf("decode mismatch: got %q, want %q", got, raw)
	}

	// Map payload — bundle_b64 field.
	obj := map[string]interface{}{"bundle_b64": b64}
	got, err = decodeBundlePayload(obj)
	if err != nil {
		t.Fatalf("map decode: %v", err)
	}
	if string(got) != string(raw) {
		t.Fatalf("map decode mismatch")
	}

	// Unexpected shape.
	if _, err := decodeBundlePayload(42); err == nil {
		t.Fatal("expected error for integer payload")
	}
}

func TestLocalLLMInspectRefValidation(t *testing.T) {
	app := &App{}
	_, err := app.LocalLLMInspectRef("   ")
	if err == nil {
		t.Fatal("expected error for empty ref")
	}
	// We cannot verify the IPC path without a live daemon, but we
	// can ensure that with no client the correct sentinel surfaces.
	_, err = app.LocalLLMInspectRef("qwen2.5:3b")
	if err == nil {
		t.Fatal("expected error when no IPC client is attached")
	}
}

func TestLocalLLMGetKillSwitchDefault(t *testing.T) {
	// With no ipcClient attached, callIPC returns a plain error (not
	// a NotImplemented). Ensure GetKillSwitch surfaces that rather
	// than silently defaulting — default is only for the "not
	// implemented by daemon" path.
	app := &App{}
	_, err := app.LocalLLMGetKillSwitch()
	if err == nil {
		t.Fatal("expected error when daemon is unreachable")
	}
}
