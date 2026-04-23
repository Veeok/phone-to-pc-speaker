# Manual Test Checklist

Phase 2 adds a redesigned product shell, structured diagnostics, and truthful communication-readiness gating.

Media audio foundation is supported.
Call audio is not a shipped feature and must never be claimed as supported in this checklist unless the code and environment truly change.

## Launch and Health

- [ ] Launch app successfully
- [ ] Bridge healthy on startup
- [ ] Bridge unavailable startup path shows `bridge binary not found — run dotnet build`
- [ ] Renderer loads and actions remain responsive
- [ ] Preload API is functioning through the live UI

## Device Discovery and Selection

- [ ] No devices found flow
- [ ] One eligible device found flow
- [ ] Device list refresh
- [ ] Select device from `Eligible Devices`
- [ ] Selected device summary hides raw ID until advanced disclosure
- [ ] Pairing-metadata mismatch explanation is understandable when it appears

## Media-Audio Lifecycle

- [ ] Enable Connection on selected device
- [ ] Open Connection on selected device
- [ ] Release Connection
- [ ] Repeated enable/open/release cycle
- [ ] Public state remains one of `Disconnected`, `Ready`, `Connecting`, `Connected`, `Failed`
- [ ] Activity never contradicts the public state

## Volume Sync Verification

- [ ] While connected, press Android volume up and volume down and note whether perceived loudness changes on the PC output
- [ ] Confirm whether Windows system output volume visibly changes or stays fixed during those Android volume presses
- [ ] Confirm whether diagnostics report that Bluetooth volume sync is device-dependent rather than guaranteed
- [ ] Do not claim Android controls Windows volume unless Windows volume really changes on the tested hardware
- [ ] Keep Windows volume fixed during the test so source-stream loudness changes are not confused with PC-side volume changes
- [ ] Record one of three outcomes for the tested device pair: `Windows volume changed`, `loudness changed but Windows volume did not`, or `no observable linkage`

## Remote Media Metadata and Controls

- [ ] While connected and playing audio from Android, confirm whether Windows exposes track metadata in the app
- [ ] If metadata appears, verify title and artist update when tracks change
- [ ] If transport buttons appear, verify play/pause, previous, and next only enable when Windows reports them as supported
- [ ] If another Windows media app becomes active, confirm the app behaves truthfully and does not claim hard ownership of the phone session
- [ ] If Windows exposes no current media session for the phone, confirm the app does not fake metadata or transport controls

## Buttons and Interaction Hardening

- [ ] Invalid buttons are disabled
- [ ] Pending actions prevent rapid multi-click races
- [ ] Refresh, enable, open, and release show pending behavior while in flight
- [ ] Keyboard interaction remains reasonable for buttons, device selection, and diagnostics tabs

## Diagnostics

- [ ] `Diagnostics` summary view is the default visible mode
- [ ] `Diagnostics` advanced view is available and readable
- [ ] Summary diagnostics stay concise and human-readable
- [ ] Advanced diagnostics retain raw bridge/native/device details
- [ ] Raw device identifiers do not dominate the primary product view

## Communication Readiness

- [ ] Communication-readiness card is visible
- [ ] `Media Audio` capability renders truthfully
- [ ] `Call Audio` capability renders truthfully
- [ ] `Bridge Health` renders truthfully
- [ ] `Current Limitation` clearly states that call audio is not shipped
- [ ] No part of the UI falsely implies working phone-call audio support

## Failure Handling

- [ ] Bridge launch failure shows user-facing error and diagnostics
- [ ] Bridge disconnect/crash degrades the UI visibly and truthfully
- [ ] Device refresh failure shows user-facing error and diagnostics
- [ ] Enable failure shows user-facing error and diagnostics
- [ ] Open failure shows user-facing error and diagnostics
- [ ] Release failure shows user-facing error and diagnostics
- [ ] Capability probe inconclusive path is visible if encountered

## Notes

- Record Windows version, Bluetooth hardware, paired phone model, and whether the bridge was built in Debug or Release.
- Capture both summary and advanced diagnostics when any failure path is exercised.
