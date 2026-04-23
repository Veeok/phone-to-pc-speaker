# Phase 2 UX and Telephony Readiness Execution Plan

## Purpose

Deliver a production-grade Phase 2 for `Phone To pc speaker` that preserves the working media-audio path from Phase 1 while improving the product shell, normalizing public state behavior, restructuring diagnostics, and adding a truthful telephony-readiness capability layer without implying shipped phone-call audio support.

## Current-State Audit

### Workspace Layout

- Root workspace contains `apps/desktop`, `packages/shared-types`, `packages/windows-bridge`, docs, scripts, and root validation scripts.
- `pnpm` workspace is already configured and dependency installation succeeds in this environment.
- `.nuget/packages` and `nuget.config` are present to support bridge restore/build in this environment.

### Current Electron App Structure

- Main process: `apps/desktop/src/main/index.ts` and `apps/desktop/src/main/bridge-controller.ts`
- Preload: `apps/desktop/src/preload/index.ts`
- Renderer: React 18 + TypeScript + Vite in `apps/desktop/src/renderer/src/*`
- Runtime smoke script: `scripts/electron-runtime-smoke.mjs`
- Security invariants are currently intact: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

### Current Renderer Stack

- React function component app in `apps/desktop/src/renderer/src/App.tsx`
- Single large component currently owns devices, selection, status, errors, diagnostics, action dispatch, and persistence.
- Styling is centralized in `apps/desktop/src/renderer/src/styles.css`.
- Current UI works but still feels like a prototype dashboard instead of a product shell.

### Current Bridge Structure

- C# bridge project at `packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge/`
- Request dispatch in `Bridge/BridgeHost.cs`
- Bluetooth/media-audio logic in `Bluetooth/AudioPlaybackBridgeService.cs`
- Diagnostics buffering in `Diagnostics/BridgeDiagnostics.cs`
- Typed C# models in `Models/BridgeModels.cs`
- Current bridge already performs real `AudioPlaybackConnection` discovery and connection attempts.

### Current Shared Types

- Shared types live in `packages/shared-types/src/index.ts`
- Current source of truth covers requests, responses, events, `ConnectionState`, `BridgeHealth`, `DeviceSummary`, `DiagnosticsEvent`, and preload API typing.
- Gaps for Phase 2: no capability/readiness model, no split between summary and advanced diagnostics, no selected-device presentation model, no typed activity model, and no richer diagnostics source taxonomy.

### Current State Enums and Status Labels

- Public connection state already uses the required canonical values: `Disconnected`, `Ready`, `Connecting`, `Connected`, `Failed`.
- Bridge health currently uses `starting`, `healthy`, `unavailable`, `degraded`.
- Renderer currently exposes a separate `activeCommand` string with values like `refresh`, `enable`, `open`, `release`, and displays `Idle` in the UI for activity. This is a Phase 2 problem because the product forbids alternate public state words leaking confusingly into the main status card.
- Device metadata currently uses `isPaired`, `canConnect`, and `lastSeenAt` directly without a clearer trust/explanation layer.

### Current Diagnostics Architecture

- Diagnostics are currently a single flat list of `DiagnosticsEvent` objects.
- Severity model already exists: `info`, `warning`, `error`.
- Source model is incomplete: TypeScript currently only allows `electron-main` and `windows-bridge`; bridge emits only `windows-bridge`.
- Diagnostics details are shown directly in the primary product view, which makes raw technical output dominate the UI.
- There is no summary-vs-advanced split and no dedicated model for user-readable recent events versus raw technical context.

### Current Docs and Test Assets

- Existing docs: `README.md`, `docs/manual-test-checklist.md`, `docs/execplans/phase-1-media-audio.md`, `packages/windows-bridge/README.md`
- Existing automated validation helper: `scripts/electron-runtime-smoke.mjs`
- Docs still describe only Phase 1 and do not cover readiness gating or the Phase 2 product shell.

### Current Commands

- Install: `pnpm install`
- Desktop dev: `pnpm dev`
- Desktop built start: `pnpm start`
- Root build: `pnpm build`
- Root typecheck: `pnpm typecheck`
- Root lint: `pnpm lint`
- Bridge build helper: `pnpm bridge:build`
- Native bridge direct build: `dotnet build packages/windows-bridge/PhoneToPcSpeaker.WindowsBridge/PhoneToPcSpeaker.WindowsBridge.csproj`

### Environment Blockers and Known Limits

- `dotnet` is not globally available by default in this environment, but local `.NET 8` exists at `C:\Users\Veok\.dotnet\dotnet.exe` and `pnpm bridge:build` works.
- Bridge restore from `nuget.org` is unreliable from this shell; local cached package source is required.
- Electron UI can be launched and smoke-tested here, but truly hardware-backed call-audio validation is not available.
- Real media-audio discovery is available in this environment and has already surfaced one eligible phone during runtime tests.
- Real `OpenAsync` can still fail at the OS/hardware layer with `UnknownFailure`; the UI must remain truthful about that.

## UI Problems Found

- The hero/header is still oversized relative to the amount of information it carries.
- Diagnostics occupy too much primary space and compete with the action flow.
- Raw device identifiers are too visible in the main product view.
- The device list is functional but visually light relative to its importance.
- Selected device, status, and error presentation are too similar visually, which weakens hierarchy.
- Current activity uses a prototype-like `Idle` label in the primary connection status card.
- Empty, loading, and error states exist but are not consistently structured.
- There is no dedicated communication-readiness section, so the app does not clearly express the boundary between supported media audio and unshipped call audio.

## Architecture Constraints

- Preserve Electron security invariants and keep the renderer sandboxed.
- Preserve the preload-only renderer bridge.
- Preserve the C# bridge as the only owner of Bluetooth/native Windows logic.
- Preserve the working Phase 1 media-audio discovery/enable/open/release path.
- Keep `@phone-to-pc-speaker/shared-types` as the source of truth for public TypeScript contracts.
- Add capability and diagnostics structure without fabricating support or hiding uncertainty.

## Target Information Architecture

- **Top bar**: app identity, concise product boundary, bridge and connection status badges.
- **Primary content grid**:
  - **Eligible Devices** as the dominant primary panel.
  - **Selected Device** as a focused summary card with raw ID behind advanced disclosure.
  - **Connection Status** as a clear state card with canonical public state, separate activity, and concise next-step guidance.
  - **Communication Readiness** as a dedicated card for `Media Audio`, `Call Audio`, `Bridge Health`, and `Current Limitation`.
  - **Last Error** as a focused recovery card instead of a passive text block.
- **Secondary diagnostics zone**:
  - default summary diagnostics view with short human-readable recent events
  - advanced diagnostics disclosure or tabs for raw/native/bridge details

## Exact Milestones

### Milestone 1 - Audit, Plan, and Contract Design

- Record current implementation and Phase 2 target architecture.
- Design normalized shared models for diagnostics, activity, selected device presentation, and capability readiness.

### Milestone 2 - Shared State and Contract Normalization

- Extend `@phone-to-pc-speaker/shared-types` with capability, diagnostics summary/advanced, activity, and selected-device types.
- Add new typed request/event payloads as needed without duplicating types locally.

### Milestone 3 - Electron Main and Preload Refinement

- Update bridge controller to maintain normalized app state, structured diagnostics buffers, and capability/readiness propagation.
- Keep bridge startup/degradation behavior visible and truthful.

### Milestone 4 - Bridge Diagnostics and Capability Refinement

- Refactor bridge diagnostics into summary + advanced-ready structures.
- Add truthful capability/readiness probing that can report `supported`, `unsupported`, or `unknown` without overclaiming call support.

### Milestone 5 - Renderer Information Architecture and UI Redesign

- Replace the current dashboard layout with a tighter product shell.
- Preserve required visible labels and canonical states.
- Reduce visual dominance of raw diagnostics and raw device IDs.

### Milestone 6 - Interaction Hardening and Empty/Error States

- Normalize pending activity, disabled states, loading messages, recovery affordances, and bridge-disconnect handling.

### Milestone 7 - Validation and Documentation

- Re-run install/build/typecheck/lint/bridge build and automated Electron smoke validation.
- Update README and manual checklist for Phase 2 behavior and limits.

## Decision Log

- Phase 2 will preserve the existing Phase 1 request names and media path rather than introducing a breaking transport redesign.
- A separate typed activity model will be introduced so the UI can show pending work without leaking forbidden public-state words.
- Diagnostics will be retained in full fidelity but split into default summary events and secondary advanced details.
- Call-audio readiness will default to `unknown` or `unsupported` unless a real validated path exists in both code and environment.
- Raw identifiers will move behind advanced disclosure in product-facing cards while remaining available for debugging.

## Risk Log

- Capability probing for call audio may remain partially inferential because full HFP/communication-mode support is not implemented in the bridge and cannot be faked.
- The bridge and main process currently generate diagnostics differently; normalization may require coordinated changes across both TypeScript and C# layers.
- UI redesign can accidentally regress action-state logic if not carefully revalidated with runtime smoke tests.
- Bridge crash/disconnect behavior needs explicit validation after contract refactoring.

## Validation Commands

- `pnpm install`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @phone-to-pc-speaker/desktop build`
- `pnpm bridge:build`
- `pnpm exec electron scripts/electron-runtime-smoke.mjs`

## Manual Test Plan

- Launch the app and confirm the new layout renders with the exact required labels.
- Verify bridge startup health and bridge-unavailable behavior.
- Verify `Eligible Devices` empty state and one-device state.
- Select a device and confirm `Selected Device` shows friendly information by default and raw ID only in advanced disclosure.
- Verify enable, open, release, and repeated lifecycle flows.
- Verify canonical public states render consistently and do not contradict activity.
- Verify summary diagnostics render by default and advanced diagnostics remain available.
- Verify the communication-readiness card shows `Media Audio`, `Call Audio`, `Bridge Health`, and `Current Limitation` truthfully.
- Verify bridge disconnect visibly degrades UI state.
- Verify docs and UI make no false claim that call audio is shipped.

## Progress Checklist

- [x] Audit recorded
- [x] Phase 2 execution plan created
- [x] Revised information architecture designed in code
- [x] Shared contracts normalized for Phase 2
- [x] UI redesigned
- [x] Diagnostics split into summary and advanced layers
- [x] Telephony-readiness capability layer added
- [x] Validation rerun
- [x] Docs updated

## Surprises / Discoveries

- The current implementation already has a working real media-audio path, so Phase 2 should be additive and careful rather than a large transport rewrite.
- The current UI already persists selected device state, which can be reused in the redesigned shell.
- Runtime smoke validation from Phase 1 showed the environment can surface a real eligible phone, which makes hardware-backed media regression checks possible here.
- The current environment can now open and release the real media-audio path successfully, so Phase 2 validation could cover the full lifecycle instead of only the failure path.
- Bridge stderr mirrors structured diagnostics, so the summary UI needed explicit filtering to keep raw log duplication out of the default product view.

## Retrospective Placeholder

- Shared contracts now include capability readiness, structured diagnostics, selected-device summary, and separated activity/state concepts.
- The renderer was redesigned into a production-style shell with a dominant device panel, focused side cards, and secondary diagnostics tabs.
- Automated Electron runtime validation confirmed app launch, preload availability, bridge startup, device rendering, selection, enable/open/release, diagnostics summary and advanced views, readiness card rendering, and visible bridge-disconnect degradation.
