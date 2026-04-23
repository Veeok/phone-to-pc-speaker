# UI Component Inventory

## `AppShell`

- Purpose: centered product shell and top-level operator frame.
- Props / Inputs: `children`.
- Visual Variants: none.
- Interaction States: responsive shell padding only.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `SectionPanel`

- Purpose: standardized panel shell for primary and supporting sections.
- Props / Inputs: `title`, `subtitle`, `kicker`, `actions`, `variant`, `className`, `children`.
- Visual Variants: `default`, `strong`, `subtle`, `danger`.
- Interaction States: hover handled by nested controls; variant-specific emphasis.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: refactored existing panel pattern into reusable primitive.

## `StatusPill`

- Purpose: consistent state/capability/meta badge.
- Props / Inputs: `label`, `value`, `tone`, `icon`, `compact`.
- Visual Variants: `neutral`, `positive`, `warning`, `negative`; compact mode.
- Interaction States: static display component.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: refactored existing badge pattern into reusable primitive.

## `ActionButton`

- Purpose: primary, secondary, ghost, and danger action hierarchy.
- Props / Inputs: native button props plus `variant`, `icon`, `busy`.
- Visual Variants: `primary`, `secondary`, `ghost`, `danger`.
- Interaction States: default, hover, focus, disabled, busy.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/ui.tsx`.
- Status: created new.

## `IconButton`

- Purpose: compact icon-only controls for shell utilities and dismiss actions.
- Props / Inputs: native button props plus `label`, `active`.
- Visual Variants: default, active.
- Interaction States: default, hover, focus, disabled.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/ui.tsx`.
- Status: created new.

## `ObjectCard`

- Purpose: rich row/card primitive where the object surface is the action surface.
- Props / Inputs: `title`, `subtitle`, `badges`, `meta`, `footer`, `selected`, `disabled`, `onClick`, `className`, `children`.
- Visual Variants: default, selected, disabled.
- Interaction States: default, hover, focus, selected, disabled.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `ModalShell`

- Purpose: reusable overlay shell for settings, command palette, readiness guide, and confirmation prompts.
- Props / Inputs: `title`, `subtitle`, `size`, `onClose`, `footer`, `className`, `children`.
- Visual Variants: `sm`, `md`, `lg` sizes.
- Interaction States: backdrop dismiss, close button, responsive modal layout.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/CommandPalette.tsx`, `apps/desktop/src/renderer/src/ui.tsx`.
- Status: created new.

## `ConfirmDialog`

- Purpose: confirmation step for staged/high-risk actions.
- Props / Inputs: `title`, `description`, `confirmLabel`, `cancelLabel`, `tone`, `busy`, `onCancel`, `onConfirm`, `children`.
- Visual Variants: neutral/warning/negative tone through confirm button treatment.
- Interaction States: confirm, cancel, busy.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `SettingsRail`

- Purpose: category navigation for modal settings IA.
- Props / Inputs: `items`, `activeItemId`, `onChange`.
- Visual Variants: inactive, active.
- Interaction States: hover, focus, active selection.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `CommandPalette`

- Purpose: searchable overlay for actions, devices, and workspace jumps.
- Props / Inputs: `open`, `items`, `onClose`.
- Visual Variants: grouped result sections and tone-coded command rows.
- Interaction States: open, keyboard navigation, active item, disabled item, empty state.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `TextField`

- Purpose: consistent text input with label and optional leading icon.
- Props / Inputs: native input props plus `label`, `hint`, `leading`.
- Visual Variants: standard, with leading icon.
- Interaction States: default, hover, focus, disabled.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/CommandPalette.tsx`.
- Status: created new.

## `SelectField`

- Purpose: tokenized select control for settings.
- Props / Inputs: native select props plus `label`, `hint`, `options`.
- Visual Variants: standard select with chevron affordance.
- Interaction States: default, hover, focus, disabled.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `TextareaField`

- Purpose: multi-line field for runtime notes and advanced read-only detail.
- Props / Inputs: native textarea props plus `label`, `hint`.
- Visual Variants: standard textarea shell.
- Interaction States: default, focus, read-only.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `ToggleRow`

- Purpose: settings toggle row with explicit descriptive text.
- Props / Inputs: `label`, `description`, `checked`, `onChange`.
- Visual Variants: checked, unchecked.
- Interaction States: hover, focus, checked.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `ToastViewport`

- Purpose: stacked global toast feedback for action outcomes and failures.
- Props / Inputs: `toasts`, `onDismiss`.
- Visual Variants: `positive`, `warning`, `negative`, `neutral`.
- Interaction States: auto-dismiss, manual dismiss.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `Banner`

- Purpose: persistent global status banner for major readiness or bridge issues.
- Props / Inputs: `tone`, `title`, `description`, `action`.
- Visual Variants: `warning`, `negative`, `neutral`.
- Interaction States: action affordance via nested button.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `EmptyStateBlock`

- Purpose: standardized empty, zero-result, and unavailable states.
- Props / Inputs: `icon`, `title`, `description`, `action`.
- Visual Variants: icon/no-icon; action/no-action.
- Interaction States: action affordance via nested button.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/src/renderer/src/CommandPalette.tsx`.
- Status: created new.

## `SkeletonBlock`

- Purpose: shared loading placeholder for shell sections and device cards.
- Props / Inputs: `rows`, `compact`.
- Visual Variants: default, compact.
- Interaction States: animated shimmer; reduced/paused motion respects app setting.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `DetailPanel`

- Purpose: compact labeled detail block for summary-first metadata.
- Props / Inputs: `label`, `value`, `meta`, `tone`.
- Visual Variants: `neutral`, `positive`, `warning`, `negative`.
- Interaction States: static informational component.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `ProgressBar`

- Purpose: visualize readiness and connection lifecycle progression.
- Props / Inputs: `value`, `tone`, `label`.
- Visual Variants: `neutral`, `positive`, `warning`, `negative`.
- Interaction States: static informational component.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: created new.

## `DisclosureBlock`

- Purpose: progressive disclosure for advanced device, readiness, and diagnostics detail.
- Props / Inputs: `summary`, `children`, `defaultOpen`.
- Visual Variants: collapsed, expanded.
- Interaction States: hover, focus, open/closed.
- Files Using It: `apps/desktop/src/renderer/src/App.tsx`.
- Status: refactored existing `details` usage into reusable primitive.
