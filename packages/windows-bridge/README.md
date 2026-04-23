# Windows Bridge

Phase 1 supports media audio foundation only. Phone call audio is not included.

## Purpose

The Windows bridge is a separate C# process that owns Bluetooth media-audio discovery and connection control. Electron main talks to it over newline-delimited JSON on standard input and standard output.

## IPC shape

- Requests from Electron main -> `{ id, type, payload }`
- Responses from bridge -> `{ requestId, ok, payload?, error? }`
- Events from bridge -> `{ type, payload }`

Machine-readable JSON is emitted on stdout only. Human-readable logs are written to stderr only.

## Responsibilities

- Enumerate eligible remote audio devices with the real `AudioPlaybackConnection.GetDeviceSelector()` API path.
- Keep a single watcher alive and emit `devices.updated` on changes.
- Enable, open, observe, and release `AudioPlaybackConnection` instances.
- Translate native states into the public `Disconnected`, `Ready`, `Connecting`, `Connected`, and `Failed` states.
- Observe the current Windows media session for track metadata and remote transport control when the Bluetooth stack exposes one.
- Emit structured diagnostics and user-facing failures without fabricating success.
- Expose truthful communication-readiness data for media audio, call-audio gating, bridge health, and current limitation.

## AVRCP metadata and transport truth

- `AudioPlaybackConnection` itself does not expose AVRCP metadata or transport buttons.
- This bridge therefore uses `GlobalSystemMediaTransportControlsSessionManager` as the best built-in Windows path for track metadata and remote commands.
- Metadata and controls are only available when Windows exposes the connected phone as the current media session.
- If another media app becomes the current Windows session, transport commands follow that session instead.
- The app must therefore present metadata and controls as Windows-current-session features, not as guaranteed per-device AVRCP ownership.

## Volume sync truth

- `AudioPlaybackConnection` is the real media-routing API used by this bridge, but it does not expose remote-volume callbacks, AVRCP absolute-volume hooks, or a connection-level gain control.
- The bridge therefore treats Android-to-Windows volume sync as unverified and device-dependent on this path.
- The product preserves the current Windows output volume and does not fake synchronized volume control.
- The bridge also avoids automatic loudness classification for now because that would require a separate Core Audio observation path and endpoint/session correlation outside `AudioPlaybackConnection`.

## Build

```bash
dotnet build packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge/PhoneToPcSpeaker.WindowsBridge.csproj
```

If the desktop app cannot find the built bridge binary, Electron emits `bridge binary not found — run dotnet build` and stays alive.
