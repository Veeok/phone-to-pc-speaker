# Phone To pc speaker Agent Notes

## Permanent Product Rules

- App title must be exactly `Phone To pc speaker`.
- Button labels must be exactly `Refresh Devices`, `Enable Connection`, `Open Connection`, and `Release Connection`.
- Panel labels must be exactly `Eligible Devices`, `Selected Device`, `Connection Status`, `Last Error`, and `Diagnostics`.
- Public connection states must be exactly `Disconnected`, `Ready`, `Connecting`, `Connected`, and `Failed`.
- Do not expose `Idle`, `Opened`, `Active`, `Pending`, `Error`, or `Closed` as public connection states.

## Phase 1 Scope

- Phase 1 supports media audio foundation only. Phone call audio is not included.
- In scope: eligible A2DP device discovery, device selection, enable/open/release lifecycle, routing media audio to the PC output through Windows APIs, and clear diagnostics.
- Out of scope: HFP or call audio, microphone routing, tray app, auto-start, updater, analytics, cloud sync, and multi-phone simultaneous playback.

## Phase 2 Product Truth

- Phase 2 improves the product shell, state truthfulness, diagnostics structure, and telephony-readiness evaluation.
- Phase 2 must not imply shipped phone-call audio support unless it is real, validated, hardware-backed, and implemented end to end.
- If call-audio support cannot be proven, public capability must say `unknown` or `unsupported`, never `supported`.
- The communication-readiness UI must clearly separate media-audio support from call-audio readiness.

## Diagnostics Structure Rules

- Diagnostics must remain useful for debugging, but summary diagnostics should be the default view and advanced/raw diagnostics should be secondary.
- Raw device identifiers and long native strings must not dominate the primary product view.
- Severity values must remain exactly `info`, `warning`, and `error`.
- Source values must remain explicit and typed across shared contracts and app layers.

## Electron Security Invariants

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` are permanent defaults.
- The renderer must never call Node.js APIs or OS APIs directly.
- Preload may expose only `window.phoneToPcSpeaker` through `contextBridge`.
- `apps/desktop/src/renderer/renderer.d.ts` must augment `Window` using types imported from `@phone-to-pc-speaker/shared-types`.

## Bridge Architecture Invariants

- Bluetooth media-audio logic lives only in the separate C# bridge process.
- Electron main communicates with the bridge over newline-delimited JSON on stdio.
- Machine-readable messages go to stdout only.
- Human-readable logs go to stderr only.
- Flush stdout after every emitted JSON message.
- Do not emit fake success. Any path that reports `Connected` must come from a real OS call.
- Scaffolding is allowed only when it attempts the real Windows API, catches failures, emits typed diagnostics with the exact exception message, and exits cleanly.

## Bridge Startup Guard

- Electron main must check for the bridge binary before spawn.
- If the binary is absent, emit `bridge.healthChanged` with `{ status: "unavailable", reason: "bridge binary not found — run dotnet build" }`.
- Missing bridge binaries must never crash Electron.

## Shared Contract Rules

- `@phone-to-pc-speaker/shared-types` is the TypeScript source of truth for the public IPC contract.
- Electron main, preload, and renderer must import shared contract types from `@phone-to-pc-speaker/shared-types`.
- Do not introduce local duplicate TypeScript contract types, `any`, or ad hoc string blobs.

## Failure Handling

- Every significant failure must produce one typed error, one user-facing error, and one diagnostics event.
- Do not surface raw stack traces in the renderer UI.
- If the bridge exits unexpectedly, surface the failure visibly and move the UI to `Failed` or `Disconnected` state appropriately.

## Validation Expectations

- Prefer `pnpm` for workspace tasks.
- Validate with `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `dotnet build` for the bridge when the environment allows.
- Report the exact truth about what was and was not validated.
