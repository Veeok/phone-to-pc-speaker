# UX/UI Rewrite Plan

## Current UI Architecture Summary

- Renderer is a single React screen in `apps/desktop/src/renderer/src/App.tsx` with no route system and a single stylesheet in `apps/desktop/src/renderer/src/styles.css`.
- One component currently owns device discovery presentation, selection, connection lifecycle actions, diagnostics, readiness, error handling, and local persistence.
- Information architecture is functional but flat: all major areas are visible at once, action hierarchy is weak, and secondary diagnostics compete with the primary device workflow.
- Styling is centralized but component structure is not; reusable primitives do not exist yet.
- Hidden product rules already exist and must survive the rewrite: bridge health gating, capability-aware UI, canonical connection states, diagnostics filtering, and selected-device persistence.

## Target UX Architecture

- Convert the renderer into a single premium operator shell with one dominant centered surface and layered secondary panels.
- Make the primary workflow obvious: discover device -> select device -> enable -> open -> release.
- Move secondary tasks into overlays and supporting panels: settings modal, command palette, readiness guide, confirmation dialog, floating quick actions.
- Keep diagnostics summary-first and move advanced detail behind disclosures and the advanced tab.
- Preserve truthful capability gating: media audio stays distinct from call-audio readiness, and unsupported features remain visible but clearly unavailable.

## Screen Mapping Old -> New

| Current surface | Rewritten surface |
| --- | --- |
| Topbar + intro strip + activity strip | Unified hero shell with system badges, action cluster, and global status banner |
| Eligible devices list | Primary device console panel with search, rich cards, empty/loading states, and stronger selection affordance |
| Selected device card | Detail-focused operator panel with summary-first metadata and advanced disclosure |
| Connection status card | Workflow status panel with progress, next-step guidance, and staged safety prompts |
| Communication readiness card | Readiness/Setup panel plus dedicated readiness detail panel |
| Diagnostics tab panel | Summary-first diagnostics console with advanced disclosures and command access |
| No settings shell | Modal settings shell with category rail |
| No command system | Command/search palette with device and action shortcuts |
| No floating action entrypoint | Floating launcher with grouped quick actions |

## Components To Build / Refactor

- `AppShell`: centered shell frame, layered background, and responsive workspace layout.
- `SectionPanel`: reusable panel wrapper with header, subtitle, actions, and variants.
- `StatusPill`: consistent tone-aware badge for state, capability, and metadata.
- `ActionButton` and `IconButton`: standardized action hierarchy and control states.
- `ObjectCard`: rich card/list-row primitive for devices and actionable rows.
- `ModalShell`: reusable overlay shell for settings, readiness guide, and command palette.
- `ConfirmDialog`: reusable high-risk confirmation prompt.
- `SettingsRail`: category navigation for settings IA.
- `CommandPalette`: searchable action/device overlay.
- `TextField`, `SelectField`, `TextareaField`, `ToggleRow`: consistent form controls.
- `ToastViewport` and `Banner`: global feedback surfaces.
- `EmptyStateBlock`, `SkeletonBlock`: structured loading and zero states.
- `DetailPanel`, `ProgressBar`, `DisclosureBlock`: summary/detail building blocks.

## Flows To Rewrite

- Initial bootstrap and bridge health entry state.
- Device discovery and search/filter interaction.
- Device selection and remembered-selection behavior.
- Enable/open/release action flow with safer staged confirmations where appropriate.
- Bridge unavailable and failed-state recovery messaging.
- Readiness/setup guidance for missing prerequisites.
- Settings access and persistence.
- Command-driven shortcuts for actions and selection.
- Diagnostics summary vs advanced detail browsing.

## State Model Changes

- Keep existing business/domain state intact for devices, bridge health, readiness, diagnostics, connection snapshot, and errors.
- Add UI shell state for floating launcher, command palette, settings modal, readiness guide modal, confirm dialog, device search, and toasts.
- Add local UI preferences for appearance, density, diagnostics defaults, motion, and safety prompts.
- Add derived UI models for setup progress, banner state, command items, and recommended next steps.

## Design Token Plan

- Create explicit tokens for color, surfaces, borders, text, spacing, radius, shadows, control heights, motion, and responsive breakpoints.
- Support a dark-first control-room visual language using layered blue-black surfaces, luminous borders, capsule pills, and restrained green/blue accents.
- Use token-driven density and accent settings through root data attributes instead of ad hoc values.

## Implementation Order

1. Add rewrite documentation and design-system specification.
2. Create tokenized CSS foundation and reusable UI primitives.
3. Split monolithic renderer UI into reusable components.
4. Rebuild shell, primary device workflow, and side-panel architecture.
5. Add floating launcher, command palette, settings modal, readiness guide, toast/banner feedback, and confirmation dialog.
6. Rework diagnostics, empty/loading/error states, and responsive behavior.
7. Validate with `pnpm build`, `pnpm typecheck`, and `pnpm lint` if the environment allows.

## Risks And Assumptions

- The supplied audit artifact is represented in this workspace by the rewrite brief and screenshots; implementation will follow those patterns without changing product truth.
- Renderer logic is currently concentrated in one file, so large UI refactors carry regression risk unless action gating and bootstrap flows are preserved carefully.
- Settings and command systems will be renderer-local and must not imply backend capabilities that do not exist.
- No route system is currently needed; overlays and panels are the preferred adaptation of the audited interaction model.
