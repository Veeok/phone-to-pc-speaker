# Phone To pc speaker

Phase 2 delivers a production-style shell for the Windows media-audio foundation while keeping the product truthful about call-audio support.

Media audio foundation is supported.
Call audio is not a shipped feature in the current codebase and must not be treated as supported.

## Current app purpose

`Phone To pc speaker` discovers eligible remote media-audio devices, lets you select a phone, enables and opens the Windows media-audio path, releases the connection cleanly, and surfaces structured diagnostics and communication readiness.

## Phase boundaries

- Phase 1: media-audio foundation only
- Phase 2: polished product shell, state normalization, diagnostics restructuring, and truthful telephony-readiness gating
- Current limitation: call audio is not shipped, not validated end to end, and is intentionally shown as unsupported in the UI

## What Phase 2 added

- A redesigned dark product shell with clearer hierarchy and denser use of space
- Normalized public connection state plus separate activity handling
- Summary diagnostics by default with advanced diagnostics as a secondary view
- Cleaner selected-device presentation with raw IDs moved behind advanced disclosure
- A dedicated communication-readiness card for media audio, call audio, bridge health, and current limitation
- Truthful capability gating so the app never implies working phone-call audio support

## Architecture

- `packages/shared-types` is the TypeScript source of truth for Electron contracts and public app models
- `apps/desktop/src/main` owns Electron IPC, bridge lifecycle, diagnostics buffering, bridge-health handling, and capability-state propagation
- `apps/desktop/src/preload` exposes only `window.phoneToPcSpeaker`
- `apps/desktop/src/renderer` contains the React/Vite renderer UI
- `packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge` is the native C# bridge that owns Windows Bluetooth/media-audio operations
- Native Bluetooth/media-audio logic remains outside the renderer and preload

## Commands

```bash
pnpm install
pnpm bridge:build
pnpm dev
pnpm start
pnpm build
pnpm typecheck
pnpm lint
```

- `pnpm dev` starts the Electron app in development mode
- `pnpm start` launches the already-built Electron app from `apps/desktop/out`
- `pnpm bridge:build` builds the native bridge and falls back to `C:\Users\<you>\.dotnet\dotnet.exe` when `dotnet` is not on `PATH`

Direct native bridge build:

```bash
dotnet build packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge/PhoneToPcSpeaker.WindowsBridge.csproj
```

## Runtime notes

- Windows is required for the native media-audio path
- If the bridge binary is missing, the desktop app stays alive and reports `bridge binary not found — run dotnet build`
- The bridge attempts the real Windows API path and reports honest failures
- The app never fabricates a `Connected` state or call-audio support

## Bluetooth volume sync

- The current app uses `Windows.Media.Audio.AudioPlaybackConnection` for discovery and media-audio routing.
- That API exposes connection lifecycle and state only; it does not expose remote-volume events, AVRCP absolute-volume callbacks, or connection-level gain control.
- Because of that, the app does not force Windows system volume or claim true Android-to-Windows volume synchronization.
- If Android volume buttons still change perceived loudness while connected, that behavior is coming from the phone or the Windows audio stack outside the app and may vary by phone, Bluetooth radio, driver, and Windows build.
- The app currently treats volume-behavior detection as a manual observation task: keep Windows volume fixed, play audio, press Android volume buttons, and classify whether Windows volume changed, only loudness changed, or nothing changed.

## Validation assets

- Phase 1 execution plan: `docs/execplans/phase-1-media-audio.md`
- Phase 2 execution plan: `docs/execplans/phase-2-ux-and-telephony-readiness.md`
- Manual checklist: `docs/manual-test-checklist.md`
- Runtime smoke test: `scripts/electron-runtime-smoke.mjs`
- Bridge notes: `packages/windows-bridge/README.md`
