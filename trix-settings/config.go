// Package main provides configuration types for the settings UI.
package main

// SettingsConfig represents the daemon configuration for the settings UI.
// Maps to trix-daemon config structure from ADR-032.
type SettingsConfig struct {
	General       GeneralSettings       `json:"general"`
	Notifications NotificationSettings  `json:"notifications"`
	Hotkeys       HotkeySettings        `json:"hotkeys"`
	MemorySync    MemorySyncSettings    `json:"memorySync"`
	Privacy       PrivacySettings       `json:"privacy"`
	Advanced      AdvancedSettings      `json:"advanced"`
}

// GeneralSettings contains startup and general preferences.
type GeneralSettings struct {
	LaunchAtStartup bool   `json:"launchAtStartup"`
	Language        string `json:"language"`
	CheckForUpdates bool   `json:"checkForUpdates"`
	UpdateChannel   string `json:"updateChannel"` // stable, beta
}

// NotificationSettings controls desktop notifications.
type NotificationSettings struct {
	Enabled           bool   `json:"enabled"`
	SoundEnabled      bool   `json:"soundEnabled"`
	SoundFile         string `json:"soundFile,omitempty"`
	DoNotDisturbStart string `json:"doNotDisturbStart,omitempty"` // HH:MM format
	DoNotDisturbEnd   string `json:"doNotDisturbEnd,omitempty"`   // HH:MM format
	ShowSyncComplete  bool   `json:"showSyncComplete"`
	ShowErrors        bool   `json:"showErrors"`
}

// HotkeySettings configures global keyboard shortcuts.
type HotkeySettings struct {
	QuickCapture   string `json:"quickCapture"`   // e.g., "Ctrl+Alt+M"
	SearchMemories string `json:"searchMemories"` // e.g., "Ctrl+Alt+S"
	OpenTrayMenu   string `json:"openTrayMenu"`   // e.g., "Ctrl+Alt+T"
	TogglePause    string `json:"togglePause"`    // e.g., "Ctrl+Alt+P"
	QuickPanel     string `json:"quickPanel"`     // e.g., "Ctrl+Space"
	AIChat         string `json:"aiChat"`         // e.g., "Ctrl+Alt+A"
}

// MemorySyncSettings controls synchronization behavior.
type MemorySyncSettings struct {
	SyncEnabled      bool `json:"syncEnabled"`
	SyncIntervalSecs int  `json:"syncIntervalSecs"`
	BatchSize        int  `json:"batchSize"`
	RetryAttempts    int  `json:"retryAttempts"`
	OfflineMode      bool `json:"offlineMode"`
}

// PrivacySettings manages privacy and security options.
type PrivacySettings struct {
	// API credentials are stored in system keychain, not in config
	APIKeyConfigured   bool `json:"apiKeyConfigured"`
	TelemetryEnabled   bool `json:"telemetryEnabled"`
	ClearCacheOnQuit   bool `json:"clearCacheOnQuit"`
	PrivacyModeEnabled bool `json:"privacyModeEnabled"` // Hide content in recent memories
}

// AdvancedSettings provides access to low-level configuration.
type AdvancedSettings struct {
	HTTP    HTTPSettings    `json:"http"`
	IPC     IPCSettings     `json:"ipc"`
	Watcher WatcherSettings `json:"watcher"`
	Log     LogSettings     `json:"log"`
	Debug   DebugSettings   `json:"debug"`
}

// HTTPSettings configures the HTTP server.
type HTTPSettings struct {
	Enabled     bool   `json:"enabled"`
	Address     string `json:"address"`
	EnablePprof bool   `json:"enablePprof"`
}

// IPCSettings configures IPC communication.
type IPCSettings struct {
	Enabled    bool   `json:"enabled"`
	SocketPath string `json:"socketPath"`
}

// WatcherSettings configures file watching.
type WatcherSettings struct {
	Enabled          bool     `json:"enabled"`
	Directories      []string `json:"directories"`
	Patterns         []string `json:"patterns"`
	IgnorePatterns   []string `json:"ignorePatterns"`
	MaxFileSizeMB    int      `json:"maxFileSizeMB"`
	CheckIgnoreFiles bool     `json:"checkIgnoreFiles"`
}

// LogSettings configures logging.
type LogSettings struct {
	Level string `json:"level"` // debug, info, warn, error
	File  string `json:"file"`
	JSON  bool   `json:"json"`
}

// DebugSettings provides debug options.
type DebugSettings struct {
	Enabled        bool `json:"enabled"`
	VerboseLogging bool `json:"verboseLogging"`
	ProfileMemory  bool `json:"profileMemory"`
}

// DefaultSettings returns a SettingsConfig with sensible defaults.
func DefaultSettings() *SettingsConfig {
	return &SettingsConfig{
		General: GeneralSettings{
			LaunchAtStartup: true,
			Language:        "en",
			CheckForUpdates: true,
			UpdateChannel:   "stable",
		},
		Notifications: NotificationSettings{
			Enabled:          true,
			SoundEnabled:     false,
			ShowSyncComplete: false,
			ShowErrors:       true,
		},
		Hotkeys: HotkeySettings{
			QuickCapture:   "Ctrl+Alt+M",
			SearchMemories: "Ctrl+Alt+S",
			OpenTrayMenu:   "Ctrl+Alt+T",
			TogglePause:    "Ctrl+Alt+P",
			QuickPanel:     "",
			AIChat:         "",
		},
		MemorySync: MemorySyncSettings{
			SyncEnabled:      true,
			SyncIntervalSecs: 30,
			BatchSize:        100,
			RetryAttempts:    3,
			OfflineMode:      false,
		},
		Privacy: PrivacySettings{
			APIKeyConfigured:   false,
			TelemetryEnabled:   false,
			ClearCacheOnQuit:   false,
			PrivacyModeEnabled: false,
		},
		Advanced: AdvancedSettings{
			HTTP: HTTPSettings{
				Enabled: true,
				Address: "127.0.0.1:9090",
			},
			IPC: IPCSettings{
				Enabled: true,
			},
			Watcher: WatcherSettings{
				Enabled:       false,
				Patterns:      []string{"*.md", "*.txt"},
				MaxFileSizeMB: 50,
			},
			Log: LogSettings{
				Level: "info",
				JSON:  true,
			},
			Debug: DebugSettings{
				Enabled: false,
			},
		},
	}
}
