import type { ReactNode } from 'react';

/**
 * The app's line icons: 24×24, drawn with the current text colour, so they follow
 * the palette and the text around them. Decorative unless a `label` is given.
 */
const PATHS = {
  // Serbian-Byzantine church: a dome on a drum, with a small cross
  culture: (
    <>
      <path d="M12 2.5v3M10.6 3.9h2.8" />
      <path d="M8 10a4 4 0 0 1 8 0" />
      <path d="M7 10h10v3H7z" />
      <path d="M4.5 21v-6.5L7 13h10l2.5 1.5V21" />
      <path d="M3 21h18M10.5 21v-3.5a1.5 1.5 0 0 1 3 0V21" />
    </>
  ),
  // Pančić spruce: the narrow spire of the conifer found only in Serbia's Tara mountains
  nature: (
    <>
      <path d="M12 2.5 8.5 8.5h2L7.5 13h2.5L6.5 18h11L14 13h2.5l-3-4.5h2z" />
      <path d="M12 18v3.5" />
    </>
  ),
  car: (
    <>
      <path d="M5 16.5h14v-4l-2-4.5H7l-2 4.5z" />
      <path d="M5 12.5h14" />
      <circle cx="8" cy="16.5" r="1.6" />
      <circle cx="16" cy="16.5" r="1.6" />
    </>
  ),
  // a car on a bumpy track
  rough: (
    <>
      <path d="M6 13h12v-3l-1.5-3.5h-9L6 10z" />
      <circle cx="8.5" cy="13.5" r="1.4" />
      <circle cx="15.5" cy="13.5" r="1.4" />
      <path d="M2.5 19c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
    </>
  ),
  // hiking boot
  hike: (
    <>
      <path d="M7 3.5h5l.5 7 5.5 2.5a2.5 2.5 0 0 1 1.5 2.3V18H4.5l1.5-7.5z" />
      <path d="M4.5 18v2.5h15V18M8.5 7.5h4M8 10.5h4.5" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9v.5" />
      <path d="M12 16.8v.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5V7M12 17v4.5M2.5 12H7M17 12h4.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.2" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  camera: (
    <>
      <path d="M3.5 8a1.5 1.5 0 0 1 1.5-1.5h2.5L9 4.5h6l1.5 2H19A1.5 1.5 0 0 1 20.5 8v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  map: (
    <>
      <path d="m3.5 6 5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18.5" r="2.2" />
      <path d="M18 2.8a3.4 3.4 0 0 0-3.4 3.4c0 2.5 3.4 5.7 3.4 5.7s3.4-3.2 3.4-5.7A3.4 3.4 0 0 0 18 2.8z" />
      <path d="M8.2 18.5H15a3.2 3.2 0 0 0 0-6.4H9.5a3.2 3.2 0 0 1 0-6.4h3" strokeDasharray="2.2 2.4" />
    </>
  ),
  // a box with an arrow into it: keeping a backup
  backup: (
    <>
      <path d="M12 3v10M8 9.5l4 4 4-4" />
      <path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label, className }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
