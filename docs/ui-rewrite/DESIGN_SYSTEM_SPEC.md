# Design System Spec

## Foundations

### Color Tokens

- `--color-bg-base`: deepest workspace background.
- `--color-bg-layer`: secondary ambient layer.
- `--color-surface-1/2/3`: progressively raised shell and panel surfaces.
- `--color-surface-elevated`: modal and launcher surfaces.
- `--color-border-soft/strong/glow`: default, emphasized, and luminous borders.
- `--color-text-strong/main/muted/faint`: hierarchy-driven text scale.
- `--color-accent`, `--color-accent-soft`, `--color-accent-glow`: primary interactive accent.
- Status tokens: `--color-success`, `--color-warning`, `--color-danger`, `--color-neutral`.

### Surface Rules

- Large rounded shell cards on a blue-black backdrop.
- Thin luminous borders and soft inset highlights.
- Ambient glow reserved for shell edges, selected cards, FAB, and active rails.
- Elevated overlays use stronger blur, denser surface fill, and tighter border glow.

## Typography

- Heading family: `Bahnschrift`, `Segoe UI Variable Display`, `Segoe UI`, sans-serif.
- Body family: `Aptos`, `Segoe UI Variable Text`, `Segoe UI`, sans-serif.
- Mono family: `Cascadia Mono`, `Consolas`, monospace.
- Eyebrows and labels use uppercase tracking.
- Primary headings are bold, high contrast, and short.
- Secondary text stays muted and concise.

## Spacing Scale

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-7`: 32px
- `--space-8`: 40px
- `--space-9`: 48px

## Radius Scale

- `--radius-sm`: 12px
- `--radius-md`: 18px
- `--radius-lg`: 24px
- `--radius-xl`: 32px
- `--radius-pill`: 999px

## Shadow Scale

- `--shadow-soft`: low-elevation panels and controls.
- `--shadow-panel`: default shell panel elevation.
- `--shadow-floating`: menus, launcher, and palette.
- `--shadow-modal`: high-elevation overlays.

## Control Heights

- `--control-xs`: 34px
- `--control-sm`: 40px
- `--control-md`: 48px
- `--control-lg`: 56px

## Motion Tokens

- Durations: `--motion-fast`, `--motion-base`, `--motion-slow`.
- Easings: `--ease-standard`, `--ease-emphasized`, `--ease-decelerate`.
- Motion remains ambient and clarity-focused: hover lift, modal fade/scale, subtle background pulse.
- Reduced or paused motion settings must disable non-essential animation.

## Responsive Rules

- `--breakpoint-xl`: large desktop shell.
- `--breakpoint-lg`: stacked support column.
- `--breakpoint-md`: single-column shell and collapsed hero controls.
- `--breakpoint-sm`: compact cards, stacked metadata, full-width overlays.

## Component Variants

- `SectionPanel`: `default`, `strong`, `danger`, `subtle`.
- `StatusPill`: `neutral`, `positive`, `warning`, `negative`.
- `ActionButton`: `primary`, `secondary`, `ghost`, `danger`.
- `ObjectCard`: `default`, `selected`, `disabled`.
- `Banner`: `info`, `warning`, `error`.
- `ProgressBar`: `neutral`, `positive`, `warning`, `negative`.

## Interaction States

- Hover: slight lift + brighter border.
- Focus-visible: high-contrast accent outline.
- Active: compressed lift and stronger inset highlight.
- Disabled: visible but muted; unavailable actions remain legible when they teach system state.
- Selected: stronger glow border, denser background, and persistent accent cue.
- Busy: spinner/working label or muted interaction lockout.

## Feedback Rules

- Global issues use persistent banner + toast for immediate attention.
- Local actions use inline helper text and button disable states.
- Success and failure toasts are short, declarative, and actionable.
- Diagnostics stay summary-first; advanced detail is secondary.

## Accessibility Rules

- Maintain strong text/background contrast across all panels.
- Keep keyboard access for launcher, command palette, settings, and dialog flows.
- Support `Escape` to dismiss transient overlays.
- Use visible focus styles on cards, buttons, disclosures, and fields.
- Preserve disabled affordance without hiding unavailable capability.
- Do not rely on color alone for status; pair tone with labels and iconography.
