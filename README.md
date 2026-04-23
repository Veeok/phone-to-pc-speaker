# Phone To pc speaker

Windows Electron + .NET desktop app for routing supported phone media audio to a PC with honest diagnostics and explicit capability reporting.

## Status

- Media audio foundation is implemented.
- Phone call audio is not a shipped feature in this repository.
- The UI is intentionally explicit about that limitation.

## What It Does

`Phone To pc speaker` discovers eligible remote media-audio devices, lets you select a phone, enables and opens the Windows media-audio path, releases the connection cleanly, and surfaces structured diagnostics and communication readiness.

## Tech Stack

- Electron
- React + Vite + TypeScript
- .NET 8 C# bridge for Windows Bluetooth/media-audio work
- `pnpm` workspace with shared TypeScript contracts

## Repository Layout

- `apps/desktop` - Electron desktop app
- `packages/shared-types` - shared IPC contracts and app models
- `packages/windows-bridge` - native Windows bridge process
- `docs` - architecture notes, plans, and manual validation docs
- `scripts` - runtime smoke tooling

## Getting Started

Requirements:

- Windows
- Node.js
- `pnpm`
- .NET SDK

Install and run:

```bash
pnpm install
pnpm bridge:build
pnpm dev
```

Useful commands:

```bash
pnpm start
pnpm build
pnpm typecheck
pnpm lint
```

Direct bridge build:

```bash
dotnet build packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge/PhoneToPcSpeaker.WindowsBridge.csproj
```

## Architecture Notes

- `apps/desktop/src/main` owns Electron IPC, bridge lifecycle, diagnostics buffering, bridge-health handling, and capability-state propagation.
- `apps/desktop/src/preload` exposes only `window.phoneToPcSpeaker`.
- `apps/desktop/src/renderer` contains the React renderer UI.
- Native Bluetooth and media-audio operations stay in the separate C# bridge process.

## Runtime Notes

- Windows is required for the native media-audio path.
- If the bridge binary is missing, the app stays alive and reports `bridge binary not found — run dotnet build`.
- The bridge attempts the real Windows API path and reports honest failures.
- The app never fabricates a `Connected` state or fake call-audio support.

## Volume Sync Truth

- The app uses `Windows.Media.Audio.AudioPlaybackConnection` for discovery and media-audio routing.
- That API exposes connection lifecycle and state only. It does not expose remote-volume events, AVRCP absolute-volume callbacks, or connection-level gain control.
- Because of that, the app does not claim true Android-to-Windows volume synchronization.

## Additional Docs

- Docs index: `docs/README.md`
- Manual checklist: `docs/manual-test-checklist.md`
- Runtime smoke test: `scripts/electron-runtime-smoke.mjs`
- Bridge notes: `packages/windows-bridge/README.md`
