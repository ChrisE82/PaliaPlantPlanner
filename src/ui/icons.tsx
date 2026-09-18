/**
 * Inline icons, sized by font-size (1em) and colored by currentColor.
 * Decorative by default: pass a title only when the icon carries meaning that
 * nearby text doesn't already give.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.15em"
      height="1.15em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export function SproutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.3-2.7-6-6-6 0 3.3 2.7 6 6 6Z" />
      <path d="M12 13c0-3.9 3.1-7 7-7 0 3.9-3.1 7-7 7Z" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Icon>
  );
}

export function AutoThemeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Icon>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2.2}>
      <circle cx="9" cy="6" r="0.6" />
      <circle cx="15" cy="6" r="0.6" />
      <circle cx="9" cy="12" r="0.6" />
      <circle cx="15" cy="12" r="0.6" />
      <circle cx="9" cy="18" r="0.6" />
      <circle cx="15" cy="18" r="0.6" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10H9" />
    </Icon>
  );
}

export function WandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 4V2M15 10V8M12.5 6h-2M19.5 6h-2M4 20l10-10" />
      <path d="m13 7 4 4" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 13 4 4L19 7" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

// ---- Buff icons (filled, so they read at badge size) -----------------------

function FilledIcon({ title, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.15em"
      height="1.15em"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Water Retain */
export function DropletIcon(props: IconProps) {
  return (
    <FilledIcon {...props}>
      <path d="M12 2.5c-.3 0-.6.2-.8.4C9.4 5.3 5.5 10.4 5.5 14a6.5 6.5 0 0 0 13 0c0-3.6-3.9-8.7-5.7-11.1-.2-.2-.5-.4-.8-.4Z" />
    </FilledIcon>
  );
}

/** Weed Block */
export function ShieldIcon(props: IconProps) {
  return (
    <FilledIcon {...props}>
      <path d="M12 2.2 4.5 5.1a1 1 0 0 0-.6.9v5.3c0 5 3.3 9.3 7.8 10.5.2.1.4.1.6 0 4.5-1.2 7.8-5.5 7.8-10.5V6a1 1 0 0 0-.6-.9L12 2.2Z" />
    </FilledIcon>
  );
}

/** Harvest Boost */
export function SheafIcon(props: IconProps) {
  return (
    <FilledIcon {...props}>
      <path d="M11 21.5V13c-3.3-.3-5.8-2.8-6-6.1 0-.5.4-.9.9-.9 2.4.1 4.4 1.4 5.1 3.3V4.2c0-.4.3-.8.7-.9.3 0 .5 0 .7.2l.1.1c.3.3.5.6.5 1v5.1c.8-1.8 2.7-3.1 5.1-3.2.5 0 .9.4.9.9-.2 3.3-2.7 5.8-6 6.1v8.4c0 .5-.4.9-.9.9h-.2c-.5 0-.9-.4-.9-.9Z" />
    </FilledIcon>
  );
}

/** Quality Boost */
export function StarIcon(props: IconProps) {
  return (
    <FilledIcon {...props}>
      <path d="m12 2.8 2.6 5.5 6 .8c.6.1.9.9.4 1.3l-4.4 4.1 1.1 5.9c.1.6-.6 1.1-1.1.8L12 18.4l-5.3 2.8c-.6.3-1.2-.2-1.1-.8l1.1-5.9-4.4-4.1c-.5-.4-.2-1.2.4-1.3l6-.8L11.1 2.8c.3-.5 1.1-.5 1.4 0Z" />
    </FilledIcon>
  );
}

/** Growth Boost */
export function FastForwardIcon(props: IconProps) {
  return (
    <FilledIcon {...props}>
      <path d="M3.5 6.3v11.4c0 .8.9 1.2 1.5.8l7-5.7c.5-.4.5-1.2 0-1.6l-7-5.7c-.6-.4-1.5 0-1.5.8Zm9 0v11.4c0 .8.9 1.2 1.5.8l7-5.7c.5-.4.5-1.2 0-1.6l-7-5.7c-.6-.4-1.5 0-1.5.8Z" />
    </FilledIcon>
  );
}

export function EraserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 20H5l-2-2a2 2 0 0 1 0-3l9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-6 6" />
      <path d="M8 20h13" />
    </Icon>
  );
}
