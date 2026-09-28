import { useEffect, useRef, useState } from 'react';
import { cx, shortenAddress } from '@/shared/lib';
import { CheckIcon, CopyIcon } from '@/shared/ui/icon';
import { toast } from '@/shared/ui/toast';

/** How long the copy button shows its check before going back to the address. */
const COPIED_MS = 1600;

type CopyAddressButtonProps = {
  address: string;
  /** What the address is, in sentence case, e.g. "Contract address": names the button and titles the toasts. */
  label: string;
  /** Its own class; `is-copied` is added beside it while the check shows. */
  className: string;
  /** What the button reads: the shortened address, unless the address is already on screen. */
  text?: string;
};

/**
 * An address as a button that copies it. A click answers twice: the button itself turns to a
 * check, and a toast says what was copied. When the clipboard is out of reach (an insecure origin,
 * some embedded browsers) the toast carries the address to copy by hand.
 */
export function CopyAddressButton({
  address,
  label,
  className,
  text = shortenAddress(address),
}: CopyAddressButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      // Each copy restarts the wait, so a second click keeps the check up its full time.
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
      toast.success({ title: `${label} copied`, description: address });
    } catch {
      toast.error({ title: `Could not copy the ${label.toLowerCase()}`, description: `Copy it by hand: ${address}` });
    }
  }

  return (
    <button
      type="button"
      className={cx(className, copied && 'is-copied')}
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon />}
      <span>{text}</span>
    </button>
  );
}
