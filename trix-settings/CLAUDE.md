# Claude Instructions for trix-settings

Wails v2 settings application for trix-daemon (ADR-032).

## Project Overview

This is a cross-platform settings window built with:
- **Backend**: Go with Wails v2 bindings
- **Frontend**: Svelte + TypeScript
- **Communication**: IPC (Unix socket/named pipe) with trix-daemon

## Architecture

```
trix-settings/
├── main.go           # Wails entry point
├── app.go            # Go backend methods (exposed to frontend)
├── config.go         # Settings configuration types
├── ipc_client.go     # IPC client for daemon communication
└── frontend/
    └── src/
        ├── App.svelte              # Main app with sidebar navigation
        ├── main.ts                 # Svelte entry point
        └── lib/
            ├── api.ts              # TypeScript API bindings + stores
            └── components/         # Svelte components
                ├── General.svelte
                ├── Notifications.svelte
                ├── KeyboardShortcuts.svelte
                ├── MemorySync.svelte
                ├── Privacy.svelte
                └── Advanced.svelte
```

## Key Commands

```bash
# Development (requires wails CLI)
wails dev

# Build
wails build

# Platform-specific build
wails build -platform darwin/arm64
wails build -platform linux/amd64
wails build -platform windows/amd64
```

## Go Backend Methods

Methods in `app.go` exposed to frontend via Wails:

| Method | Description |
|--------|-------------|
| `GetConfig()` | Get daemon configuration |
| `SaveConfig(cfg)` | Save configuration changes |
| `GetConnectionStatus()` | Get daemon connection status |
| `Reconnect()` | Reconnect to daemon |
| `GetDaemonStatus()` | Get daemon health status |
| `ClearCache()` | Clear memory cache |
| `TriggerSync()` | Trigger immediate sync |
| `ValidateHotkey(hotkey)` | Validate hotkey for conflicts |

## Settings Categories

1. **General**: Startup, language, updates
2. **Notifications**: Desktop alerts, sounds, DND schedule
3. **Keyboard Shortcuts**: Global hotkeys with conflict detection
4. **Memory & Sync**: Sync interval, batch size, offline mode
5. **Privacy**: API key status, telemetry, cache management
6. **Advanced**: HTTP/IPC servers, file watcher, logging

## IPC Protocol

Communication with daemon via JSON-RPC style messages:

```json
// Request
{"method": "config.get", "params": {}, "id": "settings-123"}

// Response
{"result": {...}, "id": "settings-123"}
```

## Dependencies

**Go**: `github.com/wailsapp/wails/v2`

**Frontend**: See `frontend/package.json`
- Svelte 4
- TypeScript 5
- Vite 5

## Testing

```bash
# Frontend type checking
cd frontend && npm run check

# Go tests (when added)
go test ./...
```

## Common Issues

1. **Wails CLI not found**: Install with `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
2. **Daemon not running**: Start with `trixd` before launching settings
3. **Connection refused**: Check socket path matches daemon config
