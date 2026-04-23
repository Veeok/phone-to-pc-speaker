# Android Call Audio Kill Test

Disposable Android probe for one question only: can stock Android playback capture grab remote call-like audio from third-party apps on this device?

## Scope

- MediaProjection-based playback capture only
- Foreground service only while recording
- Local WAV output only
- No forwarding to PC yet
- No polished UX, no retry logic, no background hardening

## Scenario Order

1. Positive-control media playback
2. Discord voice call
3. WhatsApp audio call
4. One generic VoIP app
5. Carrier/system call negative control

## Build

```powershell
pwsh ./build.ps1
```

If `pwsh` is not installed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

## Install

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

## Probe Flow

1. Open the app.
2. Grant `RECORD_AUDIO`.
3. Tap `Grant Capture` and approve MediaProjection.
4. Start the target scenario on the phone.
5. Tap `Start Recording`.
6. Let it run long enough to contain clear target audio.
7. Tap `Stop Recording`.
8. Inspect the saved WAV file shown in the app.

On Android 14+, expect to grant MediaProjection again for each new recording session.

## Output

The app writes WAV files under the app-specific music directory when available, otherwise internal app storage.
