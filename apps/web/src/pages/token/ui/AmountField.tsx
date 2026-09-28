import { useState, type CSSProperties } from 'react';
import { cx } from '@/shared/lib';
import { RollingNumber } from '@/shared/ui/rolling-number';
import { amountInput } from '../model/amount-input';
import { amountEms } from './amount-width';

/**
 * The typed amount. At rest it shows rolling digits; while focused it shows the text as typed with
 * a blinking caret where the cursor is, so typing visibly lands. The real input sits on top,
 * transparent, and handles the keys.
 */
export function AmountField({
  id,
  value,
  onChange,
  readOnly,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const syncCaret = (input: HTMLInputElement) => setCaret(input.selectionStart ?? input.value.length);

  return (
    <div
      className="convert-amount-field is-editable"
      // How wide the amount runs, so the font can shrink to keep it inside the field. The caret takes a little room while editing.
      style={{ '--amount-ems': amountEms(value || '0') + (editing ? 0.15 : 0) } as CSSProperties}
    >
      {editing ? (
        <div className="convert-amount-editing" aria-hidden="true">
          <span className={cx('convert-amount-edit-face', !value && 'is-placeholder')}>
            {value.slice(0, caret)}
            {!readOnly && <span className="convert-amount-caret is-inline" />}
            {value ? value.slice(caret) : '0'}
          </span>
        </div>
      ) : (
        <RollingNumber value={value || '0'} className="convert-amount-digits" />
      )}
      <input
        id={id}
        className={cx('convert-amount-input', editing ? 'is-editing' : 'is-hitbox')}
        inputMode="decimal"
        autoComplete="off"
        spellCheck="false"
        placeholder="0"
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(amountInput(event.target.value));
          syncCaret(event.target);
        }}
        onFocus={(event) => {
          setEditing(true);
          syncCaret(event.target);
        }}
        onBlur={() => setEditing(false)}
        onSelect={(event) => syncCaret(event.currentTarget)}
        readOnly={readOnly}
      />
    </div>
  );
}
