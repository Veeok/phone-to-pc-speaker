import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" {...props} />;
}

export function AppIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" {...props}>
      <defs>
        <linearGradient id="phoneToPcSpeakerAppIcon" x1="3" x2="21" y1="3" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#58b8ff" />
          <stop offset="1" stopColor="#4fd17b" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="#1a2740" />
      <rect x="5.5" y="4.5" width="7.5" height="15" rx="2.6" stroke="url(#phoneToPcSpeakerAppIcon)" strokeWidth="1.8" />
      <circle cx="9.25" cy="16.7" r="0.9" fill="#58b8ff" />
      <path d="M15 8.2h4" stroke="#f4f7fb" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M17 6.2v8.4" stroke="#4fd17b" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M20 9.8v4.8" stroke="#4fd17b" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </BaseIcon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="7" y="3.5" width="10" height="17" rx="2.8" />
      <path d="M10.5 6h3" />
      <path d="M11.5 17.5h1" />
    </BaseIcon>
  );
}

export function ConnectIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 12h10" />
      <path d="M10 8l4 4-4 4" />
      <path d="M18 7v10" />
    </BaseIcon>
  );
}

export function MusicIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 18V7.5l9-2v10.5" />
      <circle cx="7" cy="18" r="2.2" />
      <circle cx="16" cy="16" r="2.2" />
    </BaseIcon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 6.5 18 12 8 17.5V6.5z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 6.5v11" />
      <path d="M15 6.5v11" />
    </BaseIcon>
  );
}

export function PreviousTrackIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 6.5v11" />
      <path d="M17 7 10.5 12 17 17V7z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function NextTrackIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M17 6.5v11" />
      <path d="M7 7l6.5 5L7 17V7z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function ReleaseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 12H10" />
      <path d="M14 8l-4 4 4 4" />
      <path d="M6 7v10" />
    </BaseIcon>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M13 2L6 13h5l-1 9 8-12h-5l0-8z" />
    </BaseIcon>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3l1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
      <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z" />
    </BaseIcon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.6 2.6 0 1 1 4.4 1.9c-.8.7-1.5 1.2-1.5 2.3" />
      <path d="M12 17.2h.01" />
    </BaseIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 9l6 6 6-6" />
    </BaseIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </BaseIcon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4l8.5 15h-17L12 4z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </BaseIcon>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12.5h14" />
    </BaseIcon>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1.8" />
    </BaseIcon>
  );
}

export function RestoreIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 8h11v11H8z" />
      <path d="M5 16V5h11" />
    </BaseIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </BaseIcon>
  );
}
