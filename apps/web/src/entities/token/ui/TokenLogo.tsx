import { useState } from 'react';
import { cx } from '@/shared/lib';
import { ImageIcon } from '@/shared/ui/icon';

type TokenLogoProps = {
  /** The logo link, or `null` for the placeholder. */
  image: string | null;
  /** The frame's class; `is-loaded` or `is-loading` is added beside it. */
  className: string;
  /** The placeholder icon's size, in px. */
  iconSize: number;
  /** Above-the-fold: load the image eagerly at high priority. */
  priority?: boolean;
};

/** A token's logo in a square frame, or a placeholder when it has none or the link does not load. */
export function TokenLogo({ image, className, iconSize, priority = false }: TokenLogoProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = image !== null && failed !== image;

  return (
    <span className={cx(className, shown ? 'is-loaded' : 'is-loading')} aria-hidden="true">
      {shown ? (
        <img
          alt=""
          width="384"
          height="384"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          src={image}
          onError={() => setFailed(image)}
        />
      ) : (
        <ImageIcon size={iconSize} />
      )}
    </span>
  );
}
