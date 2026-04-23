import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react';
import { useEffect } from 'react';
import { ChevronDownIcon, CheckIcon, CloseIcon } from './icons';
import { cn } from './utils';

export type UiTone = 'neutral' | 'positive' | 'warning' | 'negative';

export function AppShell({ children }: { children: ReactNode }) {
  return <main className="app-shell">{children}</main>;
}

export function SectionPanel({
  kicker,
  title,
  subtitle,
  actions,
  variant = 'default',
  className,
  children
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: 'default' | 'strong' | 'subtle' | 'danger';
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('section-panel', `section-panel--${variant}`, className)}>
      <header className="section-panel__header">
        <div className="section-panel__heading">
          {kicker ? <p className="section-panel__kicker">{kicker}</p> : null}
          <h2>{title}</h2>
          {subtitle ? <p className="section-panel__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="section-panel__actions">{actions}</div> : null}
      </header>
      <div className="section-panel__body">{children}</div>
    </section>
  );
}

export function StatusPill({
  label,
  value,
  tone = 'neutral',
  icon,
  compact = false
}: {
  label?: string;
  value: string;
  tone?: UiTone;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <span className={cn('status-pill', `status-pill--${tone}`, compact && 'status-pill--compact')}>
      {icon ? <span className="status-pill__icon">{icon}</span> : null}
      <span className="status-pill__content">
        {label ? <span className="status-pill__label">{label}</span> : null}
        <strong>{value}</strong>
      </span>
    </span>
  );
}

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
  busy?: boolean;
};

export function ActionButton({
  children,
  className,
  variant = 'secondary',
  icon,
  busy = false,
  ...props
}: ActionButtonProps) {
  return (
    <button className={cn('action-button', `action-button--${variant}`, busy && 'is-busy', className)} type="button" {...props}>
      {icon ? <span className="action-button__icon">{icon}</span> : null}
      <span className="action-button__label">{children}</span>
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
};

export function IconButton({ children, className, label, active = false, ...props }: IconButtonProps) {
  return (
    <button aria-label={label} className={cn('icon-button', active && 'icon-button--active', className)} title={label} type="button" {...props}>
      {children}
    </button>
  );
}

export function ObjectCard({
  title,
  subtitle,
  badges,
  meta,
  footer,
  selected = false,
  disabled = false,
  onClick,
  className,
  children
}: {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const content = (
    <>
      <div className="object-card__header">
        <div className="object-card__heading">
          <strong>{title}</strong>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {badges ? <div className="object-card__badges">{badges}</div> : null}
      </div>
      {children ? <div className="object-card__content">{children}</div> : null}
      {meta ? <div className="object-card__meta">{meta}</div> : null}
      {footer ? <div className="object-card__footer">{footer}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        className={cn('object-card', selected && 'object-card--selected', disabled && 'object-card--disabled', className)}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return <div className={cn('object-card', selected && 'object-card--selected', disabled && 'object-card--disabled', className)}>{content}</div>;
}

export function ModalShell({
  title,
  subtitle,
  size = 'md',
  onClose,
  footer,
  className,
  children
}: {
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

  return (
    <div className="modal-shell">
      <button aria-label="Close overlay" className="modal-shell__backdrop" onClick={onClose} type="button" />
      <section aria-label={title} aria-modal="true" className={cn('modal-card', `modal-card--${size}`, className)} role="dialog">
        <header className="modal-card__header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <IconButton label="Close overlay" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="modal-card__body">{children}</div>
        {footer ? <footer className="modal-card__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'warning',
  busy = false,
  onCancel,
  onConfirm,
  children
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: UiTone;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <ModalShell
      onClose={onCancel}
      size="sm"
      subtitle={description}
      title={title}
      footer={
        <>
          <ActionButton onClick={onCancel} variant="ghost">
            {cancelLabel}
          </ActionButton>
          <ActionButton busy={busy} onClick={onConfirm} variant={tone === 'negative' ? 'danger' : 'primary'}>
            {confirmLabel}
          </ActionButton>
        </>
      }
    >
      {children ? <div className="confirm-dialog__content">{children}</div> : null}
    </ModalShell>
  );
}

export function SettingsRail({
  items,
  activeItemId,
  onChange
}: {
  items: Array<{ id: string; label: string; description: string; icon: ReactNode }>;
  activeItemId: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav aria-label="Settings categories" className="settings-rail">
      {items.map((item) => (
        <button
          className={cn('settings-rail__item', activeItemId === item.id && 'settings-rail__item--active')}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          <span className="settings-rail__icon">{item.icon}</span>
          <span className="settings-rail__text">
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  leading?: ReactNode;
  hideLabel?: boolean;
};

export function TextField({ label, hint, leading, className, hideLabel = false, ...props }: TextFieldProps) {
  return (
    <label className={cn('field', className)}>
      <span className={cn('field__label', hideLabel && 'field__label--sr-only')}>{label}</span>
      <span className={cn('field__control', Boolean(leading) && 'field__control--with-leading')}>
        {leading ? <span className="field__leading">{leading}</span> : null}
        <input {...props} />
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  options: Array<{ label: string; value: string }>;
};

export function SelectField({ label, hint, className, options, ...props }: SelectFieldProps) {
  return (
    <label className={cn('field', className)}>
      <span className="field__label">{label}</span>
      <span className="field__control field__control--select">
        <select {...props}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="field__chevron" />
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export function TextareaField({ label, hint, className, ...props }: TextareaFieldProps) {
  return (
    <label className={cn('field', className)}>
      <span className="field__label">{label}</span>
      <span className="field__control field__control--textarea">
        <textarea {...props} />
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-row__text">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      <span className={cn('toggle-row__control', checked && 'toggle-row__control--checked')}>
        <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <CheckIcon />
      </span>
    </label>
  );
}

export function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: Array<{ id: string; tone: UiTone; title: string; message?: string }>;
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="toast-viewport">
      {toasts.map((toast) => (
        <article className={cn('toast', `toast--${toast.tone}`)} key={toast.id}>
          <div>
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <IconButton label="Dismiss toast" onClick={() => onDismiss(toast.id)}>
            <CloseIcon />
          </IconButton>
        </article>
      ))}
    </div>
  );
}

export function EmptyStateBlock({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <div className="empty-state__content">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function SkeletonBlock({ rows = 3, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className={cn('skeleton-block', compact && 'skeleton-block--compact')}>
      {Array.from({ length: rows }).map((_, index) => (
        <span className="skeleton-block__row" key={index} />
      ))}
    </div>
  );
}

export function DetailPanel({
  label,
  value,
  meta,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: UiTone;
}) {
  return (
    <div className={cn('detail-panel', `detail-panel--${tone}`)}>
      <span className="detail-panel__label">{label}</span>
      <strong>{value}</strong>
      {meta ? <p>{meta}</p> : null}
    </div>
  );
}

export function ProgressBar({ value, tone = 'neutral', label }: { value: number; tone?: UiTone; label?: string }) {
  return (
    <div className="progress-bar-block">
      {label ? <div className="progress-bar-block__label">{label}</div> : null}
      <div aria-hidden="true" className="progress-bar-track">
        <span className={cn('progress-bar-fill', `progress-bar-fill--${tone}`)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function DisclosureBlock({
  summary,
  children,
  defaultOpen = false
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>{summary}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

export function Banner({
  tone,
  title,
  description,
  action
}: {
  tone: UiTone;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn('banner', `banner--${tone}`)}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action ? <div className="banner__action">{action}</div> : null}
    </div>
  );
}
