# Trix Settings

A Wails v2 settings application for trix-daemon (ADR-032).

## Prerequisites

### Install Wails CLI

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

Verify installation:

```bash
wails doctor
```

### Platform Dependencies

**Linux:**
```bash
# Ubuntu/Debian
sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev

# Fedora
sudo dnf install gtk3-devel webkit2gtk4.0-devel

# Arch
sudo pacman -S gtk3 webkit2gtk
```

**macOS:**
- Xcode Command Line Tools: `xcode-select --install`

**Windows:**
- WebView2 Runtime (included in Windows 11, install for Windows 10)

## Project Setup

After installing Wails, initialize the project:

```bash
cd /home/robert/code/trix/trix-settings
wails init -n trix-settings -t svelte
```

Or use the existing structure:

```bash
wails dev    # Development with hot-reload
wails build  # Production build
```

## Architecture

```
trix-settings/
├── app.go                 # Go backend with IPC client
├── main.go                # Wails entry point
├── wails.json             # Wails configuration
├── frontend/
│   ├── src/
│   │   ├── App.svelte     # Main app component
│   │   ├── main.ts        # Svelte entry point
│   │   └── lib/
│   │       ├── api.ts     # TypeScript bindings for Go methods
│   │       └── components/
│   │           ├── General.svelte
│   │           ├── Notifications.svelte
│   │           ├── KeyboardShortcuts.svelte
│   │           ├── MemorySync.svelte
│   │           ├── Privacy.svelte
│   │           └── Advanced.svelte
│   └── wailsjs/           # Auto-generated Wails bindings
└── build/                 # Build artifacts
```

## IPC Communication

The settings app communicates with trix-daemon via Unix socket (Linux/macOS) or named pipe (Windows):

- Socket path: `~/.trix/daemon.sock`
- Protocol: JSON-RPC style messages
- Methods: `config.get`, `config.set`, `config.reload`

## Settings Categories

1. **General**: Startup behavior, language, update checking
2. **Notifications**: Enable/disable, sounds, do-not-disturb hours
3. **Keyboard Shortcuts**: Customizable hotkeys with conflict detection
4. **Memory & Sync**: Sync interval, batch size, offline mode
5. **Privacy**: API key management (keychain), cache clearing, telemetry
6. **Advanced**: HTTP/IPC server, watcher directories, debug mode

## Development

```bash
# Run in development mode
wails dev

# Build for production
wails build

# Build for specific platform
wails build -platform darwin/arm64
wails build -platform linux/amd64
wails build -platform windows/amd64
```

## Launch Pattern

The daemon spawns this settings window on demand:
- User clicks "Settings..." in tray menu
- Daemon executes: `trix-settings --daemon-socket=<path>`
- Settings window connects to daemon via IPC
- Changes trigger hot-reload via `config.reload` IPC method
