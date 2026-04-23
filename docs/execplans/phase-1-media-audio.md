# Phase 1 Media Audio Execution Plan

## Purpose

Build the phase-1 MVP foundation for `Phone To pc speaker` as a Windows desktop app using a `pnpm` workspace, Electron + React + Vite + TypeScript for the desktop shell, and a separate C# `.NET 8` bridge process for Bluetooth media-audio discovery and connection control.

Phase 1 supports media audio foundation only. Phone call audio is not included.

## Audit Summary

- Repository audit started from an empty workspace root. No application files, build files, or documentation were present.
- No existing Electron app, shared package, or Windows bridge code was present.
- Available runtimes observed from the shell:
  - `node --version` -> `v25.8.0`
  - `pnpm --version` -> `9.15.0`
  - `dotnet --version` failed because no .NET SDKs were installed in this environment.
- Environment metadata also indicates the workspace is not currently a Git repository.

## Architecture Overview

- Root `pnpm` workspace manages the desktop app and shared TypeScript contract package.
- `@phone-to-pc-speaker/shared-types` defines the public request, response, event, state, diagnostics, and preload API contract.
- Electron renderer talks only to preload through `window.phoneToPcSpeaker`.
- Preload forwards typed requests to Electron main through `ipcRenderer`.
- Electron main owns bridge lifecycle, health, diagnostics buffering, request correlation, and startup guards.
- The C# bridge owns Windows API access, device discovery, connection lifecycle, and newline-delimited JSON stdio messaging.
- Device discovery uses the real Windows `AudioPlaybackConnection` discovery selector. Connection enable/open/release use the real `AudioPlaybackConnection` API path.

## File Plan

- Root workspace: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `README.md`
- Planning and docs: `docs/execplans/phase-1-media-audio.md`, `docs/manual-test-checklist.md`
- Shared types: `packages/shared-types/package.json`, `packages/shared-types/tsconfig.json`, `packages/shared-types/src/index.ts`
- Desktop shell: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/electron.vite.config.ts`, `apps/desktop/src/main/*`, `apps/desktop/src/preload/*`, `apps/desktop/src/renderer/*`
- Windows bridge docs: `packages/windows-bridge/README.md`
- Windows bridge source: `packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge/*.csproj`, `Program.cs`, `Bridge/*`, `Bluetooth/*`, `Diagnostics/*`, `Models/*`

## IPC Contract Summary

- Requests: `bridge.ping`, `devices.refresh`, `connection.enable`, `connection.open`, `connection.release`, `diagnostics.getRecent`
- Events: `devices.updated`, `connection.stateChanged`, `diagnostics.appended`, `bridge.healthChanged`
- Envelope shapes:
  - request -> `{ id, type, payload }`
  - response -> `{ requestId, ok, payload?, error? }`
  - event -> `{ type, payload }`
- Required shared types: `DeviceSummary`, `ConnectionState`, `BridgeHealth`, `DiagnosticsEvent`, `UserFacingError`, `BridgeRequestMap`, `BridgeResponseMap`, `BridgeEventMap`

## Milestone Breakdown

### Milestone A - Workspace and Build Foundation

- Create the root `pnpm` workspace and TypeScript base config.
- Add root scripts for `dev`, `build`, `typecheck`, and `lint`.

### Milestone B - Shared Types Package

- Define the shared IPC contract before any Electron code consumes it.
- Export preload API typing from the shared package.

### Milestone C - Electron Desktop Shell

- Scaffold Electron main, preload, and React renderer.
- Enforce the preload + `contextBridge` security boundary.
- Build the required dark UI with exact labels, diagnostics, and button-state hardening.

### Milestone D - Bridge Process Wiring

- Spawn the bridge from Electron main only after a binary existence check.
- Implement newline-delimited JSON parsing, request correlation, health propagation, and diagnostics buffering.

### Milestone E - C# Bridge Foundation

- Build a typed request dispatcher and structured diagnostics pipeline.
- Ensure exception boundaries emit typed failures instead of silent crashes.

### Milestone F - Real Device Discovery

- Use `AudioPlaybackConnection.GetDeviceSelector()` for real eligible-device enumeration.
- Start one watcher, keep an in-memory registry, and emit `devices.updated` on change.

### Milestone G - Connection Lifecycle

- Implement enable, open, state observation, and release around `AudioPlaybackConnection`.
- Translate native states to the canonical public state enum.

### Milestone H - UX Hardening

- Disable invalid buttons, prevent multi-click races, restore the last selected device, and surface bridge health and failures visibly.

### Milestone I - Documentation and Test Assets

- Document setup, architecture, limitations, validation commands, and manual test scenarios.

## Decision Log

- The safe default for an empty repository is to scaffold the canonical layout from scratch.
- The shared TypeScript contract will remain the source of truth for Electron code. The bridge will mirror the serialized shapes in C# because cross-language runtime import is not available.
- No mock success path will be added. The bridge will attempt the real Windows API path and surface failures honestly.
- The bridge startup guard will check built bridge outputs first and emit the required unavailable health event when absent.
- The renderer will persist only the last selected device ID and will never auto-open a connection on launch.

## Risks

- This environment has no installed .NET SDK, so the bridge cannot be built or validated here.
- Windows `AudioPlaybackConnection` support is hardware and OS dependent; unsupported systems may only exercise the failure path.
- Electron runtime behavior cannot be fully GUI-validated from a headless CLI session.

## Validation Commands

- `pnpm install`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `dotnet build packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge/PhoneToPcSpeaker.WindowsBridge.csproj`

## Manual Test Plan

- Launch the app and confirm the title, panels, and exact button labels.
- Confirm startup health behavior with and without the built bridge binary.
- Verify empty-device and one-device discovery states.
- Select a device, enable it, open it, release it, and repeat the cycle.
- Confirm invalid buttons stay disabled across every public connection state.
- Force the bridge process to stop and confirm visible failure handling in the UI.
- Restart the app and confirm the last selected device is restored without auto-opening.
- Confirm all docs and UI text avoid any claim of phone-call audio support.

## Progress Checklist

- [x] Audit completed
- [x] Workspace scaffolded
- [x] Shared types package scaffolded
- [x] Electron shell scaffolded
- [x] Bridge wiring scaffolded
- [x] C# bridge foundation scaffolded
- [x] Real discovery path implemented
- [x] Connection lifecycle implemented
- [x] UX hardening implemented
- [x] Documentation completed
- [x] Validation run and recorded

## Surprises

- The repository was completely empty at the start of the task.
- `dotnet` is present only as a host entry point in this environment; no SDK is installed, so bridge compilation is blocked locally.
- `electron-vite` builds the desktop app successfully to `apps/desktop/out`, so the Electron shell is build-valid even though runtime GUI validation remains limited from the CLI.
- Runtime smoke validation uncovered two preload-specific issues that were then fixed: preload output needed a sandbox-compatible CommonJS target, and the preload bundle needed `@phone-to-pc-speaker/shared-types` bundled instead of externalized.

## Retrospective Placeholder

- The workspace, shared contract, Electron shell, bridge wiring, Windows bridge scaffold, and documentation are now in place.
- JavaScript and TypeScript validation completed successfully with `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- A local `.NET 8` SDK install plus cached Windows SDK package allowed the bridge to build and start in this environment.
- Automated Electron runtime validation confirmed the exact UI labels, `window.phoneToPcSpeaker` preload boundary, bridge health propagation, device discovery, device selection, enable flow, and honest open-failure handling.
