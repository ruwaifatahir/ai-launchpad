import type { ReactNode } from 'react';

export type IconProps = {
  /** Rendered width and height in px. */
  size?: number;
};

type IconFrameProps = IconProps & { children: ReactNode };

/** Stroke-based 24x24 icon frame shared by every UI icon. Decorative, so hidden from assistive tech. */
export function Icon({ size = 16, children }: IconFrameProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      color="currentColor"
      className="ui-icon"
      strokeWidth="1.75"
      stroke="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
